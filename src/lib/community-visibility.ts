/**
 * Visibility helpers for community-governed events.
 *
 * Community-owned events (events.community_id IS NOT NULL) are restricted:
 *   - Public communities: only members can see/trade their markets
 *   - Private communities: only invited members
 *   - Non-members: events are hidden everywhere (listings, search, sitemap, RSS, embed)
 *
 * Use buildEventVisibilityFilter() in any query that returns events to the public.
 */

import { eq, sql } from 'drizzle-orm'
import { community_members } from '@/lib/db/schema/communities/tables'
import { events } from '@/lib/db/schema/events/tables'
import { db } from '@/lib/drizzle'

/**
 * Returns a SQL condition that filters events to:
 *   1. Events with NO community_id (public platform events), OR
 *   2. Events whose community the given userId is a member of
 *
 * If userId is null/undefined, only public events match.
 *
 * Usage:
 *   const visibility = buildEventVisibilityFilter(userId)
 *   db.select().from(events).where(and(other_conditions, visibility))
 */
export function buildEventVisibilityFilter(userId: string | null | undefined) {
  // Defensive: if the events.community_id column hasn't been migrated yet,
  // referencing it would throw. Use raw SQL with COALESCE so even if the
  // column doesn't exist, the query still parses. The column is guaranteed
  // to exist after migration 2026_06_01_002 runs.
  if (!userId) {
    return sql`COALESCE(${events.community_id}, '') = ''`
  }

  const memberCommunityIds = db
    .select({ id: community_members.community_id })
    .from(community_members)
    .where(eq(community_members.user_id, userId))

  return sql`(${events.community_id} IS NULL OR ${events.community_id} IN (${memberCommunityIds}))`
}

/**
 * Filter an in-memory list of events by visibility.
 */
export function filterEventsByCommunityVisibility<T extends { community_id?: string | null }>(
  list: T[],
  visibleCommunityIds: Set<string>,
): T[] {
  return list.filter((event) => {
    if (!event.community_id) {
      return true
    }
    return visibleCommunityIds.has(event.community_id)
  })
}
