import { describe, expect, it } from 'bun:test'

import type { Event } from '@/types'

import {
  isLiveUpDownEvent,
  resolveHomeFeaturedTargetMode,
  selectHomeFeaturedFallbackEvents,
} from '@/lib/home-featured-fallback'

interface BuildEventOptions extends Partial<Event> {
  outcomeLabels?: [string, string]
  volume24h?: number
}

function buildEvent(
  id: string,
  { outcomeLabels = ['Up', 'Down'], volume24h = 0, ...overrides }: BuildEventOptions = {},
) {
  return {
    id,
    slug: `event-${id}`,
    title: `Event ${id}`,
    status: 'active',
    volume: 0,
    series_slug: null,
    has_live_chart: false,
    created_at: '2026-10-24T00:00:00.000Z',
    updated_at: '2026-10-24T00:00:00.000Z',
    tags: [],
    markets: [
      {
        condition_id: `${id}-m`,
        is_resolved: false,
        volume_24h: volume24h,
        condition: { resolved: false },
        outcomes: outcomeLabels.map((label, index) => ({ outcome_text: label, outcome_index: index })),
      },
    ],
    ...overrides,
  } as unknown as Event
}

describe('home-featured-fallback', () => {
  it('recognises live Up/Down events by chart, title or outcomes', () => {
    expect(isLiveUpDownEvent(buildEvent('chart', { outcomeLabels: ['Yes', 'No'], has_live_chart: true }))).toBe(true)
    expect(isLiveUpDownEvent(buildEvent('title', { outcomeLabels: ['Yes', 'No'], title: 'Gold Up or Down?' }))).toBe(
      true,
    )
    expect(isLiveUpDownEvent(buildEvent('outcomes'))).toBe(true)
    expect(isLiveUpDownEvent(buildEvent('plain', { outcomeLabels: ['Yes', 'No'] }))).toBe(false)
    expect(isLiveUpDownEvent(buildEvent('resolved', { status: 'resolved' }))).toBe(false)
  })

  it('ranks live-chart series first, then by 24h volume, one per series', () => {
    const selected = selectHomeFeaturedFallbackEvents(
      [
        buildEvent('quiet', { volume24h: 10 }),
        buildEvent('yesno', { outcomeLabels: ['Yes', 'No'], volume24h: 999 }),
        buildEvent('eth-old', { series_slug: 'eth-4h', volume24h: 50, has_live_chart: true }),
        buildEvent('eth-new', { series_slug: 'eth-4h', volume24h: 500, has_live_chart: true }),
        buildEvent('busy', { volume24h: 800 }),
        buildEvent('btc', { series_slug: 'btc-4h', volume24h: 5, has_live_chart: true }),
      ],
      3,
    )

    expect(selected.map((event) => event.id)).toEqual(['eth-new', 'btc', 'busy'])
  })

  it('returns nothing when no live Up/Down event exists', () => {
    expect(selectHomeFeaturedFallbackEvents([buildEvent('yesno', { outcomeLabels: ['Yes', 'No'] })])).toEqual([])
  })

  it('uses the fallback whenever the configured list yields no targets', () => {
    expect(resolveHomeFeaturedTargetMode({ enabled: true, configuredTargetCount: 2 })).toBe('configured')
    expect(resolveHomeFeaturedTargetMode({ enabled: true, configuredTargetCount: 0 })).toBe('fallback')
    expect(resolveHomeFeaturedTargetMode({ enabled: false, configuredTargetCount: 0 })).toBe('fallback')
    expect(resolveHomeFeaturedTargetMode({ enabled: false, configuredTargetCount: 3 })).toBe('fallback')
  })
})
