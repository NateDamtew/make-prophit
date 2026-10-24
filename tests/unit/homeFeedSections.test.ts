import { describe, expect, it } from 'bun:test'

import type { Event, Market } from '@/types'

import { buildHomeFeed, buildHomeFeedMarketCard, isUpDownMarket, resolveTickerLabel } from '@/lib/home-feed-sections'
import { resolveLeadingDirection } from '@/lib/home-feed-types'

interface MarketOverrides extends Partial<Market> {
  outcomeLabels?: [string, string]
}

function buildMarket(
  conditionId: string,
  price: number,
  { outcomeLabels = ['Yes', 'No'], ...overrides }: MarketOverrides = {},
) {
  return {
    condition_id: conditionId,
    question_id: `${conditionId}-question`,
    event_id: 'event',
    title: `Market ${conditionId}`,
    slug: `market-${conditionId}`,
    icon_url: '',
    is_active: true,
    is_resolved: false,
    block_number: 0,
    block_timestamp: '2026-10-24T00:00:00.000Z',
    volume_24h: 100,
    volume: 1_000,
    created_at: '2026-10-24T00:00:00.000Z',
    updated_at: '2026-10-24T00:00:00.000Z',
    price,
    probability: price,
    outcomes: outcomeLabels.map((label, index) => ({
      condition_id: conditionId,
      outcome_text: label,
      outcome_index: index,
      token_id: `${conditionId}-${index}`,
      is_winning_outcome: false,
      buy_price: price,
      created_at: '2026-10-24T00:00:00.000Z',
      updated_at: '2026-10-24T00:00:00.000Z',
    })),
    condition: {
      id: conditionId,
      oracle: '',
      question_id: `${conditionId}-question`,
      outcome_slot_count: 2,
      resolved: false,
      volume: 1_000,
      open_interest: 0,
      active_positions_count: 0,
      created_at: '2026-10-24T00:00:00.000Z',
      updated_at: '2026-10-24T00:00:00.000Z',
    },
    ...overrides,
  } as Market
}

function buildEvent(id: string, overrides: Partial<Event> = {}): Event {
  return {
    id,
    slug: `event-${id}`,
    title: `Event ${id}`,
    creator: '',
    icon_url: '',
    show_market_icons: false,
    status: 'active',
    active_markets_count: 1,
    total_markets_count: 1,
    volume: 10_000,
    end_date: '2026-12-31T00:00:00.000Z',
    created_at: '2026-10-24T00:00:00.000Z',
    updated_at: '2026-10-24T00:00:00.000Z',
    markets: [buildMarket(`${id}-m1`, 0.43)],
    tags: [{ id: 1, name: 'Politics', slug: 'politics', isMainCategory: true }],
    main_tag: 'politics',
    is_bookmarked: false,
    is_trending: false,
    ...overrides,
  }
}

const EMPTY_NEWS = { stories: [], outlets: [], isPlaceholder: true }

