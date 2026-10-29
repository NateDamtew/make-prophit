import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'

import type { Verdict } from '@/lib/communities/jury-rules'
import type { LedgerTx } from '@/lib/pools/service'

import { computeJuryDeadline, decideVerdict, estimateJurorPay, summarizeJuror } from '@/lib/communities/jury-rules'
import { dispatchCommunityNotification } from '@/lib/communities/notifications'
import { majorityOf } from '@/lib/communities/rules'
import { getCommunitySettings } from '@/lib/communities/settings'
import { propagateJuryResolution } from '@/lib/db/queries/community'
import { users } from '@/lib/db/schema/auth/tables'
import { juror_stats, market_jury_seats, market_resolution_ratings } from '@/lib/db/schema/communities/jury'
import { communities, community_markets, community_members, jury_votes } from '@/lib/db/schema/communities/tables'
import { notifications } from '@/lib/db/schema/notifications/tables'
import { pool_stakes, pools } from '@/lib/db/schema/pools/tables'
import { db } from '@/lib/drizzle'
import { computePoolSettlement } from '@/lib/pools/service'

/**
 * The jury, end to end: seats are assigned when a market goes live, seated
 * jurors cast sealed votes after close, the votes open together when every
 * seat has voted or the deadline passes, the market resolves (or refunds
 * when the jury is late), and each juror's public record is kept up to date.
 */

const JUROR_ROLES = ['juror', 'admin', 'co_owner'] as const

export type JuryVoteInput = 'yes' | 'no' | 'disputed'

export class JuryError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'market_not_found'
      | 'market_decided'
      | 'votes_open'
      | 'not_seated'
      | 'not_open_yet'
      | 'deadline_passed'
      | 'reason_too_short'
      | 'note_exists'
      | 'not_revealed'
      | 'not_a_loser'
      | 'invalid',
  ) {
    super(message)
    this.name = 'JuryError'
  }
}

interface MarketJuryRow {
  id: string
  community_id: string
  status: string
  resolution_date: Date | null
  jury_seat_count: number | null
  jury_required_votes: number | null
  jury_deadline_at: Date | null
  votes_revealed_at: Date | null
  event_id: string | null
  currency: string | null
  jury_size: number
}

async function loadMarket(
  marketId: string,
  tx: LedgerTx | typeof db,
  forUpdate = false,
): Promise<MarketJuryRow | null> {
  const query = tx
    .select({
      id: community_markets.id,
      community_id: community_markets.community_id,
      status: community_markets.status,
      resolution_date: community_markets.resolution_date,
      jury_seat_count: community_markets.jury_seat_count,
      jury_required_votes: community_markets.jury_required_votes,
      jury_deadline_at: community_markets.jury_deadline_at,
      votes_revealed_at: community_markets.votes_revealed_at,
      event_id: community_markets.event_id,
      currency: communities.currency,
      jury_size: communities.jury_size,
    })
    .from(community_markets)
    .innerJoin(communities, eq(communities.id, community_markets.community_id))
    .where(eq(community_markets.id, marketId))
    .limit(1)
  const [row] = forUpdate ? await query.for('update', { of: community_markets }) : await query
  return row ?? null
}

/**
 * Seat the jury for a market: the community's jurors (owners count), drawn
 * at random up to the community's seat count, and the deadline their votes
 * are due by. Idempotent: a market that already has seats keeps them.
 */
export async function assignJurySeats(marketId: string, options: { tx?: LedgerTx; now?: Date } = {}) {
  const tx = options.tx ?? db
  const market = await loadMarket(marketId, tx)
  if (!market) {
    throw new JuryError('Market not found.', 'market_not_found')
  }
  if (market.jury_seat_count !== null) {
    return tx
      .select({ juror_id: market_jury_seats.juror_id })
      .from(market_jury_seats)
      .where(eq(market_jury_seats.community_market_id, marketId))
      .then((rows) => rows.map((row) => row.juror_id))
  }
  const settings = await getCommunitySettings(market.currency ?? 'KES')
  const jurors = await tx
    .select({ user_id: community_members.user_id })
    .from(community_members)
    .where(
      and(eq(community_members.community_id, market.community_id), inArray(community_members.role, [...JUROR_ROLES])),
    )
    .orderBy(sql`random()`)
  const seats = jurors.slice(0, Math.max(1, Math.min(10, market.jury_size))).map((row) => row.user_id)
  if (seats.length > 0) {
    await tx
      .insert(market_jury_seats)
      .values(seats.map((juror_id) => ({ community_market_id: marketId, juror_id })))
      .onConflictDoNothing()
  }
  const seatCount = seats.length
  await tx
    .update(community_markets)
    .set({
      jury_seat_count: seatCount,
      jury_required_votes: majorityOf(Math.max(1, seatCount)),
      jury_deadline_at: market.resolution_date
        ? computeJuryDeadline(market.resolution_date, settings.jury.windowHours)
        : null,
      updated_at: options.now ?? new Date(),
    })
    .where(eq(community_markets.id, marketId))
  return seats
}

