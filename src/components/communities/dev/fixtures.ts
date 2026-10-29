import type { AppealView } from '@/lib/communities/appeals-service'
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
  'appeal',
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

/**
 * A plausible odds walk for the preview chart: starts near even, drifts and
 * wobbles over three days, and lands on the summary's live odds.
 */
export function previewOddsHistory(now: number, summary: PoolSummary | null): Array<{ t: number; yes: number }> {
  const end = summary ? summary.pool.odds.yes * 100 : 50
  const start = now - 3 * 24 * HOUR
  const steps = 36
  const points: Array<{ t: number; yes: number }> = []
  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps
    const drift = 50 + (end - 50) * progress
    const wobble = Math.sin(progress * 9) * 6 * (1 - progress) + Math.cos(progress * 23) * 2.5
    points.push({ t: start + (now - start) * progress, yes: Math.max(3, Math.min(97, drift + wobble)) })
  }
  points[points.length - 1] = { t: now, yes: end }
  return points
}

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
): { market: M; summary: PoolSummary; votes: PreviewVoteLike[]; appeal?: AppealView | null } {
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
    case 'appeal':
      return {
        market: { ...market, status: 'resolved', resolved_outcome: 'yes', resolved_at: new Date(announced) },
        summary: withStake(
          { ...summary, pool: { ...held(false), holdExtendedUntil: new Date(announced + 48 * HOUR).toISOString() } },
          now,
          'no',
          '0',
        ),
        votes: previewVotes(now, 'yes'),
        appeal: previewAppealView('open', now, announced),
      }
    case 'review':
      return {
        market: { ...market, status: 'resolved', resolved_outcome: 'yes', resolved_at: new Date(announced) },
        summary: withStake({ ...summary, pool: held(true) }, now, 'no', '0'),
        votes: previewVotes(now, 'yes'),
        appeal: previewAppealView('met', now, announced),
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

/** A plausible appeal for the previews: the petrol dissent, seven backers in. */
function previewAppealView(
  state: 'open' | 'met' | 'rejected' | 'upheld' | 'voided',
  now: number,
  announced: number,
): AppealView {
  const status = state === 'open' ? 'open' : state === 'met' ? 'threshold_met' : state
  const backers = [
    {
      userId: 'preview-filer',
      username: 'mama_wanjiru',
      image: null,
      amountMinor: '50000',
      stakeSide: 'no' as const,
      stakeMinor: '80000',
      isFiler: true,
    },
    {
      userId: 'preview-b2',
      username: 'dennis_k',
      image: null,
      amountMinor: '100000',
      stakeSide: 'no' as const,
      stakeMinor: '400000',
      isFiler: false,
    },
    {
      userId: 'preview-b3',
      username: 'sharon.n',
      image: null,
      amountMinor: '60000',
      stakeSide: 'no' as const,
      stakeMinor: '250000',
      isFiler: false,
    },
    {
      userId: 'preview-b4',
      username: 'otis',
      image: null,
      amountMinor: '40000',
      stakeSide: 'no' as const,
      stakeMinor: '100000',
      isFiler: false,
    },
    {
      userId: 'preview-b5',
      username: 'fatma',
      image: null,
      amountMinor: '30000',
      stakeSide: 'no' as const,
      stakeMinor: '50000',
      isFiler: false,
    },
    {
      userId: 'preview-b6',
      username: 'brian',
      image: null,
      amountMinor: '30000',
      stakeSide: 'no' as const,
      stakeMinor: '60000',
      isFiler: false,
    },
    {
      userId: 'preview-b7',
      username: 'achieng',
      image: null,
      amountMinor: '30000',
      stakeSide: 'no' as const,
      stakeMinor: '20000',
      isFiler: false,
    },
  ]
  const met = state !== 'open'
  return {
    id: 'preview-appeal',
    status,
    originalOutcome: 'yes',
    claimedOutcome: state === 'voided' ? 'cancelled' : 'no',
    reason:
      'The rule says Nairobi. The EPRA notice lists 203.40 for Nairobi CBD only. The Nairobi county price in the same notice is 199.80, which is below 200.',
    evidence: [
      { type: 'link', url: 'https://example.com/epra-december', label: 'epra.go.ke, December notice, page 2' },
      { type: 'photo', url: 'https://example.com/notice-table.jpg', label: 'Photo of the notice table' },
    ],
    filedBy: { userId: 'preview-filer', username: 'mama_wanjiru', image: null, stakeSide: 'no', stakeMinor: '80000' },
    backersNeeded: 12,
    escrowTargetMinor: '529000',
    backerCount: met ? 12 : 7,
    escrowTotalMinor: met ? '540000' : '340000',
    currency: 'KES',
    windowEndsAt: new Date(announced + 48 * HOUR).toISOString(),
    createdAt: new Date(now - 5 * HOUR).toISOString(),
    thresholdMetAt: met ? new Date(now - 2 * HOUR).toISOString() : null,
    ruling: state === 'rejected' || state === 'upheld' || state === 'voided' ? state : null,
    rulingText:
      state === 'rejected'
        ? 'The rule names Nairobi and the EPRA table lists one Nairobi price, 203.40 KES. The county average the appeal cites is not in the notice.'
        : state === 'upheld'
          ? 'The rule says Nairobi, not Nairobi CBD. The same notice gives 199.80 for the county, below 200. The jury read the wrong row.'
          : state === 'voided'
            ? 'The question did not say which EPRA figure counts, and the notice has two. Nobody can resolve it fairly either way.'
            : null,
    ruledAt:
      state === 'rejected' || state === 'upheld' || state === 'voided' ? new Date(now - 1 * HOUR).toISOString() : null,
    backers: met ? backers : backers.slice(0, 7),
    opinions:
      state === 'rejected' || state === 'upheld' || state === 'voided'
        ? [
            {
              username: 'njeri',
              image: null,
              opinion: state === 'rejected' ? 'stand' : state === 'upheld' ? 'flip' : 'void',
            },
            {
              username: 'joseph',
              image: null,
              opinion: state === 'rejected' ? 'stand' : state === 'upheld' ? 'flip' : 'void',
            },
            { username: 'wanjiru', image: null, opinion: 'stand' },
          ]
        : [],
  }
}

/**
 * Fixtures for the appeal page (`?preview=file|open|met|rejected|upheld|voided`,
 * outside production): the appeal, what the viewer may do, and the pool.
 */
export function previewAppeal(state: string, now: number, viewerId: string) {
  if (
    state !== 'file' &&
    state !== 'open' &&
    state !== 'met' &&
    state !== 'rejected' &&
    state !== 'upheld' &&
    state !== 'voided'
  ) {
    return null
  }
  const announced = now - 6 * HOUR
  const decided = state === 'rejected' || state === 'upheld' || state === 'voided'
  const appeal = state === 'file' ? null : previewAppealView(state, now, announced)
  const viewer = {
    staked: true,
    stakeSide: 'no' as const,
    stakeMinor: '150000',
    backedMinor: decided ? '50000' : '0',
    availableMinor: '234000',
    canFile: state === 'file',
    canBack: state === 'open',
    isFiler: false,
  }
  const pool = {
    state: decided ? (state === 'voided' || state === 'upheld' ? 'settled' : 'settled') : 'held',
    settledOutcome: state === 'upheld' ? 'no' : state === 'voided' ? 'cancelled' : 'yes',
    holdUntil: new Date(announced + 24 * HOUR).toISOString(),
    holdExtendedUntil: new Date(announced + 48 * HOUR).toISOString(),
    payoutsFrozen: state === 'met',
    totalMinor: '5290000',
    currency: 'KES',
  }
  const resolvedOutcome = state === 'upheld' ? 'no' : state === 'voided' ? 'cancelled' : 'yes'
  return { appeal, viewer, pool, votes: previewVotes(now, 'yes'), resolvedOutcome, viewerId }
}
