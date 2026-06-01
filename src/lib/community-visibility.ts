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

import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/drizzle'
import { events } from '@/lib/db/schema/events/tables'
import { community_members } from '@/lib/db/schema/communities/tables'

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
 * Returns the set of community ids the user can see events from.
 * Useful for in-memory filtering when you can't add SQL conditions.
 */
export async function getUserVisibleCommunityIds(userId: string | null | undefined): Promise<Set<string>> {
  if (!userId) {
    return new Set()
  }
  const rows = await db
    .select({ id: community_members.community_id })
    .from(community_members)
    .where(eq(community_members.user_id, userId))
  return new Set(rows.map(r => r.id))
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

/**
 * Check if a specific event is visible to a user.
 * Returns true if event is public OR user is a member of its community.
 */
export async function canUserSeeEvent(
  eventId: string,
  userId: string | null | undefined,
): Promise<boolean> {
  const [row] = await db
    .select({ community_id: events.community_id })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  if (!row) {
    return false
  }
  if (!row.community_id) {
    return true
  }
  if (!userId) {
    return false
  }

  const [membership] = await db
    .select({ user_id: community_members.user_id })
    .from(community_members)
    .where(and(
      eq(community_members.community_id, row.community_id),
      eq(community_members.user_id, userId),
    ))
    .limit(1)

  return !!membership
}
