import { community_events } from '@/lib/db/schema/communities/engagement'
import { db } from '@/lib/drizzle'

/**
 * The set of activity-feed event kinds. Adding a new kind here is the single
 * place to register it; both the feed renderer and the notifications
 * dispatcher key off this union.
 */
const _COMMUNITY_EVENT_KINDS = [
  'market.created',
  'market.resolved',
  'market.disputed',
  'comment.posted',
  'comment.replied',
  'reaction.added',
  'member.joined',
  'member.left',
  'review.submitted',
  'jury.voted',
  // Phase 2: external embedded view tracked from the public /embed route.
  'embed.view',
] as const

type CommunityEventKind = (typeof _COMMUNITY_EVENT_KINDS)[number]

export interface RecordCommunityEventInput {
  communityId: string
  actor: { id: string, label: string } | null
  kind: CommunityEventKind
  targetType?: 'market' | 'comment' | 'member' | 'review'
  targetId?: string
  payload?: Record<string, unknown>
}

/**
 * Append a row to the activity log. Never throws — logging must not break the
 * action it records. Errors are swallowed and surfaced to console for triage.
 */
export async function recordCommunityEvent(input: RecordCommunityEventInput): Promise<void> {
  try {
    await db.insert(community_events).values({
      community_id: input.communityId,
      actor_user_id: input.actor?.id ?? null,
      actor_label: input.actor?.label ?? null,
      kind: input.kind,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      payload: input.payload ?? {},
    })
  }
  catch (error) {
    console.error('Failed to record community event', { kind: input.kind, error })
  }
}
