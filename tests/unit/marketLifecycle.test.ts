import { describe, expect, it } from 'bun:test'

import type { PoolSummary } from '@/lib/pools/service'

import { deriveMarketLifecycle } from '@/app/[locale]/(platform)/community/[slug]/market/[marketId]/_components/pool/market-lifecycle'

const NOW = new Date('2026-12-10T12:00:00Z').getTime()
const HOUR = 60 * 60 * 1000

function market(overrides: Partial<Parameters<typeof deriveMarketLifecycle>[0]['market']> = {}) {
  return {
    id: 'm1',
    title: 'Will petrol pass 200?',
    description: null,
    image_url: null,
    resolution_source: null,
    resolution_rules: null,
    resolution_date: new Date(NOW + 3 * 24 * HOUR),
    status: 'active',
    resolved_outcome: null,
    resolved_at: null,
    event_id: null,
    engine: 'pool',
    created_at: new Date(NOW - 24 * HOUR),
    ...overrides,
  }
}

function summary(pool: Partial<PoolSummary['pool']> = {}, user: PoolSummary['user'] = null): PoolSummary {
  return {
    pool: {
      id: 'p1',
      state: 'open',
      currency: 'KES',
      rakeBps: 700,
      closesAt: new Date(NOW + 3 * 24 * HOUR).toISOString(),
      totalYes: '2995000',
      totalNo: '1835000',
      stakeCount: 214,
      settledOutcome: null,
      settledAt: null,
      odds: { yes: 0.62, no: 0.38 },
      acceptingStakes: true,
      resultAnnouncedAt: null,
      holdUntil: null,
      holdExtendedUntil: null,
      payoutsFrozen: false,
      releasedAt: null,
      isImported: false,
      ownerShareBps: 4000,
      juryShareBps: 2000,
      ...pool,
    },
    user,
    minStakeMinor: '2000',
    caps: { maxPerPersonMinor: '200000', maxPoolPerMarketMinor: '2000000' },
    level: 1,
    holdHours: 24,
  }
}

const viewer: NonNullable<PoolSummary['user']> = {
  currency: 'KES',
  availableMinor: '60000',
  stakes: [{ id: 's1', outcome: 'yes', amountMinor: '100000', payoutMinor: null, createdAt: '' }],
  totalYes: '100000',
  totalNo: '0',
  totalPayout: null,
  stakeCapRemainingMinor: '100000',
}

const base = { votes: [], jurySize: 5, juryRequired: 3, now: NOW }

describe('market lifecycle', () => {
  it('is open with live odds while stakes are accepted', () => {
    const lc = deriveMarketLifecycle({ ...base, market: market(), summary: summary() })
    expect(lc.phase).toBe('open')
    expect(lc.chance).toBeCloseTo(0.62)
    expect(lc.poolMinor).toBe(4_830_000n)
    expect(lc.viewer.stake).toBeNull()
  })

  it('turns to closing inside the last two hours and to awaiting after close', () => {
    const closesAt = new Date(NOW + HOUR).toISOString()
    expect(deriveMarketLifecycle({ ...base, market: market(), summary: summary({ closesAt }) }).phase).toBe('closing')
    const closed = summary({ closesAt: new Date(NOW - HOUR).toISOString(), state: 'closed', acceptingStakes: false })
    expect(deriveMarketLifecycle({ ...base, market: market(), summary: closed }).phase).toBe('awaiting')
  })

  it('holds after the result and knows what the viewer is owed', () => {
    const held = summary(
      {
        state: 'held',
        acceptingStakes: false,
        settledOutcome: 'yes',
        resultAnnouncedAt: new Date(NOW - 6 * HOUR).toISOString(),
        holdUntil: new Date(NOW + 18 * HOUR).toISOString(),
      },
      { ...viewer, totalPayout: '147000', stakes: [{ ...viewer.stakes[0]!, payoutMinor: '147000' }] },
    )
    const lc = deriveMarketLifecycle({
      ...base,
      market: market({ status: 'resolved', resolved_outcome: 'yes' }),
      summary: held,
    })
    expect(lc.phase).toBe('hold')
    expect(lc.outcome).toBe('yes')
    expect(lc.hold?.paysAt).toBe(NOW + 18 * HOUR)
    expect(lc.viewer.result).toBe('won')
    expect(lc.viewer.stake?.payoutMinor).toBe(147_000n)
  })

  it('shows review while payouts are frozen and settled once released', () => {
    const frozen = summary({ state: 'held', acceptingStakes: false, settledOutcome: 'yes', payoutsFrozen: true })
    expect(
      deriveMarketLifecycle({
        ...base,
        market: market({ status: 'resolved', resolved_outcome: 'yes' }),
        summary: frozen,
      }).phase,
    ).toBe('review')
    const paid = summary(
      { state: 'settled', acceptingStakes: false, settledOutcome: 'no', releasedAt: new Date(NOW).toISOString() },
      { ...viewer, totalPayout: '0' },
    )
    const lc = deriveMarketLifecycle({
      ...base,
      market: market({ status: 'resolved', resolved_outcome: 'no' }),
      summary: paid,
    })
    expect(lc.phase).toBe('settled')
    expect(lc.viewer.result).toBe('lost')
  })

  it('refunds voided markets, and knows a late jury from a void', () => {
    const cancelled = summary(
      { state: 'cancelled', acceptingStakes: false, settledOutcome: 'cancelled' },
      {
        ...viewer,
        totalPayout: '100000',
      },
    )
    const voided = deriveMarketLifecycle({
      ...base,
      market: market({ status: 'disputed', resolved_outcome: 'cancelled' }),
      summary: cancelled,
    })
    expect(voided.phase).toBe('refunded')
    expect(voided.refundReason).toBe('voided')
    expect(voided.viewer.result).toBe('refunded')
    const late = deriveMarketLifecycle({
      ...base,
      market: market({ status: 'cancelled', resolved_outcome: 'cancelled', resolution_date: new Date(NOW - HOUR) }),
      summary: cancelled,
    })
    expect(late.refundReason).toBe('late')
  })

  it('marks imported markets by their pool', () => {
    expect(deriveMarketLifecycle({ ...base, market: market(), summary: summary({ isImported: true }) }).source).toBe(
      'imported',
    )
  })
})
