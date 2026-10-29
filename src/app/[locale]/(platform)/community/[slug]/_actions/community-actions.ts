'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { CommunityRole } from '@/lib/communities/roles'

import { recordCommunityEvent } from '@/lib/communities/events'
import { castSealedVote, JuryError } from '@/lib/communities/jury-service'
import { can, isCommunityRole, isJurorRole } from '@/lib/communities/roles'
import { getCommunitySettings } from '@/lib/communities/settings'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'
import { validatePoolJurySize } from '@/lib/pools/jury'

function actorLabel(user: any): string {
  return user?.username || user?.name || user?.email || user?.address || user?.id || 'unknown'
}

const CreateCommunitySchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(50),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().trim().max(500).optional(),
  type: z.enum(['public', 'private']),
  jury_size: z.number().int().min(1).max(10),
  rules: z.string().trim().max(2000).optional(),
  terms: z.string().trim().max(2000).optional(),
})

const ReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review_text: z.string().trim().max(1000).optional(),
})

const JuryVoteSchema = z.object({
  vote: z.enum(['yes', 'no', 'disputed']),
  // The floor; the community's own minimum (80 by default) is enforced in the jury service.
  reasoning: z.string().trim().min(10, 'Please provide at least 10 characters of reasoning'),
  evidence_url: z.string().url().optional().or(z.literal('')),
  source_type: z.enum(['link', 'photo']).optional(),
})

export async function createCommunityAction(input: z.input<typeof CreateCommunitySchema>) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  const parsed = CreateCommunitySchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? DEFAULT_ERROR_MESSAGE, data: null }
  }

  // Leaders apply first; Prophit approves and creates the community. Platform admins may create directly.
  if (!user.is_admin) {
    const settings = await getCommunitySettings()
    if (settings.requireApplication) {
      return { error: 'Communities open by application. Apply at /communities/apply.', data: null }
    }
  }

  // Fork: new communities start on the pool tier, where the jury alone settles balances.
  const juryError = validatePoolJurySize(parsed.data.jury_size)
  if (juryError) {
    return { error: juryError, data: null }
  }

  // Check slug availability
  const existing = await CommunityRepository.getBySlug(parsed.data.slug)
  if (existing.data) {
    return { error: 'This slug is already taken. Please choose another.', data: null }
  }

  const result = await CommunityRepository.create({
    ...parsed.data,
    creator_id: user.id,
  })

  if (result.error) {
    return { error: result.error, data: null }
  }

  revalidatePath(`/community/${parsed.data.slug}`, 'layout')
  return { error: null, data: result.data }
}

export async function joinCommunityAction(communityId: string, inviteCode?: string) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  let invitedBy: string | undefined
  if (inviteCode) {
    const inviteResult = await CommunityRepository.redeemInvite(inviteCode)
    if (inviteResult.error) {
      return { error: inviteResult.error, data: null }
    }
    invitedBy = inviteResult.data?.created_by
  }

  const result = await CommunityRepository.join(communityId, user.id, invitedBy)
  if (result.error) {
    return { error: result.error, data: null }
  }

  await recordCommunityEvent({
    communityId,
    actor: { id: user.id, label: actorLabel(user) },
    kind: 'member.joined',
    targetType: 'member',
    targetId: user.id,
    payload: { invited_by: invitedBy ?? null },
  })

  revalidatePath(`/community/[slug]`, 'layout')
  return { error: null, data: result.data }
}

export async function leaveCommunityAction(communityId: string, communitySlug: string) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  const result = await CommunityRepository.leave(communityId, user.id)
  if (result.error) {
    return { error: result.error, data: null }
  }

  await recordCommunityEvent({
    communityId,
    actor: { id: user.id, label: actorLabel(user) },
    kind: 'member.left',
    targetType: 'member',
    targetId: user.id,
  })

  revalidatePath(`/community/${communitySlug}`, 'layout')
  return { error: null, data: result.data }
}