/** Who sits on a market's jury, for the verdict list before the reveal. */
export async function getMarketSeats(marketId: string) {
  return db
    .select({ userId: market_jury_seats.juror_id, username: users.username, image: users.image })
    .from(market_jury_seats)
    .innerJoin(users, eq(users.id, market_jury_seats.juror_id))
    .where(eq(market_jury_seats.community_market_id, marketId))
    .orderBy(market_jury_seats.seated_at)
}

/** The viewer's seat on a market, if any, and whether they have voted. */
export async function getViewerSeat(marketId: string, userId: string | null) {
  if (!userId) {
    return null
  }
  const [seat] = await db
    .select({ id: market_jury_seats.id })
    .from(market_jury_seats)
    .where(and(eq(market_jury_seats.community_market_id, marketId), eq(market_jury_seats.juror_id, userId)))
    .limit(1)
  if (!seat) {
    return null
  }
  const [vote] = await db
    .select({ id: jury_votes.id, vote: jury_votes.vote, revealed_at: jury_votes.revealed_at })
    .from(jury_votes)
    .where(and(eq(jury_votes.community_market_id, marketId), eq(jury_votes.juror_id, userId)))
    .limit(1)
  return { seated: true, voted: Boolean(vote), vote: (vote?.vote as JuryVoteInput | undefined) ?? null }
}

/**
 * A seated juror's sealed vote. Allowed once the market has closed and until
 * the deadline or the reveal; a juror may change it while it is sealed.
 */
export async function castSealedVote(params: {
  marketId: string
  jurorId: string
  vote: JuryVoteInput
  reasoning: string
  sourceType?: 'link' | 'photo' | null
  sourceUrl?: string | null
  now?: Date
}): Promise<{ voteId: string; verdict: Verdict }> {
  const now = params.now ?? new Date()
  const voteId = await db.transaction(async (tx) => {
    const market = await loadMarket(params.marketId, tx, true)
    if (!market) {
      throw new JuryError('Market not found.', 'market_not_found')
    }
    if (market.status !== 'active') {
      throw new JuryError('This market has already been decided.', 'market_decided')
    }
    if (market.votes_revealed_at) {
      throw new JuryError('The votes are open; nothing can change now.', 'votes_open')
    }
    if (market.resolution_date && market.resolution_date.getTime() > now.getTime()) {
      throw new JuryError('Voting opens when the market closes.', 'not_open_yet')
    }
    const settings = await getCommunitySettings(market.currency ?? 'KES')
    const deadline =
      market.jury_deadline_at ??
      (market.resolution_date ? computeJuryDeadline(market.resolution_date, settings.jury.windowHours) : null)
    if (deadline && now.getTime() > deadline.getTime()) {
      throw new JuryError('The deadline for this market has passed.', 'deadline_passed')
    }
    // Markets from before seats existed are seated on the first vote.
    if (market.jury_seat_count === null) {
      await assignJurySeats(params.marketId, { tx, now })
    }
    const [seat] = await tx
      .select({ id: market_jury_seats.id })
      .from(market_jury_seats)
      .where(
        and(eq(market_jury_seats.community_market_id, params.marketId), eq(market_jury_seats.juror_id, params.jurorId)),
      )
      .limit(1)
    if (!seat) {
      throw new JuryError('You are not seated on this market’s jury.', 'not_seated')
    }
    const reasoning = params.reasoning.trim()
    if (reasoning.length < settings.jury.minReasonChars) {
      throw new JuryError(
        `Write at least ${settings.jury.minReasonChars} characters so stakers can follow your reasoning.`,
        'reason_too_short',
      )
    }
    const sourceUrl = params.sourceUrl?.trim() || null
    const [row] = await tx
      .insert(jury_votes)
      .values({
        community_market_id: params.marketId,
        juror_id: params.jurorId,
        vote: params.vote,
        reasoning,
        evidence_url: sourceUrl,
        source_type: sourceUrl ? (params.sourceType ?? 'link') : null,
        voted_at: now,
        sealed_at: now,
      })
      .onConflictDoUpdate({
        target: [jury_votes.community_market_id, jury_votes.juror_id],
        set: {
          vote: params.vote,
          reasoning,
          evidence_url: sourceUrl,
          source_type: sourceUrl ? (params.sourceType ?? 'link') : null,
          voted_at: now,
          sealed_at: now,
        },
      })
      .returning({ id: jury_votes.id })
    return row!.id
  })
  const verdict = await tryRevealAndResolve(params.marketId, now)
  return { voteId, verdict }
}

