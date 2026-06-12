import { and, eq, sql } from 'drizzle-orm'
import { updateTag } from 'next/cache'
import { cacheTags } from '@/lib/cache-tags'
import { community_notification_prefs } from '@/lib/db/schema/communities/engagement'
import { notifications } from '@/lib/db/schema/notifications/tables'
import { db } from '@/lib/drizzle'

const _COMMUNITY_NOTIFICATION_CATEGORIES = [
  'community.market_added',
  'community.comment_reply',
  'community.market_resolved',
  'community.invite',
  // Phase 2 (Workstream D) — review-pipeline feedback to the community admin.
  // The actual inbox row currently lands via the legacy notifyMarketApproved /
  // notifyMarketRejected helpers; these categories are registered so future
  // call sites can route through the Phase 1 dispatcher (mute-aware, audited).
  'community.market_approved',
  'community.market_rejected',
] as const

type CommunityNotificationCategory = (typeof _COMMUNITY_NOTIFICATION_CATEGORIES)[number]

/** Which mute toggle in `community_notification_prefs` gates a given category. */
const MUTE_FIELD_BY_CATEGORY: Record<CommunityNotificationCategory, keyof typeof community_notification_prefs.$inferSelect> = {
  'community.market_added': 'mute_markets',
  'community.comment_reply': 'mute_comments',
  'community.market_resolved': 'mute_resolutions',
  'community.invite': 'mute_markets', // direct invite uses the broader "markets" toggle
  'community.market_approved': 'mute_markets',
  'community.market_rejected': 'mute_markets',
}

interface DispatchInput {
  communityId: string
  category: CommunityNotificationCategory
  title: string
  description: string
  /** Optional deep-link to the relevant page. */
  link: { type: 'external' | 'internal', url: string, label?: string } | null
  /**
   * Targeting:
   * - `recipientUserId`: send to exactly this one user (e.g. reply notification).
   * - `fanout: 'all-members'`: send to every community member except the actor.
   */
  recipientUserId?: string
  fanout?: 'all-members'
  excludeUserId?: string
  payload?: Record<string, unknown>
}

/**
 * Insert one or many notification rows for a community event. Respects
 * `community_notification_prefs.mute_*` toggles. Never throws — notifications
 * must not block the action that triggered them.
 */
export async function dispatchCommunityNotification(input: DispatchInput): Promise<void> {
  try {
    const link_type = input.link?.type ?? 'none'
    const link_url = input.link?.url ?? null
    const link_label = input.link?.label ?? null
    const metadata = {
      community_id: input.communityId,
      ...(input.payload ?? {}),
    } as Record<string, unknown>

    if (input.recipientUserId) {
      // Targeted notification: check the prefs row for a mute.
      const muted = await isMuted(input.communityId, input.recipientUserId, input.category)
      if (muted) {
        return
      }
      await db.insert(notifications).values({
        user_id: input.recipientUserId,
        category: input.category,
        title: input.title,
        description: input.description,
        link_type,
        link_url,
        link_label,
        metadata,
      })
      updateTag(cacheTags.notifications(input.recipientUserId))
      return
    }

    if (input.fanout === 'all-members') {
      // Fan out to all members except the actor, honoring mute toggles in
      // a single INSERT…SELECT round-trip.
      const muteField = MUTE_FIELD_BY_CATEGORY[input.category]
      const excludeClause = input.excludeUserId
        ? sql`AND m.user_id <> ${input.excludeUserId}`
        : sql``
      await db.execute(sql`
        INSERT INTO notifications (user_id, category, title, description, link_type, link_url, link_label, metadata)
        SELECT
          m.user_id,
          ${input.category},
          ${input.title},
          ${input.description},
          ${link_type},
          ${link_url},
          ${link_label},
          ${sql.raw(`'${JSON.stringify(metadata).replace(/'/g, '\'\'')}'::jsonb`)}
        FROM community_members m
        LEFT JOIN community_notification_prefs p
          ON p.user_id = m.user_id AND p.community_id = m.community_id
        WHERE m.community_id = ${input.communityId}
          ${excludeClause}
          AND COALESCE(p.${sql.raw(muteField)}, FALSE) = FALSE
      `)
    }
  }
  catch (error) {
    console.error('Failed to dispatch community notification', { category: input.category, error })
  }
}

async function isMuted(
  communityId: string,
  userId: string,
  category: CommunityNotificationCategory,
): Promise<boolean> {
  const muteField = MUTE_FIELD_BY_CATEGORY[category]
  const [row] = await db
    .select()
    .from(community_notification_prefs)
    .where(and(
      eq(community_notification_prefs.user_id, userId),
      eq(community_notification_prefs.community_id, communityId),
    ))
    .limit(1)
  if (!row) {
    return false
  }
  return Boolean((row as any)[muteField])
}
