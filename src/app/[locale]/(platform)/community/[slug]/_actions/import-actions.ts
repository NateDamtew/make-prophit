'use server'

import { revalidatePath } from 'next/cache'

import type { ImportableMarket } from '@/lib/communities/imports'

import { recordCommunityEvent } from '@/lib/communities/events'
import { ImportError, importMarket, listImportableMarkets } from '@/lib/communities/imports'
import { isOwnerRole } from '@/lib/communities/roles'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'

/**
 * Importing markets from the main catalogue into a community. Owner only;
 * the level check lives in `importMarket`.
 */

async function requireOwner(communityId: string) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { user: null, error: 'You must be signed in.' }
  }
  const { data: role } = await CommunityRepository.getMemberRole(communityId, user.id)
  if (!isOwnerRole(role) && !user.is_admin) {
    return { user: null, error: 'Only the community leader can import markets.' }
  }
  return { user, error: null }
}

export async function listImportableMarketsAction(
  communityId: string,
  search: string,
): Promise<{ data: ImportableMarket[]; error: string | null }> {
  const { error } = await requireOwner(communityId)
  if (error) {
    return { data: [], error }
  }
  try {
    return { data: await listImportableMarkets(search, 20), error: null }
  } catch (caught) {
    console.error('[communities] listImportableMarkets failed', caught)
    return { data: [], error: 'Could not load the catalogue right now.' }
  }
}

export async function importMarketAction(input: {
  communityId: string
  communitySlug: string
  conditionId: string
  closesAt?: string | null
}): Promise<{ data: { marketId: string } | null; error: string | null }> {
  const { user, error } = await requireOwner(input.communityId)
  if (!user) {
    return { data: null, error }
  }
  const closesAt = input.closesAt ? new Date(input.closesAt) : null
  if (closesAt && Number.isNaN(closesAt.getTime())) {
    return { data: null, error: 'Pick a valid close time.' }
  }
  try {
    const result = await importMarket({
      communityId: input.communityId,
      conditionId: input.conditionId,
      createdBy: user.id,
      closesAt,
    })
    await recordCommunityEvent({
      communityId: input.communityId,
      actor: { id: user.id, label: user.username ?? user.name ?? 'Leader' },
      kind: 'market.created',
      targetType: 'market',
      targetId: result.marketId,
      payload: { imported: true, condition_id: input.conditionId },
    })
    revalidatePath(`/community/${input.communitySlug}`, 'layout')
    return { data: { marketId: result.marketId }, error: null }
  } catch (caught) {
    if (caught instanceof ImportError) {
      return { data: null, error: caught.message }
    }
    console.error('[communities] importMarket failed', caught)
    return { data: null, error: 'Could not import that market right now.' }
  }
}