/**
 * Open the votes and decide the market when every seat has voted or the
 * deadline has passed. Safe to call any time: a market that is not ready
 * comes back pending, a decided one comes back as it was decided.
 */
async function tryRevealAndResolve(marketId: string, now = new Date()): Promise<Verdict> {
  const decided = await db.transaction(async (tx) => {
    const market = await loadMarket(marketId, tx, true)
    if (!market) {
      throw new JuryError('Market not found.', 'market_not_found')
    }
    const seats = await tx
      .select({ juror_id: market_jury_seats.juror_id })
      .from(market_jury_seats)
      .where(eq(market_jury_seats.community_market_id, marketId))
    const seatIds = seats.map((row) => row.juror_id)
    const votes = await tx
      .select({ id: jury_votes.id, juror_id: jury_votes.juror_id, vote: jury_votes.vote })
      .from(jury_votes)
      .where(eq(jury_votes.community_market_id, marketId))
    const counted = votes
      .filter((vote) => seatIds.length === 0 || seatIds.includes(vote.juror_id))
      .map((vote) => ({ jurorId: vote.juror_id, vote: vote.vote as JuryVoteInput }))
    const settings = await getCommunitySettings(market.currency ?? 'KES')
    const deadline =
      market.jury_deadline_at ??
      (market.resolution_date ? computeJuryDeadline(market.resolution_date, settings.jury.windowHours) : null)
    const seatCount = market.jury_seat_count ?? Math.max(seatIds.length, market.jury_size)
    const verdict = decideVerdict({
      seats: Math.max(1, seatCount),
      required: market.jury_required_votes ?? undefined,
      votes: counted,
      deadline,
      now,
    })
    if (market.status !== 'active' || market.votes_revealed_at) {
      return { verdict, changed: false, market, seatIds }
    }
    // Nothing opens before the market closes.
    if (market.resolution_date && market.resolution_date.getTime() > now.getTime()) {
      const pending: Verdict = { ...verdict, status: 'pending', reveal: false, outcome: null }
      return { verdict: pending, changed: false, market, seatIds }
    }
    if (!verdict.reveal) {
      return { verdict, changed: false, market, seatIds }
    }

    const outcome = verdict.outcome ?? 'cancelled'
    const status = verdict.status === 'resolved' ? 'resolved' : verdict.status === 'void' ? 'disputed' : 'cancelled'
    await tx
      .update(jury_votes)
      .set({
        revealed_at: now,
        agreed_with_outcome:
          outcome === 'yes' || outcome === 'no' ? sql<boolean>`${jury_votes.vote} = ${outcome}` : null,
      })
      .where(eq(jury_votes.community_market_id, marketId))
    await tx
      .update(community_markets)
      .set({
        status,
        resolved_outcome: outcome,
        resolved_at: now,
        votes_revealed_at: now,
        result_announced_at: now,
        resolution_kind: verdict.status === 'late' ? 'late' : 'jury',
        late_resolution: verdict.status === 'late',
        updated_at: now,
      })
      .where(eq(community_markets.id, marketId))
    return { verdict, changed: true, market, seatIds }
  })

  if (!decided.changed) {
    return decided.verdict
  }
  const { verdict, market, seatIds } = decided
  // Everything after the decision is best effort: the crons retry each piece.
  await recomputeJurorStats(seatIds).catch((error) => console.error('[jury] stats recompute failed', error))
  if (market.event_id && (verdict.outcome === 'yes' || verdict.outcome === 'no' || verdict.outcome === 'cancelled')) {
    await propagateJuryResolution(marketId, verdict.outcome).catch((error) =>
      console.error('[jury] resolution propagation failed', error),
    )
  }
  try {
    await computePoolSettlement(marketId, { now })
  } catch (error) {
    console.error('[jury] pool settlement failed; the cron will retry', error)
  }
  await notifyMarketDecided(marketId, market.community_id, verdict).catch((error) =>
    console.error('[jury] decided notification failed', error),
  )
  return verdict
}

