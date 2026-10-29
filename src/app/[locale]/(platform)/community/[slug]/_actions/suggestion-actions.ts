'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { CommunitySuggestion } from '@/lib/communities/suggestions'

import { recordCommunityEvent } from '@/lib/communities/events'
import { isOwnerRole } from '@/lib/communities/roles'
import {
  addSuggestionToCommunity,
  dismissSuggestionForCommunity,
  listSuggestionsForCommunity,
  SuggestionError,
} from '@/lib/communities/suggestions'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'

/**
 * The suggestion pool from the owner's side: what Prophit offers this
 * community, adding one as a market, hiding one. Owner only.
 */

async function requireOwner(communityId: string) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { user: null, error: 'You must be signed in.' }
  }
  const { data: role } = await CommunityRepository.getMemberRole(communityId, user.id)
  if (!isOwnerRole(role) && !user.is_admin) {
    return { user: null, error: 'Only the community leader can use suggestions.' }
  }
  return { user, error: null }
}

export async function listCommunitySuggestionsAction(
  communityId: string,
): Promise<{ data: { matched: CommunitySuggestion[]; trending: CommunitySuggestion[] }; error: string | null }> {
  const { error } = await requireOwner(communityId)
  if (error) {
    return { data: { matched: [], trending: [] }, error }
  }
  try {
    return { data: await listSuggestionsForCommunity(communityId), error: null }
  } catch (caught) {
    console.error('[communities] listSuggestionsForCommunity failed', caught)
    return { data: { matched: [], trending: [] }, error: 'Could not load suggestions right now.' }
  }
}

const addSchema = z.object({
  communityId: z.string().length(26),
  communitySlug: z.string().min(1),
  suggestionId: z.string().length(26),
  edits: z
    .object({
      title: z.string().trim().min(10).max(300).optional(),
      resolutionRules: z.string().trim().min(20).max(4_000).optional(),
      resolutionSource: z.string().trim().max(500).optional().nullable(),
      closesAt: z.string().trim().optional().nullable(),
      mainCategorySlug: z.string().trim().max(100).optional().nullable(),
      categorySlugs: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
    })
    .optional(),
})

export async function addSuggestionAction(
  input: z.input<typeof addSchema>,
): Promise<{ data: { marketId: string; reviewStatus: string | null } | null; error: string | null }> {
  const parsed = addSchema.safeParse(input)
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }
  const { user, error } = await requireOwner(parsed.data.communityId)
  if (!user) {
    return { data: null, error }
  }
  const edits = parsed.data.edits
  let closesAt: Date | null | undefined
  if (edits && edits.closesAt !== undefined) {
    closesAt = edits.closesAt ? new Date(edits.closesAt) : null
    if (closesAt && Number.isNaN(closesAt.getTime())) {
      return { data: null, error: 'Pick a valid close time.' }
    }
  }
  try {
    const result = await addSuggestionToCommunity({
      suggestionId: parsed.data.suggestionId,
      communityId: parsed.data.communityId,
      communitySlug: parsed.data.communitySlug,
      userId: user.id,
      edits: edits ? { ...edits, closesAt } : undefined,
    })
    await recordCommunityEvent({
      communityId: parsed.data.communityId,
      actor: { id: user.id, label: user.username ?? user.name ?? 'Leader' },
      kind: 'market.created',
      targetType: 'market',
      targetId: result.marketId,
      payload: { suggestion_id: parsed.data.suggestionId, review_status: result.reviewStatus },
    })
    revalidatePath(`/community/${parsed.data.communitySlug}`)
    revalidatePath(`/community/${parsed.data.communitySlug}/dashboard`)
    return { data: result, error: null }
  } catch (caught) {
    if (caught instanceof SuggestionError) {
      return { data: null, error: caught.message }
    }
    console.error('[communities] addSuggestionToCommunity failed', caught)
    return { data: null, error: 'Could not add that suggestion right now.' }
  }
}

export async function dismissSuggestionAction(input: {
  communityId: string
  suggestionId: string
}): Promise<{ data: true | null; error: string | null }> {
  const { error } = await requireOwner(input.communityId)
  if (error) {
    return { data: null, error }
  }
  try {
    await dismissSuggestionForCommunity({ suggestionId: input.suggestionId, communityId: input.communityId })
    return { data: true, error: null }
  } catch (caught) {
    console.error('[communities] dismissSuggestionForCommunity failed', caught)
    return { data: null, error: 'Could not hide that suggestion right now.' }
  }
}
