import { describe, expect, it } from 'bun:test'

import type { CurationRule } from '@/lib/polymarket/curation'
import type { GammaEvent, GammaMarket } from '@/lib/polymarket/gamma'

import {
  buildCurationIndex,
  decideEvent,
  isListedPolymarketMarket,
  isPlaceholderMarket,
  resolveTagRule,
} from '@/lib/polymarket/curation'

function rule(overrides: Partial<CurationRule> & Pick<CurationRule, 'scope' | 'ref'>): CurationRule {
  return { mode: 'include', pinned: false, parent_ref: null, filters: {}, ...overrides }
}

function market(conditionId: string, overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    id: conditionId,
    conditionId,
    question: `Q ${conditionId}`,
    slug: `m-${conditionId}`,
    clobTokenIds: '["1","2"]',
    outcomes: '["Yes","No"]',
    ...overrides,
  }
}

function event(overrides: Partial<GammaEvent> = {}): GammaEvent {
  return {
    id: '100',
    slug: 'lakers-celtics',
    title: 'Lakers vs. Celtics',
    tags: [
      { id: '1', slug: 'sports', label: 'Sports' },
      { id: '28', slug: 'basketball', label: 'Basketball' },
      { id: '745', slug: 'nba', label: 'NBA' },
    ],
    volume: 1_000_000,
    markets: [
      market('0xwin', { sportsMarketType: 'moneyline' }),
      market('0xprop', { sportsMarketType: 'basketball_odd_even' }),
    ],
    ...overrides,
  }
}

describe('polymarket curation', () => {
  it('shows nothing without a matching include rule', () => {
    const decision = decideEvent(event(), buildCurationIndex([rule({ scope: 'tag', ref: 'crypto' })]))
    expect(decision.visible).toBe(false)
  })

  it('includes an event through a league tag and applies its market-type filter', () => {
    const index = buildCurationIndex([
      rule({ scope: 'tag', ref: 'nba', parent_ref: 'basketball', filters: { marketTypes: ['moneyline'] } }),
    ])
    const decision = decideEvent(event(), index)
    expect(decision.visible).toBe(true)
    expect(decision.markets.map((entry) => entry.conditionId)).toEqual(['0xwin'])
    expect(decision.reason).toBe('tag:nba')
  })

  it('lets a league rule outrank its category rule', () => {
    const index = buildCurationIndex([
      rule({ scope: 'tag', ref: 'sports', mode: 'exclude' }),
      rule({ scope: 'tag', ref: 'nba', parent_ref: 'basketball' }),
    ])
    expect(resolveTagRule(event(), index)?.ref).toBe('nba')
    expect(decideEvent(event(), index).visible).toBe(true)
  })

  it('lets an exclude win a tie at the same level', () => {
    const index = buildCurationIndex([
      rule({ scope: 'tag', ref: 'nba', parent_ref: 'basketball' }),
      rule({ scope: 'tag', ref: 'basketball', parent_ref: 'sports', mode: 'exclude' }),
    ])
    expect(decideEvent(event(), index).visible).toBe(false)
  })

  it('hides one event inside an included league', () => {
    const index = buildCurationIndex([
      rule({ scope: 'tag', ref: 'nba', parent_ref: 'basketball' }),
      rule({ scope: 'event', ref: '100', mode: 'exclude' }),
    ])
    expect(decideEvent(event(), index).visible).toBe(false)
  })

  it('shows a single market from an otherwise hidden event', () => {
    const index = buildCurationIndex([rule({ scope: 'market', ref: '0xprop', parent_ref: '100' })])
    const decision = decideEvent(event(), index)
    expect(decision.visible).toBe(true)
    expect(decision.markets.map((entry) => entry.conditionId)).toEqual(['0xprop'])
    expect(decision.reason).toBe('market')
  })

  it('pins only events pinned by an include rule', () => {
    const index = buildCurationIndex([rule({ scope: 'event', ref: '100', pinned: true })])
    expect(decideEvent(event(), index).pinned).toBe(true)
  })

  it('applies volume and time-window filters for tag rules only', () => {
    const now = Date.parse('2026-10-25T00:00:00Z')
    const far = event({ endDate: '2027-06-01T00:00:00Z', volume: 10 })
    const byTag = buildCurationIndex([rule({ scope: 'tag', ref: 'nba', filters: { windowDays: 14 } })])
    expect(decideEvent(far, byTag, now).visible).toBe(false)
    const byVolume = buildCurationIndex([rule({ scope: 'tag', ref: 'nba', filters: { minVolume: 1000 } })])
    expect(decideEvent(far, byVolume, now).visible).toBe(false)
    const explicit = buildCurationIndex([rule({ scope: 'event', ref: '100' })])
    expect(decideEvent(far, explicit, now).visible).toBe(true)
  })

  it('keeps untyped markets (futures) through a market-type filter and drops archived ones', () => {
    const futures = event({
      markets: [market('0xfuture'), market('0xold', { archived: true })],
    })
    const index = buildCurationIndex([rule({ scope: 'tag', ref: 'nba', filters: { marketTypes: ['moneyline'] } })])
    expect(decideEvent(futures, index).markets.map((entry) => entry.conditionId)).toEqual(['0xfuture'])
  })

  it('drops placeholder slots ("Team A", "Other") until Polymarket launches them', () => {
    const champion = event({
      markets: [
        market('0xarsenal', { groupItemTitle: 'Arsenal', active: true }),
        market('0xresolved', { groupItemTitle: 'Leeds', active: true, closed: true }),
        market('0xteama', { groupItemTitle: 'Team A', active: false, outcomePrices: '["0.5","0.5"]' }),
        market('0xother', { groupItemTitle: 'Other', active: false, outcomePrices: '["0.5","0.5"]' }),
      ],
    })
    const index = buildCurationIndex([rule({ scope: 'tag', ref: 'nba' })])
    expect(decideEvent(champion, index).markets.map((entry) => entry.conditionId)).toEqual(['0xarsenal', '0xresolved'])

    const onlyPlaceholders = event({ markets: [market('0xteamb', { active: false })] })
    expect(decideEvent(onlyPlaceholders, index).visible).toBe(false)
  })

  it('does not let a market rule include a placeholder slot', () => {
    const index = buildCurationIndex([rule({ scope: 'market', ref: '0xteama', parent_ref: '100' })])
    const decision = decideEvent(event({ markets: [market('0xteama', { active: false })] }), index)
    expect(decision.visible).toBe(false)
  })

  it('treats markets without an active flag as listable', () => {
    expect(isPlaceholderMarket({})).toBe(false)
    expect(isPlaceholderMarket({ active: true })).toBe(false)
    expect(isPlaceholderMarket({ active: false })).toBe(true)
  })

  it('lists stored markets unless they are inactive and unresolved', () => {
    expect(isListedPolymarketMarket({ is_active: true, is_resolved: false })).toBe(true)
    expect(isListedPolymarketMarket({ is_active: false, is_resolved: true })).toBe(true)
    expect(isListedPolymarketMarket({ is_active: false, is_resolved: false })).toBe(false)
    expect(isListedPolymarketMarket({ is_active: null, is_resolved: null })).toBe(true)
  })
})