async function notifyMarketDecided(marketId: string, communityId: string, verdict: Verdict) {
  const [row] = await db
    .select({ title: community_markets.title, slug: communities.slug })
    .from(community_markets)
    .innerJoin(communities, eq(communities.id, community_markets.community_id))
    .where(eq(community_markets.id, marketId))
    .limit(1)
  if (!row) {
    return
  }
  await dispatchCommunityNotification({
    communityId,
    category: 'community.market_resolved',
    title:
      verdict.status === 'resolved'
        ? `Result in: ${verdict.outcome === 'yes' ? 'Yes' : 'No'}`
        : verdict.status === 'late'
          ? 'Jury late: stakes refunded'
          : 'Market voided: stakes refunded',
    description: row.title,
    link: { type: 'internal', url: `/community/${row.slug}/market/${marketId}`, label: 'View market' },
    fanout: 'all-members',
    payload: { market_id: marketId, outcome: verdict.outcome, kind: 'result_in' },
  })
}

/** A dated note under a revealed vote. One per vote; the vote itself never changes. */
export async function addCorrectionNote(params: { voteId: string; jurorId: string; note: string; now?: Date }) {
  const note = params.note.trim()
  if (note.length < 10) {
    throw new JuryError('Say a little more.', 'invalid')
  }
  const [vote] = await db
    .select({ id: jury_votes.id, revealed_at: jury_votes.revealed_at, correction_note: jury_votes.correction_note })
    .from(jury_votes)
    .where(and(eq(jury_votes.id, params.voteId), eq(jury_votes.juror_id, params.jurorId)))
    .limit(1)
  if (!vote) {
    throw new JuryError('Vote not found.', 'market_not_found')
  }
  if (!vote.revealed_at) {
    throw new JuryError('Notes go under revealed votes. While sealed, edit the vote instead.', 'not_revealed')
  }
  if (vote.correction_note) {
    throw new JuryError('This vote already has a note.', 'note_exists')
  }
  await db
    .update(jury_votes)
    .set({ correction_note: note, correction_note_at: params.now ?? new Date() })
    .where(eq(jury_votes.id, params.voteId))
}

/** Losers rate how the market was resolved, 1–5. Jurors who voted on it carry the rating. */
export async function rateResolution(params: { marketId: string; userId: string; rating: number; now?: Date }) {
  const rating = Math.round(params.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new JuryError('Pick one to five stars.', 'invalid')
  }
  const [pool] = await db
    .select({ id: pools.id, settled_outcome: pools.settled_outcome, state: pools.state })
    .from(pools)
    .where(eq(pools.community_market_id, params.marketId))
    .limit(1)
  if (!pool || (pool.settled_outcome !== 'yes' && pool.settled_outcome !== 'no')) {
    throw new JuryError('The result is not in yet.', 'not_a_loser')
  }
  const [lost] = await db
    .select({ id: pool_stakes.id })
    .from(pool_stakes)
    .where(
      and(
        eq(pool_stakes.pool_id, pool.id),
        eq(pool_stakes.user_id, params.userId),
        sql`${pool_stakes.outcome} <> ${pool.settled_outcome}`,
      ),
    )
    .limit(1)
  if (!lost) {
    throw new JuryError('Only people who lost on this market can rate how it was resolved.', 'not_a_loser')
  }
  const now = params.now ?? new Date()
  await db
    .insert(market_resolution_ratings)
    .values({ community_market_id: params.marketId, user_id: params.userId, rating, created_at: now, updated_at: now })
    .onConflictDoUpdate({
      target: [market_resolution_ratings.community_market_id, market_resolution_ratings.user_id],
      set: { rating, updated_at: now },
    })
  const seats = await db
    .select({ juror_id: market_jury_seats.juror_id })
    .from(market_jury_seats)
    .where(eq(market_jury_seats.community_market_id, params.marketId))
  await recomputeJurorStats(seats.map((row) => row.juror_id))
  return rating
}

/**
 * Rebuild the cached record for these jurors from seats, revealed votes and
 * ratings. Appeal-driven fields (overturned votes, dissents proven) are read
 * from the vote rows, so an appeal ruling only has to mark the votes.
 */
