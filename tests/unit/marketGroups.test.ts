import { describe, expect, test } from 'bun:test'

import type { PresetMarket } from '@/app/[locale]/(platform)/community/[slug]/_components/presets/types'

import {
  groupByCloseDay,
  groupMarkets,
  leadMarket,
} from '@/app/[locale]/(platform)/community/[slug]/_components/home/market-groups'

const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 29, 12, 0, 0)

function market(overrides: Partial<PresetMarket> & { id: string }): PresetMarket {
  return {
    title: overrides.id,
    description: null,
    resolution_source: null,
    resolution_rules: null,
    status: 'active',
    resolved_outcome: null,
    resolution_date: new Date(NOW + 5 * 24 * HOUR),
    event_id: null,
    created_at: new Date(NOW - 24 * HOUR),
    pool: {
      poolId: `pool-${overrides.id}`,
      state: 'open',
      currency: 'KES',
      totalYesMinor: '100000',
      totalNoMinor: '50000',
      stakeCount: 3,
      yesChance: 66.7,
      settledOutcome: null,
    },
    ...overrides,
  }
}

describe('groupMarkets', () => {
  test('open, closing, deciding, held and resolved', () => {
    const groups = groupMarkets(
      [
        market({ id: 'a' }),
        market({ id: 'b', resolution_date: new Date(NOW + 3 * HOUR) }),
        market({ id: 'c', resolution_date: new Date(NOW - HOUR) }),
        market({ id: 'd', pool: { ...market({ id: 'd' }).pool!, state: 'closed' } }),
        market({ id: 'e', pool: { ...market({ id: 'e' }).pool!, state: 'held' } }),
        market({ id: 'f', status: 'resolved', resolved_outcome: 'yes' }),
        market({ id: 'g', status: 'cancelled' }),
      ],
      NOW,
    )
    expect(groups.open.map((m) => m.id)).toEqual(['a'])
    expect(groups.closing.map((m) => m.id)).toEqual(['b'])
    expect(groups.deciding.map((m) => m.id).sort()).toEqual(['c', 'd'])
    expect(groups.held.map((m) => m.id)).toEqual(['e'])
    expect(groups.resolved.map((m) => m.id).sort()).toEqual(['f', 'g'])
  })
})

describe('groupMarkets', () => {
  test('sorts open by pool size and closing by close time', () => {
    const groups = groupMarkets(
      [
        market({ id: 'small', pool: { ...market({ id: 'small' }).pool!, totalYesMinor: '1000', totalNoMinor: '0' } }),
        market({ id: 'big' }),
        market({ id: 'later', resolution_date: new Date(NOW + 40 * HOUR) }),
        market({ id: 'sooner', resolution_date: new Date(NOW + 2 * HOUR) }),
      ],
      NOW,
    )
    expect(groups.open.map((m) => m.id)).toEqual(['big', 'small'])
    expect(groups.closing.map((m) => m.id)).toEqual(['sooner', 'later'])
  })
})

describe('leadMarket', () => {
  test('prefers the pinned market, then the biggest live pool', () => {
    const list = [
      market({ id: 'resolved', status: 'resolved', resolved_outcome: 'no' }),
      market({ id: 'small', pool: { ...market({ id: 'small' }).pool!, totalYesMinor: '10', totalNoMinor: '0' } }),
      market({ id: 'big' }),
    ]
    expect(leadMarket(list, NOW)?.id).toBe('big')
    expect(leadMarket(list, NOW, 'small')?.id).toBe('small')
    expect(leadMarket(list, NOW, 'missing')?.id).toBe('big')
    expect(leadMarket([list[0]!], NOW)).toBeNull()
  })
})

describe('groupByCloseDay', () => {
  test('groups by calendar day in close order', () => {
    const days = groupByCloseDay(
      [
        market({ id: 'thu', resolution_date: new Date(Date.UTC(2026, 10, 5, 18)) }),
        market({ id: 'wed', resolution_date: new Date(Date.UTC(2026, 10, 4, 18)) }),
        market({ id: 'wed2', resolution_date: new Date(Date.UTC(2026, 10, 4, 20)) }),
      ],
      'en-US',
    )
    expect(days.map((day) => day.markets.map((m) => m.id))).toEqual([['wed', 'wed2'], ['thu']])
  })
})
