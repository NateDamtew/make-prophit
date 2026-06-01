'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'

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
  reasoning: z.string().trim().min(10, 'Please provide at least 10 characters of reasoning'),
  evidence_url: z.string().url().optional().or(z.literal('')),
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

  revalidatePath(`/community/${parsed.data.slug}`)
  return { error: null, data: result.data }
}

export async function joinCommunityAction(communityId: string, inviteCode?: string) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  let invitedBy: string | undefined
  if (inviteCode) {
    const inviteResult = await CommunityRepository.useInvite(inviteCode)
    if (inviteResult.error) {
      return { error: inviteResult.error, data: null }
    }
    invitedBy = inviteResult.data?.created_by
  }

  const result = await CommunityRepository.join(communityId, user.id, invitedBy)
  if (result.error) {
    return { error: result.error, data: null }
  }

  revalidatePath(`/community/[slug]`)
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

  revalidatePath(`/community/${communitySlug}`)
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

  const result = await CommunityRepository.addReview(
    communityId,
    user.id,
    parsed.data.rating,
    parsed.data.review_text,
  )
  if (result.error) {
    return { error: result.error, data: null }
  }

  revalidatePath(`/community/${communitySlug}`)
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

  // Must be a juror or admin
  const memberRole = await CommunityRepository.getMemberRole(communityId, user.id)
  if (!memberRole.data || !['juror', 'admin'].includes(memberRole.data)) {
    return { error: 'Only jury members can vote.', data: null }
  }

  const parsed = JuryVoteSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? DEFAULT_ERROR_MESSAGE, data: null }
  }

  const result = await CommunityRepository.castVote({
    community_market_id: communityMarketId,
    juror_id: user.id,
    vote: parsed.data.vote,
    reasoning: parsed.data.reasoning,
    evidence_url: parsed.data.evidence_url || undefined,
  })
  if (result.error) {
    return { error: result.error, data: null }
  }

  // After casting the vote, check if consensus has been reached and
  // resolve automatically. This propagates to conditions for on-chain
  // settlement when the market is event-linked.
  const community = await CommunityRepository.getById(communityId)
  if (community.data) {
    await CommunityRepository.resolveMarket(communityMarketId, community.data.jury_size)
  }

  revalidatePath(`/community/${communitySlug}`)
  revalidatePath(`/community/${communitySlug}/market/${communityMarketId}`)
  return { error: null, data: result.data }
}

export async function setMemberRoleAction(
  communityId: string,
  targetUserId: string,
  role: 'admin' | 'juror' | 'member',
  communitySlug: string,
) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  // Only admin can change roles
  const memberRole = await CommunityRepository.getMemberRole(communityId, user.id)
  if (memberRole.data !== 'admin') {
    return { error: 'Only community admins can change member roles.', data: null }
  }

  const result = await CommunityRepository.setMemberRole(communityId, targetUserId, role)
  if (result.error) {
    return { error: result.error, data: null }
  }

  revalidatePath(`/community/${communitySlug}`)
  return { error: null, data: result.data }
}

export async function generateInviteAction(communityId: string) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  const memberRole = await CommunityRepository.getMemberRole(communityId, user.id)
  if (memberRole.data !== 'admin') {
    return { error: 'Only admins can generate invite links.', data: null }
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