export async function recomputeJurorStats(userIds: string[]) {
  const ids = Array.from(new Set(userIds)).filter(Boolean)
  if (ids.length === 0) {
    return
  }
  await db.execute(sql`
    INSERT INTO juror_stats (user_id, markets_voted, on_time, late, agreed, overturned, rating_sum, rating_count, first_voted_at, updated_at)
    SELECT
      s.juror_id,
      COUNT(v.id) FILTER (WHERE m.votes_revealed_at IS NOT NULL)::int,
      COUNT(v.id) FILTER (WHERE m.votes_revealed_at IS NOT NULL AND v.was_late = FALSE)::int,
      COUNT(*) FILTER (WHERE m.votes_revealed_at IS NOT NULL AND (v.id IS NULL OR v.was_late))::int,
      COUNT(v.id) FILTER (WHERE v.agreed_with_outcome = TRUE)::int,
      COUNT(v.id) FILTER (WHERE v.overturned = TRUE)::int,
      COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN r.rating_sum ELSE 0 END), 0)::int,
      COALESCE(SUM(CASE WHEN v.id IS NOT NULL THEN r.rating_count ELSE 0 END), 0)::int,
      MIN(v.voted_at),
      now()
    FROM market_jury_seats s
    INNER JOIN community_markets m ON m.id = s.community_market_id
    LEFT JOIN jury_votes v ON v.community_market_id = s.community_market_id AND v.juror_id = s.juror_id
    LEFT JOIN (
      SELECT community_market_id, SUM(rating)::int AS rating_sum, COUNT(*)::int AS rating_count
      FROM market_resolution_ratings GROUP BY community_market_id
    ) r ON r.community_market_id = s.community_market_id
    WHERE s.juror_id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})
    GROUP BY s.juror_id
    ON CONFLICT (user_id) DO UPDATE SET
      markets_voted = EXCLUDED.markets_voted,
      on_time = EXCLUDED.on_time,
      late = EXCLUDED.late,
      agreed = EXCLUDED.agreed,
      overturned = EXCLUDED.overturned,
      rating_sum = EXCLUDED.rating_sum,
      rating_count = EXCLUDED.rating_count,
      first_voted_at = COALESCE(juror_stats.first_voted_at, EXCLUDED.first_voted_at),
      updated_at = now()
  `)
}

/** Every juror with a seat: for the nightly recompute. */
export async function recomputeAllJurorStats() {
  const rows = await db.selectDistinct({ juror_id: market_jury_seats.juror_id }).from(market_jury_seats)
  await recomputeJurorStats(rows.map((row) => row.juror_id))
  return rows.length
}

export interface ViewerVote {
  id: string
  vote: string
  reasoning: string
  evidence_url: string | null
  source_type: string | null
  voted_at: Date
  revealed_at: Date | null
  was_late: boolean
  overturned: boolean
  correction_note: string | null
  correction_note_at: Date | null
  juror_id: string
  juror_username: string | null
  juror_image: string | null
}

/**
 * The votes on a market as one viewer may see them: everything after the
 * reveal; before it, only who has voted, plus the viewer's own sealed vote.
 */
export async function getVotesForViewer(marketId: string, viewerId: string | null): Promise<ViewerVote[]> {
  const rows = await db
    .select({
      id: jury_votes.id,
      vote: jury_votes.vote,
      reasoning: jury_votes.reasoning,
      evidence_url: jury_votes.evidence_url,
      source_type: jury_votes.source_type,
      voted_at: jury_votes.voted_at,
      revealed_at: jury_votes.revealed_at,
      was_late: jury_votes.was_late,
      overturned: jury_votes.overturned,
      correction_note: jury_votes.correction_note,
      correction_note_at: jury_votes.correction_note_at,
      juror_id: jury_votes.juror_id,
      juror_username: users.username,
      juror_image: users.image,
      market_status: community_markets.status,
    })
    .from(jury_votes)
    .innerJoin(users, eq(jury_votes.juror_id, users.id))
    .innerJoin(community_markets, eq(community_markets.id, jury_votes.community_market_id))
    .where(eq(jury_votes.community_market_id, marketId))
    .orderBy(jury_votes.voted_at)
  return rows.map(({ market_status, ...row }) => {
    const open = row.revealed_at !== null || market_status !== 'active'
    if (open || row.juror_id === viewerId) {
      return row
    }
    return { ...row, vote: 'sealed', reasoning: '', evidence_url: null, source_type: null, correction_note: null }
  })
}

export interface JuryInboxItem {
  marketId: string
  title: string
  communitySlug: string
  communityName: string
  closesAt: string | null
  dueAt: string | null
  seatCount: number
  requiredVotes: number
  votedCount: number
  myVote: string | null
  poolMinor: string
  currency: string | null
  resolutionRules: string | null
  resolutionSource: string | null
}

export interface JuryInbox {
  due: JuryInboxItem[]
  comingUp: JuryInboxItem[]
  recent: Array<{
    marketId: string
    title: string
    communitySlug: string
    myVote: string
    outcome: string | null
    revealedAt: string
  }>
  payThisMonthMinor: string
  currency: string | null
}

