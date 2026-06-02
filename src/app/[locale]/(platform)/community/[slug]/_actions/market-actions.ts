'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'
import { analyzeMarketQuestion } from '@/lib/ai/gemini'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'

const MarketOptionSchema = z.object({
  id: z.string(),
  question: z.string().trim().min(1),
  title: z.string().trim().min(1),
  shortName: z.string().trim(),
  slug: z.string().trim(),
})

const MarketDraftSchema = z.object({
  title: z.string().trim().min(10, 'Title must be at least 10 characters').max(200),
  slug: z.string().trim().min(3).max(60).regex(/^[a-z0-9-]+$/).optional(),
  image_url: z.string().trim().max(500).optional(),
  description: z.string().trim().max(1000).optional(),
  resolution_source: z.string().trim().max(500).optional(),
  resolution_rules: z.string().trim().min(20, 'Resolution rules must be at least 20 characters').max(2000),
  resolution_date: z.string().optional(),
  market_mode: z.enum(['binary', 'multi_unique', 'multi_multiple']).optional(),
  binary_question: z.string().trim().max(300).optional(),
  binary_outcome_yes: z.string().trim().max(50).optional(),
  binary_outcome_no: z.string().trim().max(50).optional(),
  options: z.array(MarketOptionSchema).optional(),
  main_category_slug: z.string().trim().optional(),
  category_slugs: z.array(z.string().trim()).optional(),
})

async function requireAdmin(communityId: string, userId: string) {
  const memberRole = await CommunityRepository.getMemberRole(communityId, userId)
  if (memberRole.data !== 'admin') {
    return false
  }
  return true
}

export async function analyzeMarketAction(input: { question: string, context?: string }) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  if (!input.question || input.question.trim().length < 5) {
    return { error: 'Please provide a market question (at least 5 characters).', data: null }
  }

  try {
    const suggestion = await analyzeMarketQuestion({
      question: input.question.trim(),
      context: input.context?.trim(),
    })
    return { error: null, data: suggestion }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : DEFAULT_ERROR_MESSAGE
    console.error('Gemini analysis failed:', err)
    return { error: message, data: null }
  }
}

export async function createMarketDraftAction(
  communityId: string,
  communitySlug: string,
  input: z.input<typeof MarketDraftSchema>,
) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  if (!(await requireAdmin(communityId, user.id))) {
    return { error: 'Only the community owner can create markets.', data: null }
  }

  const parsed = MarketDraftSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? DEFAULT_ERROR_MESSAGE, data: null }
  }

  const result = await CommunityRepository.addMarket({
    community_id: communityId,
    title: parsed.data.title,
    slug: parsed.data.slug,
    image_url: parsed.data.image_url,
    description: parsed.data.description,
    resolution_source: parsed.data.resolution_source,
    resolution_rules: parsed.data.resolution_rules,
    resolution_date: parsed.data.resolution_date ? new Date(parsed.data.resolution_date) : undefined,
    market_mode: parsed.data.market_mode,
    binary_question: parsed.data.binary_question,
    binary_outcome_yes: parsed.data.binary_outcome_yes,
    binary_outcome_no: parsed.data.binary_outcome_no,
    options: parsed.data.options,
    main_category_slug: parsed.data.main_category_slug,
    category_slugs: parsed.data.category_slugs,
    created_by: user.id,
    status: 'draft',
  })

  if (result.error) {
    return { error: result.error, data: null }
  }

  revalidatePath(`/community/${communitySlug}`)
  revalidatePath(`/community/${communitySlug}/markets`)
  return { error: null, data: result.data }
}

export async function publishMarketAction(
  marketId: string,
  communityId: string,
  communitySlug: string,
) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  if (!(await requireAdmin(communityId, user.id))) {
    return { error: 'Only the community owner can publish markets.', data: null }
  }

  const result = await CommunityRepository.publishMarket(marketId)
  if (result.error) {
    return { error: result.error, data: null }
  }

  revalidatePath(`/community/${communitySlug}`)
  revalidatePath(`/community/${communitySlug}/markets`)
  return { error: null, data: result.data }
}

export async function updateMarketDraftAction(
  marketId: string,
  communityId: string,
  communitySlug: string,
  input: z.input<typeof MarketDraftSchema>,
) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  if (!(await requireAdmin(communityId, user.id))) {
    return { error: 'Only the community owner can edit markets.', data: null }
  }

  const parsed = MarketDraftSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? DEFAULT_ERROR_MESSAGE, data: null }
  }

  const result = await CommunityRepository.updateMarket(marketId, {
    title: parsed.data.title,
    description: parsed.data.description,
    resolution_source: parsed.data.resolution_source,
    resolution_rules: parsed.data.resolution_rules,
    resolution_date: parsed.data.resolution_date ? new Date(parsed.data.resolution_date) : undefined,
  })
  if (result.error) {
    return { error: result.error, data: null }
  }

  revalidatePath(`/community/${communitySlug}`)
  return { error: null, data: result.data }
}

export async function deleteMarketAction(
  marketId: string,
  communityId: string,
  communitySlug: string,
) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  if (!(await requireAdmin(communityId, user.id))) {
    return { error: 'Only the community owner can delete markets.', data: null }
  }

  const result = await CommunityRepository.deleteMarket(marketId)
  if (result.error) {
    return { error: result.error, data: null }
  }

  revalidatePath(`/community/${communitySlug}`)
  return { error: null, data: result.data }
}

export async function pullPlatformEventAction(
  communityId: string,
  communitySlug: string,
  input: {
    event_id: string
    title: string
    description?: string
    resolution_date?: string
  },
) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  if (!(await requireAdmin(communityId, user.id))) {
    return { error: 'Only the community owner can pull markets.', data: null }
  }

  if (!input.event_id || !input.title) {
    return { error: 'Invalid market data.', data: null }
  }

  const result = await CommunityRepository.addMarket({
    community_id: communityId,
    event_id: input.event_id,
    title: input.title,
    description: input.description,
    resolution_date: input.resolution_date ? new Date(input.resolution_date) : undefined,
    created_by: user.id,
    status: 'active', // Platform events are already vetted, go straight to active
  })

  if (result.error) {
    return { error: result.error, data: null }
  }

  revalidatePath(`/community/${communitySlug}`)
  return { error: null, data: result.data }
}
