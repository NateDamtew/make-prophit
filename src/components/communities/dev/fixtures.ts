import type { PoolSummary } from '@/lib/pools/service'

/**
 * Preview fixtures for the market page: `?preview=<state>` outside
 * production swaps in a summary / votes / market shaped for that state so
 * every screen can be opened in a browser before the data exists.
 */

const MARKET_PREVIEW_STATES = [
  'open',
  'empty',
  'closing',
  'awaiting',
  'hold',
  'review',
  'won',
  'lost',
  'settled',
  'refunded',
  'late',
  'imported',
] as const

export type MarketPreviewState = (typeof MARKET_PREVIEW_STATES)[number]

export function isMarketPreviewState(value: string | undefined): value is MarketPreviewState {
  return value !== undefined && (MARKET_PREVIEW_STATES as readonly string[]).includes(value)
}

interface PreviewMarketLike {
  status: string
  resolved_outcome: string | null
  resolved_at: Date | null
  resolution_date: Date | null
}

interface PreviewVoteLike {
  id: string
  vote: string
  reasoning: string
  evidence_url: string | null
  voted_at: Date
  juror_username: string | null
  juror_image: string | null
  juror_id?: string
}

const HOUR = 60 * 60 * 1000

function baseSummary(now: number, currency: string, userId: string | null): PoolSummary {
  return {
    pool: {
      id: 'preview-pool',
      state: 'open',
      currency,
      rakeBps: 700,
      closesAt: new Date(now + 3 * 24 * HOUR).toISOString(),
      totalYes: '2990000',
      totalNo: '1840000',
      stakeCount: 212,
      settledOutcome: null,
      settledAt: null,
      odds: { yes: 0.619, no: 0.381 },
      acceptingStakes: true,
      resultAnnouncedAt: null,
      holdUntil: null,
      holdExtendedUntil: null,
      payoutsFrozen: false,
      releasedAt: null,
      isImported: false,
      ownerShareBps: 4000,
      juryShareBps: 2000,
    },
    user: userId
      ? {
          currency,
          availableMinor: '350000',
          consentRequired: false,
          stakes: [],
          totalYes: '0',
          totalNo: '0',
          totalPayout: null,
          stakeCapRemainingMinor: '200000',
        }
      : null,
    minStakeMinor: '2000',
    caps: { maxPerPersonMinor: '200000', maxPoolPerMarketMinor: '20000000' },
    level: 1,
    holdHours: 24,
  }
}

function withStake(summary: PoolSummary, now: number, side: 'yes' | 'no', payout: string | null): PoolSummary {
  if (!summary.user) {
    return summary
  }
  return {
    ...summary,
    user: {
      ...summary.user,
      stakes: [
        {
          id: 'preview-stake',
          outcome: side,
          amountMinor: '50000',
          payoutMinor: payout,
          createdAt: new Date(now - 26 * HOUR).toISOString(),
        },
      ],
      totalYes: side === 'yes' ? '50000' : '0',
      totalNo: side === 'no' ? '50000' : '0',
      totalPayout: payout,
      stakeCapRemainingMinor: '150000',
    },
  }
}

function previewVotes(now: number, outcome: 'yes' | 'no'): PreviewVoteLike[] {
  const other = outcome === 'yes' ? 'no' : 'yes'
  return [
    {
      id: 'preview-vote-1',
      vote: outcome,
      reasoning:
        'The official result sheet published by the organiser lists the final score, and the source named in the rules confirms it. Nothing in the rules excludes this result.',
      evidence_url: 'https://example.com/result',
      voted_at: new Date(now - 20 * HOUR),
      juror_username: 'wanjiru',
      juror_image: null,
      juror_id: 'preview-juror-1',
    },
    {
      id: 'preview-vote-2',
      vote: outcome,
      reasoning:
        'Checked the broadcaster’s live blog and the federation statement; both agree. The question is answered as written, so this is the verdict.',
      evidence_url: 'https://example.com/statement',
      voted_at: new Date(now - 19 * HOUR),
      juror_username: 'kevo',
      juror_image: null,
      juror_id: 'preview-juror-2',
    },
    {
      id: 'preview-vote-3',
      vote: other,
      reasoning:
        'I read the rules as requiring the result to stand after any protest window. The federation has not closed the protest period yet, so I would wait.',
      evidence_url: null,
      voted_at: new Date(now - 18 * HOUR),
      juror_username: 'amina',
      juror_image: null,
      juror_id: 'preview-juror-3',
    },
  ]
}