/** What a juror sees on /jury: votes due now, markets closing soon, recent verdicts and this month's pay. */
export async function getJuryInbox(userId: string, now = new Date()): Promise<JuryInbox> {
  const seated = await db
    .select({
      marketId: community_markets.id,
      title: community_markets.title,
      status: community_markets.status,
      resolution_date: community_markets.resolution_date,
      jury_deadline_at: community_markets.jury_deadline_at,
      jury_seat_count: community_markets.jury_seat_count,
      jury_required_votes: community_markets.jury_required_votes,
      votes_revealed_at: community_markets.votes_revealed_at,
      resolution_rules: community_markets.resolution_rules,
      resolution_source: community_markets.resolution_source,
      resolved_outcome: community_markets.resolved_outcome,
      communitySlug: communities.slug,
      communityName: communities.name,
      currency: communities.currency,
      votedCount: sql<number>`(SELECT COUNT(*)::int FROM ${jury_votes} v WHERE v.community_market_id = ${community_markets.id})`,
      myVote: sql<
        string | null
      >`(SELECT v.vote FROM ${jury_votes} v WHERE v.community_market_id = ${community_markets.id} AND v.juror_id = ${userId} LIMIT 1)`,
      myVotedAt: sql<Date | null>`(SELECT v.voted_at FROM ${jury_votes} v WHERE v.community_market_id = ${community_markets.id} AND v.juror_id = ${userId} LIMIT 1)`,
      poolMinor: sql<string>`COALESCE((SELECT (p.total_yes + p.total_no)::text FROM ${pools} p WHERE p.community_market_id = ${community_markets.id} LIMIT 1), '0')`,
    })
    .from(market_jury_seats)
    .innerJoin(community_markets, eq(community_markets.id, market_jury_seats.community_market_id))
    .innerJoin(communities, eq(communities.id, community_markets.community_id))
    .where(eq(market_jury_seats.juror_id, userId))
    .orderBy(community_markets.resolution_date)
    .limit(100)

  function toItem(row: (typeof seated)[number]): JuryInboxItem {
    return {
      marketId: row.marketId,
      title: row.title,
      communitySlug: row.communitySlug,
      communityName: row.communityName,
      closesAt: row.resolution_date?.toISOString() ?? null,
      dueAt: row.jury_deadline_at?.toISOString() ?? null,
      seatCount: row.jury_seat_count ?? 0,
      requiredVotes: row.jury_required_votes ?? majorityOf(row.jury_seat_count ?? 1),
      votedCount: row.votedCount,
      myVote: row.myVote,
      poolMinor: row.poolMinor,
      currency: row.currency,
      resolutionRules: row.resolution_rules,
      resolutionSource: row.resolution_source,
    }
  }

  const due = seated
    .filter(
      (row) =>
        row.status === 'active' &&
        !row.votes_revealed_at &&
        row.resolution_date !== null &&
        row.resolution_date.getTime() <= now.getTime(),
    )
    .map(toItem)
  const comingUp = seated
    .filter(
      (row) => row.status === 'active' && row.resolution_date !== null && row.resolution_date.getTime() > now.getTime(),
    )
    .map(toItem)
  const recent = seated
    .filter((row) => row.votes_revealed_at !== null && row.myVote !== null)
    .sort((a, b) => (b.votes_revealed_at?.getTime() ?? 0) - (a.votes_revealed_at?.getTime() ?? 0))
    .slice(0, 10)
    .map((row) => ({
      marketId: row.marketId,
      title: row.title,
      communitySlug: row.communitySlug,
      myVote: row.myVote ?? '',
      outcome: row.resolved_outcome,
      revealedAt: row.votes_revealed_at!.toISOString(),
    }))

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const [pay] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${pools.jury_paid} / GREATEST(cardinality(${pools.voting_juror_ids}), 1)), 0)::text`,
      currency: sql<string | null>`MIN(${pools.currency})`,
    })
    .from(pools)
    .where(
      and(
        gte(pools.released_at, monthStart),
        sql`${userId} = ANY(${pools.voting_juror_ids})`,
        sql`${pools.jury_paid} > 0`,
      ),
    )
  return {
    due,
    comingUp,
    recent,
    payThisMonthMinor: pay?.total ?? '0',
    currency: pay?.currency ?? seated[0]?.currency ?? null,
  }
}

/** What the vote page needs beyond the inbox item: the pay estimate inputs and the other seats. */
export async function getVotePageData(marketId: string, userId: string) {
  const [row] = await db
    .select({
      market: community_markets,
      communitySlug: communities.slug,
      communityName: communities.name,
      currency: communities.currency,
      pool: pools,
    })
    .from(community_markets)
    .innerJoin(communities, eq(communities.id, community_markets.community_id))
    .leftJoin(pools, eq(pools.community_market_id, community_markets.id))
    .where(eq(community_markets.id, marketId))
    .limit(1)
  if (!row) {
    return null
  }
  const seats = await db
    .select({
      juror_id: market_jury_seats.juror_id,
      username: users.username,
      image: users.image,
      voted_at: sql<Date | null>`(SELECT v.voted_at FROM ${jury_votes} v WHERE v.community_market_id = ${marketId} AND v.juror_id = ${market_jury_seats.juror_id} LIMIT 1)`,
    })
    .from(market_jury_seats)
    .innerJoin(users, eq(users.id, market_jury_seats.juror_id))
    .where(eq(market_jury_seats.community_market_id, marketId))
  const mine = await db
    .select({
      id: jury_votes.id,
      vote: jury_votes.vote,
      reasoning: jury_votes.reasoning,
      evidence_url: jury_votes.evidence_url,
      source_type: jury_votes.source_type,
    })
    .from(jury_votes)
    .where(and(eq(jury_votes.community_market_id, marketId), eq(jury_votes.juror_id, userId)))
    .limit(1)
  const poolMinor = row.pool ? row.pool.total_yes + row.pool.total_no : 0n
  const seatCount = row.market.jury_seat_count ?? seats.length
  const settings = await getCommunitySettings(row.currency ?? 'KES')
  return {
    minReasonChars: settings.jury.minReasonChars,
    market: {
      id: row.market.id,
      title: row.market.title,
      status: row.market.status,
      resolutionRules: row.market.resolution_rules,
      resolutionSource: row.market.resolution_source,
      closesAt: row.market.resolution_date?.toISOString() ?? null,
      dueAt: row.market.jury_deadline_at?.toISOString() ?? null,
      revealedAt: row.market.votes_revealed_at?.toISOString() ?? null,
      seatCount,
      requiredVotes: row.market.jury_required_votes ?? majorityOf(Math.max(1, seatCount)),
      outcomeYes: row.market.binary_outcome_yes,
      outcomeNo: row.market.binary_outcome_no,
    },
    community: {
      id: row.market.community_id,
      slug: row.communitySlug,
      name: row.communityName,
      currency: row.currency,
    },
    seats: seats.map((seat) => ({
      userId: seat.juror_id,
      username: seat.username,
      image: seat.image,
      votedAt: seat.voted_at?.toISOString() ?? null,
    })),
    seated: seats.some((seat) => seat.juror_id === userId),
    myVote: mine[0]
      ? {
          id: mine[0].id,
          vote: mine[0].vote as JuryVoteInput,
          reasoning: mine[0].reasoning,
          sourceUrl: mine[0].evidence_url,
          sourceType: mine[0].source_type,
        }
      : null,
    poolMinor: poolMinor.toString(),
    payEstimateMinor: row.pool
      ? estimateJurorPay({
          poolMinor,
          rakeBps: row.pool.rake_bps,
          juryShareBps: row.pool.jury_share_bps,
          seats: Math.max(1, seatCount),
        }).toString()
      : '0',
  }
}

export interface JurorProfile {
  summary: ReturnType<typeof summarizeJuror>
  since: string | null
  servesOn: Array<{ slug: string; name: string; level: number; markets: number }>
  history: Array<{
    marketId: string
    title: string
    communitySlug: string
    communityName: string
    vote: string
    outcome: string | null
    reasoning: string
    overturned: boolean
    wasLate: boolean
    revealedAt: string
  }>
}

/** A juror's public record: the headline numbers, where they serve and their latest verdicts. */
export async function getJurorProfile(userId: string): Promise<JurorProfile> {
  const [stats] = await db.select().from(juror_stats).where(eq(juror_stats.user_id, userId)).limit(1)
  const servesOn = await db
    .select({
      slug: communities.slug,
      name: communities.name,
      level: communities.level,
      markets: sql<number>`(
        SELECT COUNT(*)::int FROM ${jury_votes} v
        INNER JOIN ${community_markets} m ON m.id = v.community_market_id
        WHERE v.juror_id = ${userId} AND m.community_id = ${communities.id} AND m.votes_revealed_at IS NOT NULL
      )`,
    })
    .from(community_members)
    .innerJoin(communities, eq(communities.id, community_members.community_id))
    .where(and(eq(community_members.user_id, userId), inArray(community_members.role, [...JUROR_ROLES])))
    .orderBy(desc(communities.level))
  const history = await db
    .select({
      marketId: community_markets.id,
      title: community_markets.title,
      communitySlug: communities.slug,
      communityName: communities.name,
      vote: jury_votes.vote,
      outcome: community_markets.resolved_outcome,
      reasoning: jury_votes.reasoning,
      overturned: jury_votes.overturned,
      wasLate: jury_votes.was_late,
      revealedAt: jury_votes.revealed_at,
    })
    .from(jury_votes)
    .innerJoin(community_markets, eq(community_markets.id, jury_votes.community_market_id))
    .innerJoin(communities, eq(communities.id, community_markets.community_id))
    .where(and(eq(jury_votes.juror_id, userId), sql`${jury_votes.revealed_at} IS NOT NULL`))
    .orderBy(desc(jury_votes.revealed_at))
    .limit(20)
  return {
    summary: summarizeJuror(
      stats
        ? {
            marketsVoted: stats.markets_voted,
            onTime: stats.on_time,
            late: stats.late,
            agreed: stats.agreed,
            overturned: stats.overturned,
            ratingSum: stats.rating_sum,
            ratingCount: stats.rating_count,
            dissentProven: stats.dissent_proven,
          }
        : null,
    ),
    since: stats?.first_voted_at?.toISOString() ?? null,
    servesOn: servesOn.map((row) => ({ slug: row.slug, name: row.name, level: row.level, markets: row.markets })),
    history: history.map((row) => ({ ...row, revealedAt: row.revealedAt!.toISOString() })),
  }
}

/** Ratings per juror for the trust card and the jury list. */
export async function getJurorRatings(userIds: string[]): Promise<Map<string, number | null>> {
  const ids = Array.from(new Set(userIds)).filter(Boolean)
  const map = new Map<string, number | null>()
  if (ids.length === 0) {
    return map
  }
  const rows = await db
    .select({
      user_id: juror_stats.user_id,
      rating_sum: juror_stats.rating_sum,
      rating_count: juror_stats.rating_count,
    })
    .from(juror_stats)
    .where(inArray(juror_stats.user_id, ids))
  for (const row of rows) {
    map.set(row.user_id, row.rating_count > 0 ? Math.round((row.rating_sum / row.rating_count) * 10) / 10 : null)
  }
  return map
}

/**
 * The cron's pass over markets past close: tell seated jurors their vote is
 * due (once), then open and decide whatever is ready. Legacy markets without
 * seats get them here, so every closed market has a jury.
 */
export async function runJuryPass(now = new Date()) {
  const dueMarkets = await db
    .select({
      id: community_markets.id,
      title: community_markets.title,
      community_id: community_markets.community_id,
      jury_seat_count: community_markets.jury_seat_count,
      jury_notified_at: community_markets.jury_notified_at,
      jury_deadline_at: community_markets.jury_deadline_at,
      slug: communities.slug,
    })
    .from(community_markets)
    .innerJoin(communities, eq(communities.id, community_markets.community_id))
    .where(
      and(
        eq(community_markets.status, 'active'),
        eq(community_markets.engine, 'pool'),
        isNull(community_markets.source_event_id),
        isNull(community_markets.votes_revealed_at),
        lte(community_markets.resolution_date, now),
      ),
    )
    .limit(200)

  const result = { checked: dueMarkets.length, notified: 0, resolved: 0, refunded: 0, errors: [] as string[] }
  for (const market of dueMarkets) {
    try {
      if (market.jury_seat_count === null) {
        await assignJurySeats(market.id, { now })
      }
      if (!market.jury_notified_at) {
        await notifyJuryVoteDue(market.id, market.title, market.slug, now)
        result.notified += 1
      }
      const verdict = await tryRevealAndResolve(market.id, now)
      if (verdict.status === 'resolved') {
        result.resolved += 1
      } else if (verdict.status === 'late' || verdict.status === 'void') {
        result.refunded += 1
      }
    } catch (error) {
      result.errors.push(`Market ${market.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return result
}

