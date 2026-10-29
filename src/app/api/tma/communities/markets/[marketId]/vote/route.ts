import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'

import { castJuryVoteAction } from '@/app/[locale]/(platform)/community/[slug]/_actions/community-actions'
import { getViewerSeat, getVotesForViewer } from '@/lib/communities/jury-service'
import { isJurorRole } from '@/lib/communities/roles'
import { CommunityRepository } from '@/lib/db/queries/community'

import { requireTmaUser } from '../../../../_lib'

/**
 * GET /api/tma/communities/markets/[marketId]/vote
 * Returns the jury votes (sealed until they open, except the caller's own),
 * the tally once open, and whether the caller is seated to vote.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ marketId: string }> }) {
  const guard = await requireTmaUser()
  if (guard.unauthorized) {
    return guard.unauthorized
  }

  const { marketId } = await params
  const { data: market } = await CommunityRepository.getMarket(marketId)
  if (!market) {
    return NextResponse.json({ error: 'Market not found.' }, { status: 404 })
  }

  const [votes, { data: role }, seat] = await Promise.all([
    getVotesForViewer(marketId, guard.user.id),
    CommunityRepository.getMemberRole(market.community_id, guard.user.id),
    getViewerSeat(marketId, guard.user.id),
  ])

  const revealed = votes.some((v) => v.revealed_at !== null) || market.status !== 'active'
  const tally = { yes: 0, no: 0, disputed: 0 } as Record<string, number>
  if (revealed) {
    for (const v of votes) {
      tally[v.vote] = (tally[v.vote] ?? 0) + 1
    }
  }
  const mine = votes.find((v) => v.juror_id === guard.user.id)

  return NextResponse.json({
    status: market.status,
    resolvedOutcome: market.resolved_outcome,
    // Seated jurors vote; before the seats are drawn, the community's jurors do.
    canVote: seat ? seat.seated : market.jury_seat_count === null && isJurorRole(role),
    revealed,
    votedCount: votes.length,
    seatCount: market.jury_seat_count,
    tally,
    myVote: mine?.vote ?? null,
    votes: votes.map((v) => ({
      vote: v.vote,
      reasoning: v.reasoning,
      votedAt: v.voted_at,
      revealed: v.revealed_at !== null,
      juror: { username: v.juror_username, image: v.juror_image },
    })),
  })
}

/**
 * POST /api/tma/communities/markets/[marketId]/vote
 * Body: { vote: 'yes'|'no'|'disputed', reasoning, evidence_url? }.
 * Wraps castJuryVoteAction (role-gated, auto-resolves at consensus).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ marketId: string }> }) {
  const guard = await requireTmaUser()
  if (guard.unauthorized) {
    return guard.unauthorized
  }

  const { marketId } = await params
  let body: { vote?: string; reasoning?: string; evidence_url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  if (body.vote !== 'yes' && body.vote !== 'no' && body.vote !== 'disputed') {
    return NextResponse.json({ error: 'vote must be yes, no or disputed.' }, { status: 400 })
  }

  const { data: market } = await CommunityRepository.getMarket(marketId)
  if (!market) {
    return NextResponse.json({ error: 'Market not found.' }, { status: 404 })
  }
  const { data: community } = await CommunityRepository.getById(market.community_id)
  if (!community) {
    return NextResponse.json({ error: 'Community not found.' }, { status: 404 })
  }

  const result = await castJuryVoteAction(marketId, community.id, community.slug, {
    vote: body.vote,
    reasoning: body.reasoning ?? '',
    evidence_url: body.evidence_url ?? '',
  })
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