export function applyMarketPreview<M extends PreviewMarketLike>(
  state: MarketPreviewState,
  input: { market: M; summary: PoolSummary | null; votes: PreviewVoteLike[]; userId: string | null; now: number },
): { market: M; summary: PoolSummary; votes: PreviewVoteLike[] } {
  const { now, userId } = input
  const currency = input.summary?.pool.currency ?? 'KES'
  const summary = baseSummary(now, currency, userId)
  const market: M = { ...input.market, status: 'active', resolved_outcome: null, resolved_at: null }
  const announced = now - 6 * HOUR
  function held(frozen: boolean): PoolSummary['pool'] {
    return {
      ...summary.pool,
      state: 'held',
      closesAt: new Date(now - 30 * HOUR).toISOString(),
      acceptingStakes: false,
      settledOutcome: 'yes',
      resultAnnouncedAt: new Date(announced).toISOString(),
      holdUntil: new Date(announced + 24 * HOUR).toISOString(),
      payoutsFrozen: frozen,
    }
  }

  switch (state) {
    case 'open':
      return { market, summary: withStake(summary, now, 'yes', '80700'), votes: [] }
    case 'empty':
      return {
        market,
        summary: {
          ...summary,
          pool: { ...summary.pool, totalYes: '0', totalNo: '0', stakeCount: 0, odds: { yes: 0.5, no: 0.5 } },
        },
        votes: [],
      }
    case 'closing':
      return {
        market: { ...market, resolution_date: new Date(now + 90 * 60 * 1000) },
        summary: { ...summary, pool: { ...summary.pool, closesAt: new Date(now + 42 * 60 * 1000).toISOString() } },
        votes: [],
      }
    case 'awaiting':
      return {
        market: { ...market, resolution_date: new Date(now + 20 * HOUR) },
        summary: withStake(
          {
            ...summary,
            pool: {
              ...summary.pool,
              state: 'closed',
              closesAt: new Date(now - 2 * HOUR).toISOString(),
              acceptingStakes: false,
            },
          },
          now,
          'yes',
          null,
        ),
        votes: previewVotes(now, 'yes').slice(0, 1),
      }
    case 'hold':
      return {
        market: { ...market, status: 'resolved', resolved_outcome: 'yes', resolved_at: new Date(announced) },
        summary: withStake({ ...summary, pool: held(false) }, now, 'yes', '80700'),
        votes: previewVotes(now, 'yes'),
      }
    case 'review':
      return {
        market: { ...market, status: 'resolved', resolved_outcome: 'yes', resolved_at: new Date(announced) },
        summary: withStake({ ...summary, pool: held(true) }, now, 'no', '0'),
        votes: previewVotes(now, 'yes'),
      }
    case 'won':
    case 'settled':
    case 'lost': {
      const side = state === 'lost' ? 'no' : 'yes'
      const settled: PoolSummary['pool'] = {
        ...held(false),
        state: 'settled',
        settledAt: new Date(announced + 24 * HOUR).toISOString(),
        releasedAt: new Date(announced + 24 * HOUR).toISOString(),
        resultAnnouncedAt: new Date(now - 40 * HOUR).toISOString(),
        holdUntil: new Date(now - 16 * HOUR).toISOString(),
      }
      const base = { ...summary, pool: settled }
      return {
        market: { ...market, status: 'resolved', resolved_outcome: 'yes', resolved_at: new Date(now - 40 * HOUR) },
        summary:
          state === 'settled'
            ? { ...base, user: base.user ? { ...base.user, stakes: [] } : null }
            : withStake(base, now, side, side === 'yes' ? '147000' : '0'),
        votes: previewVotes(now, 'yes'),
      }
    }
    case 'refunded':
      return {
        market: {
          ...market,
          status: 'cancelled',
          resolved_outcome: 'cancelled',
          resolved_at: new Date(now - 5 * HOUR),
        },
        summary: withStake(
          {
            ...summary,
            pool: {
              ...summary.pool,
              state: 'cancelled',
              acceptingStakes: false,
              settledOutcome: 'cancelled',
              closesAt: new Date(now - 30 * HOUR).toISOString(),
            },
          },
          now,
          'yes',
          '50000',
        ),
        votes: previewVotes(now, 'yes').map((vote) => ({ ...vote, vote: 'disputed' })),
      }
    case 'late':
      return {
        market: {
          ...market,
          status: 'cancelled',
          resolved_outcome: 'cancelled',
          resolved_at: new Date(now - 5 * HOUR),
          resolution_date: new Date(now - 6 * HOUR),
        },
        summary: withStake(
          {
            ...summary,
            pool: {
              ...summary.pool,
              state: 'cancelled',
              acceptingStakes: false,
              settledOutcome: 'cancelled',
              closesAt: new Date(now - 80 * HOUR).toISOString(),
            },
          },
          now,
          'no',
          '50000',
        ),
        votes: previewVotes(now, 'yes').slice(0, 1),
      }
    case 'imported':
      return {
        market,
        summary: withStake({ ...summary, pool: { ...summary.pool, isImported: true, rakeBps: 600 } }, now, 'no', '0'),
        votes: [],
      }
  }
}