describe('home-feed-sections', () => {
  it('shows the leading direction with its own probability', () => {
    expect(resolveLeadingDirection(71)).toEqual({ direction: 'up', chance: 71 })
    expect(resolveLeadingDirection(47)).toEqual({ direction: 'down', chance: 53 })
    expect(resolveLeadingDirection(50)).toEqual({ direction: 'up', chance: 50 })
    expect(resolveLeadingDirection(null)).toBeNull()
  })

  it('detects Up/Down markets from outcome labels or the title', () => {
    expect(isUpDownMarket(buildMarket('m', 0.5, { outcomeLabels: ['Up', 'Down'] }), 'Anything')).toBe(true)
    expect(isUpDownMarket(buildMarket('m', 0.5), 'Gold (XAUUSD) Up or Down on October 26?')).toBe(true)
    expect(isUpDownMarket(buildMarket('m', 0.5), 'Who will Trump endorse?')).toBe(false)
  })

  it('derives ticker tiles from crypto assets, parenthesised symbols or the first word', () => {
    expect(
      resolveTickerLabel(buildEvent('btc', { title: 'Bitcoin Up or Down 4h', main_tag: 'crypto', tags: [] })),
    ).toBe('BTC')
    expect(resolveTickerLabel(buildEvent('gold', { title: 'Gold (XAUUSD) Up or Down on August 31?' }))).toBe('XAUU')
    expect(resolveTickerLabel(buildEvent('trump', { title: 'Trump approval Up or Down this week?' }))).toBe('TRU')
  })

  it('builds a binary card with the Yes chance and outcome links', () => {
    const card = buildHomeFeedMarketCard(buildEvent('a'), 'en')

    expect(card.chance).toBe(43)
    expect(card.outcomes).toEqual([])
    expect(card.href).toBe('/event/event-a')
    expect(card.yesHref).toContain('/event/event-a')
    expect(card.category).toBe('Politics')
    expect(card.isUpDown).toBe(false)
  })

  it('builds outcome rows sorted by chance for multi-market events', () => {
    const event = buildEvent('multi', {
      total_markets_count: 3,
      markets: [
        buildMarket('low', 0.02, { title: 'Lula da Silva' }),
        buildMarket('high', 0.18, { title: 'Flávio Bolsonaro' }),
        buildMarket('mid', 0.1, { title: 'Someone else' }),
      ],
    })
    const card = buildHomeFeedMarketCard(event, 'en')

    expect(card.chance).toBeNull()
    expect(card.outcomes.map((outcome) => outcome.label)).toEqual(['Flávio Bolsonaro', 'Someone else'])
    expect(card.outcomes[0]?.chance).toBe(18)
  })

  it('leaves the chance empty when a market has no pricing signal', () => {
    const unpriced = buildMarket('unpriced', 0, { volume: 0, volume_24h: 0 })
    unpriced.condition.volume = 0
    unpriced.outcomes = unpriced.outcomes.map((outcome) => ({ ...outcome, buy_price: undefined }))
    const card = buildHomeFeedMarketCard(buildEvent('unpriced', { markets: [unpriced] }), 'en')

    expect(card.chance).toBeNull()
  })

  it('dedupes feed sections and keeps rankings for the sidebar', () => {
    const brazil = buildEvent('brazil', { volume: 74_000 })
    const lid = buildEvent('lid', { volume: 72_000 })
    const emmys = buildEvent('emmys', { volume: 17_000, main_tag: 'culture', tags: [] })
    const approval = buildEvent('approval', { volume: 192 })
    const gold = buildEvent('gold', {
      volume: 2_000,
      title: 'Gold (XAUUSD) Up or Down on August 31?',
      main_tag: 'finance',
      tags: [{ id: 2, name: 'Finance', slug: 'finance', isMainCategory: true }],
      has_live_chart: true,
      markets: [buildMarket('gold-m', 0.47, { outcomeLabels: ['Up', 'Down'] })],
    })

    const feed = buildHomeFeed({
      trending: [brazil, lid, emmys, gold],
      crypto: [],
      finance: [gold],
      politics: [brazil, lid, approval],
      sports: [],
      communities: [
        {
          id: 'c1',
          slug: 'prophit-kenya',
          name: 'Prophit Kenya',
          icon_url: null,
          type: 'public',
          member_count: 12,
          market_count: 4,
        },
      ],
      news: EMPTY_NEWS,
      locale: 'en',
    })

    expect(feed.topStories.map((card) => card.id)).toEqual(['brazil', 'lid', 'emmys'])
    expect(feed.finance.map((card) => card.id)).toEqual(['gold'])
    expect(feed.politics.map((card) => card.id)).toEqual(['approval'])
    expect(feed.liveNow.map((item) => item.id)).toEqual(['gold'])
    expect(feed.mostTraded.map((item) => item.id)).toEqual(['brazil', 'lid', 'emmys', 'gold', 'approval'])
    expect(feed.breakingNews).toHaveLength(3)
    expect(feed.breakingNews[0]?.change).toBeNull()
    expect(feed.communities[0]).toMatchObject({ href: '/community/prophit-kenya', isOpen: true, marketCount: 4 })
    expect(feed.sports).toEqual([])
    expect(feed.news).toBe(EMPTY_NEWS)
  })

  it('skips resolved events everywhere', () => {
    const resolved = buildEvent('resolved', { status: 'resolved' })
    const feed = buildHomeFeed({
      trending: [resolved],
      crypto: [resolved],
      finance: [],
      politics: [resolved],
      sports: [],
      communities: [],
      news: EMPTY_NEWS,
      locale: 'en',
    })

    expect(feed.topStories).toEqual([])
    expect(feed.cryptoUpDown).toEqual([])
    expect(feed.politics).toEqual([])
    expect(feed.mostTraded).toEqual([])
  })
})
