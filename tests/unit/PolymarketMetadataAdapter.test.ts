import { describe, expect, it } from 'bun:test'

import type { GammaEvent, GammaMarket } from '@/lib/polymarket/gamma'

import {
  buildExternalMarketEntries,
  collectSettledMarkets,
  fingerprintMarketEntry,
  POLYMARKET_SOURCE_CREATOR,
  resolveSettledPrice,
  toProphitSlug,
} from '@/lib/polymarket/metadata-adapter'

const game: GammaEvent = {
  id: '1208440',
  slug: 'nba-bkn-cle-2026-10-24',
  title: 'Nets vs. Cavaliers',
  description: 'Rules…',
  icon: 'https://example.com/icon.png',
  endDate: '2026-10-24T23:30:00Z',
  createdAt: '2026-10-18T00:51:14Z',
  updatedAt: '2026-10-24T10:00:00Z',
  gameId: 20023982,
  startTime: '2026-10-24T23:30:00Z',
  eventDate: '2026-10-24',
  seriesSlug: 'nba-2026',
  sport: 'nba',
  tags: [
    { id: '1', slug: 'sports', label: 'Sports' },
    { id: '745', slug: 'nba', label: 'NBA' },
  ],
  teams: [
    { name: 'Nets', abbreviation: 'bkn', logo: 'https://example.com/bkn.png', league: 'nba', ordering: 'away' },
    { name: 'Cavaliers', abbreviation: 'cle', logo: 'https://example.com/cle.png', league: 'nba', ordering: 'home' },
  ],
}

const moneyline: GammaMarket = {
  id: '555',
  conditionId: '0xabc',
  questionID: '0xq',
  question: 'Nets vs. Cavaliers',
  slug: 'nba-bkn-cle-2026-10-24',
  outcomes: '["Nets", "Cavaliers"]',
  clobTokenIds: '["111", "222"]',
  sportsMarketType: 'moneyline',
  gameStartTime: '2026-10-24 23:30:00+00',
  resolvedBy: '0x69C47De9D4D3Dad79590d61b9e05918E03775f24',
  createdAt: '2026-10-18T00:51:14Z',
  updatedAt: '2026-10-24T10:00:00Z',
}

describe('polymarket metadata adapter', () => {
  it('maps a game market into the Kuest metadata shape', () => {
    const [entry] = buildExternalMarketEntries(game, [moneyline])
    expect(entry.condition.id).toBe('0xabc')
    expect(entry.condition.creator).toBe(POLYMARKET_SOURCE_CREATOR)
    expect(entry.condition.oracle).toBe('0x69c47de9d4d3dad79590d61b9e05918e03775f24')
    expect(entry.condition.resolved).toBe(false)
    expect(entry.condition.creationTimestamp).toBe(String(Date.parse('2026-10-18T00:51:14Z') / 1000))
    expect(entry.metadata.slug).toBe(toProphitSlug('nba-bkn-cle-2026-10-24'))
    expect(entry.metadata.event.slug).toBe('pm-nba-bkn-cle-2026-10-24')
    expect(entry.metadata.event.tags).toEqual(['Sports', 'NBA'])
    expect(entry.metadata.outcomes).toEqual([
      { outcome: 'Nets', token_id: '111' },
      { outcome: 'Cavaliers', token_id: '222' },
    ])
    expect(entry.metadata.sports.market.sports_market_type).toBe('moneyline')
    expect(entry.metadata.sports.event.teams[0]).toMatchObject({
      name: 'Nets',
      logo_url: 'https://example.com/bkn.png',
    })
    // Never flagged as a Kuest mirror: the token ids are Polymarket's own.
    expect(entry.metadata.mirror_condition_id).toBeUndefined()
  })

  it('skips markets whose outcomes and token ids do not line up', () => {
    expect(buildExternalMarketEntries(game, [{ ...moneyline, clobTokenIds: '["111"]' }])).toEqual([])
  })

  it('leaves non-game events without sports metadata', () => {
    const futures: GammaEvent = { ...game, gameId: null, startTime: null, teams: null }
    const [entry] = buildExternalMarketEntries(futures, [{ ...moneyline, sportsMarketType: null }])
    expect(entry.metadata.sports).toBeUndefined()
  })

  it('reads a settled price only from final outcome prices', () => {
    expect(resolveSettledPrice({ closed: false, outcomePrices: '["1","0"]' })).toBeNull()
    expect(resolveSettledPrice({ closed: true, outcomePrices: '["1","0"]' })).toBe(1)
    expect(resolveSettledPrice({ closed: true, outcomePrices: '["0","1"]' })).toBe(0)
    expect(resolveSettledPrice({ closed: true, outcomePrices: '["0.5","0.5"]' })).toBe(0.5)
    expect(resolveSettledPrice({ closed: true, outcomePrices: '["0.62","0.38"]' })).toBeNull()
  })

  it('collects settled markets and fully settled events, whatever their visibility', () => {
    const settledGame: GammaEvent = {
      ...game,
      markets: [
        { ...moneyline, closed: true, outcomePrices: '["0","1"]' },
        { ...moneyline, conditionId: '0xdef', closed: true, outcomePrices: '["1","0"]' },
      ],
    }
    const liveGame: GammaEvent = {
      ...game,
      id: '1208441',
      markets: [
        { ...moneyline, conditionId: '0x111', closed: true, outcomePrices: '["1","0"]' },
        { ...moneyline, conditionId: '0x222', closed: false, outcomePrices: '["0.4","0.6"]' },
      ],
    }
    const empty: GammaEvent = { ...game, id: '1208442', markets: [] }

    const { settled, fullySettledEventIds } = collectSettledMarkets([settledGame, liveGame, empty])
    expect(settled).toEqual([
      { conditionId: '0xabc', price: 0 },
      { conditionId: '0xdef', price: 1 },
      { conditionId: '0x111', price: 1 },
    ])
    expect(fullySettledEventIds).toEqual(['1208440'])
  })

  it('fingerprints a market by what the import writes, not by Gamma timestamps', () => {
    function fingerprint(event: GammaEvent, market: GammaMarket, nowMs = 1) {
      return fingerprintMarketEntry(buildExternalMarketEntries(event, [market], nowMs)[0])
    }
    const base = fingerprint(game, moneyline)

    expect(fingerprint(game, { ...moneyline, updatedAt: '2026-10-25T09:00:00Z' })).toBe(base)
    // Without any createdAt the creation time falls back to "now", which must not count as a change.
    const undated = { ...game, createdAt: undefined }
    const undatedMarket = { ...moneyline, createdAt: undefined }
    expect(fingerprint(undated, undatedMarket, 1_000)).toBe(fingerprint(undated, undatedMarket, 9_000_000))
    expect(fingerprint(game, { ...moneyline, question: 'Nets vs. Cavs' })).not.toBe(base)
    expect(fingerprint(game, { ...moneyline, closed: true, outcomePrices: '["1","0"]' })).not.toBe(base)
    expect(fingerprint({ ...game, score: '101-99' }, moneyline)).not.toBe(base)
  })
})