export async function submitReviewAction(
  communityId: string,
  communitySlug: string,
  input: z.input<typeof ReviewSchema>,
) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  const parsed = ReviewSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? DEFAULT_ERROR_MESSAGE, data: null }
  }

  // Must be a member to review
  const memberRole = await CommunityRepository.getMemberRole(communityId, user.id)
  if (!memberRole.data) {
    return { error: 'You must be a member to leave a review.', data: null }
  }

  const result = await CommunityRepository.addReview(communityId, user.id, parsed.data.rating, parsed.data.review_text)
  if (result.error) {
    return { error: result.error, data: null }
  }

  await recordCommunityEvent({
    communityId,
    actor: { id: user.id, label: actorLabel(user) },
    kind: 'review.submitted',
    targetType: 'review',
    payload: { rating: parsed.data.rating },
  })

  revalidatePath(`/community/${communitySlug}`, 'layout')
  return { error: null, data: result.data }
}

export async function castJuryVoteAction(
  communityMarketId: string,
  communityId: string,
  communitySlug: string,
  input: z.input<typeof JuryVoteSchema>,
) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  // Must be a juror or admin; the seat check itself happens in the service.
  const memberRole = await CommunityRepository.getMemberRole(communityId, user.id)
  if (!isJurorRole(memberRole.data)) {
    return { error: 'Only jury members can vote.', data: null }
  }

  const parsed = JuryVoteSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? DEFAULT_ERROR_MESSAGE, data: null }
  }

  // Sealed: the vote is stored, and the market only opens and decides once
  // every seat has voted or the deadline passes.
  let result: Awaited<ReturnType<typeof castSealedVote>>
  try {
    result = await castSealedVote({
      marketId: communityMarketId,
      jurorId: user.id,
      vote: parsed.data.vote,
      reasoning: parsed.data.reasoning,
      sourceUrl: parsed.data.evidence_url || null,
      sourceType: parsed.data.source_type ?? null,
    })
  } catch (error) {
    if (error instanceof JuryError) {
      return { error: error.message, data: null }
    }
    console.error('[castJuryVoteAction] failed', error)
    return { error: DEFAULT_ERROR_MESSAGE, data: null }
  }

  await recordCommunityEvent({
    communityId,
    actor: { id: user.id, label: actorLabel(user) },
    kind: 'jury.voted',
    targetType: 'market',
    targetId: communityMarketId,
    // The vote itself stays sealed; the feed only says that this juror voted.
    payload: { sealed: !result.verdict.reveal },
  })

  const { verdict } = result
  if (verdict.reveal && verdict.status !== 'pending') {
    const marketRow = await CommunityRepository.getMarket(communityMarketId)
    const title = marketRow.data?.title ?? 'A market'
    await recordCommunityEvent({
      communityId,
      actor: { id: user.id, label: actorLabel(user) },
      kind: verdict.status === 'resolved' ? 'market.resolved' : 'market.disputed',
      targetType: 'market',
      targetId: communityMarketId,
      payload: { title, outcome: verdict.outcome ?? null },
    })
  }

  revalidatePath(`/community/${communitySlug}`, 'layout')
  revalidatePath(`/community/${communitySlug}/market/${communityMarketId}`, 'layout')
  return { error: null, data: { voteId: result.voteId, verdict } }
}

export async function setMemberRoleAction(
  communityId: string,
  targetUserId: string,
  role: CommunityRole,
  communitySlug: string,
) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  if (!isCommunityRole(role)) {
    return { error: 'Unknown role.', data: null }
  }

  // Only the owner (or a co-owner) can change roles
  const memberRole = await CommunityRepository.getMemberRole(communityId, user.id)
  if (!can(memberRole.data, 'members')) {
    return { error: 'Only the community owner can change member roles.', data: null }
  }

  const result = await CommunityRepository.setMemberRole(communityId, targetUserId, role)
  if (result.error) {
    return { error: result.error, data: null }
  }

  revalidatePath(`/community/${communitySlug}`, 'layout')
  return { error: null, data: result.data }
}

export async function generateInviteAction(communityId: string) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  const memberRole = await CommunityRepository.getMemberRole(communityId, user.id)
  if (!can(memberRole.data, 'members')) {
    return { error: 'Only the community owner can generate invite links.', data: null }
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7-day expiry

  const result = await CommunityRepository.createInvite(communityId, user.id, {
    expiresAt,
  })
  if (result.error) {
    return { error: result.error, data: null }
  }

  return { error: null, data: result.data }
}