async function notifyJuryVoteDue(marketId: string, title: string, slug: string, now: Date) {
  const [seats, [deadlineRow]] = await Promise.all([
    db
      .select({ juror_id: market_jury_seats.juror_id })
      .from(market_jury_seats)
      .where(eq(market_jury_seats.community_market_id, marketId)),
    db
      .select({ dueAt: community_markets.jury_deadline_at })
      .from(community_markets)
      .where(eq(community_markets.id, marketId))
      .limit(1),
  ])
  const dueAt = deadlineRow?.dueAt ?? null
  if (seats.length > 0) {
    await db.insert(notifications).values(
      seats.map((seat) => ({
        user_id: seat.juror_id,
        category: 'general',
        title: 'Your jury vote is due',
        description: dueAt
          ? `${title} closed. Vote by ${dueAt.toUTCString()}; a missed vote refunds the market.`
          : `${title} closed. The jury can vote now.`,
        // 'custom' is the link type the notifications table allows for an in-app path.
        link_type: 'custom',
        link_url: `/jury/${marketId}`,
        link_label: 'Vote now',
        metadata: { kind: 'jury_vote_due', market_id: marketId, community_slug: slug },
      })),
    )
  }
  await db
    .update(community_markets)
    .set({ jury_notified_at: now, updated_at: now })
    .where(eq(community_markets.id, marketId))
}
