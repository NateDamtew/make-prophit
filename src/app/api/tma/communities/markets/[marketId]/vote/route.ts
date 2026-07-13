import type { NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { castJuryVoteAction } from '@/app/[locale]/(platform)/community/[slug]/_actions/community-actions'
import { CommunityRepository } from '@/lib/db/queries/community'
import { jury_votes } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'
import { requireTmaUser } from '../../../../_lib'

/**
 * GET /api/tma/communities/markets/[marketId]/vote
 * Returns the jury votes + tally + the caller's own vote / role for this
 * community market.
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

  const [{ data: votes }, { data: role }, [ownVote]] = await Promise.all([
    CommunityRepository.getVotes(marketId),
    CommunityRepository.getMemberRole(market.community_id, guard.user.id),
    db
      .select({ vote: jury_votes.vote })
      .from(jury_votes)
      .where(and(eq(jury_votes.community_market_id, marketId), eq(jury_votes.juror_id, guard.user.id)))
      .limit(1),
  ])

  const tally = { yes: 0, no: 0, disputed: 0 } as Record<string, number>
  for (const v of votes ?? []) {
    tally[v.vote] = (tally[v.vote] ?? 0) + 1
  }

  return NextResponse.json({
    status: market.status,
    resolvedOutcome: market.resolved_outcome,
    canVote: role === 'juror' || role === 'admin',
    tally,
    myVote: ownVote?.vote ?? null,
    votes: (votes ?? []).map(v => ({
      vote: v.vote,
      reasoning: v.reasoning,
      votedAt: v.voted_at,
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
  let body: { vote?: string, reasoning?: string, evidence_url?: string }
  try {
    body = await request.json()
  }
  catch {
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
