import type { AdminActor } from '@/lib/admin-ui/guard'
import { desc, ilike, or, sql } from 'drizzle-orm'
import { adminAuditLog } from '@/lib/db/schema/admin-ui/audit-log'
import { db } from '@/lib/drizzle'

export interface RecordAuditEventInput {
  actor: Pick<AdminActor, 'id' | 'label'>
  action: string
  targetType?: string
  targetId?: string
  summary?: string
  diff?: Record<string, unknown>
}

/**
 * Append a row to the admin audit trail. Never throws — auditing must not break
 * the action it records, so failures are logged and swallowed.
 */
export async function recordAuditEvent(input: RecordAuditEventInput): Promise<void> {
  try {
    await db.insert(adminAuditLog).values({
      actor_user_id: input.actor.id,
      actor_label: input.actor.label,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      summary: input.summary ?? null,
      diff: input.diff ?? null,
    })
  }
  catch (error) {
    console.error('Failed to record admin audit event', { action: input.action, error })
  }
}

export interface AuditFeedItem {
  id: string
  actorLabel: string
  action: string
  targetType: string | null
  targetId: string | null
  summary: string | null
  createdAt: string
}

/** Paginated audit events with optional free-text search. Powers the Audit Log viewer. */
export async function listAuditEvents(params: {
  limit?: number
  offset?: number
  search?: string
} = {}): Promise<{ rows: AuditFeedItem[], totalCount: number }> {
  const { limit = 50, offset = 0, search } = params
  const boundedLimit = Math.min(Math.max(limit, 1), 200)

  const where = search && search.trim()
    ? or(
        ilike(adminAuditLog.action, `%${search.trim()}%`),
        ilike(adminAuditLog.actor_label, `%${search.trim()}%`),
        ilike(adminAuditLog.summary, `%${search.trim()}%`),
        ilike(adminAuditLog.target_type, `%${search.trim()}%`),
      )
    : undefined

  try {
    const [rows, [{ count }]] = await Promise.all([
      db
        .select()
        .from(adminAuditLog)
        .where(where)
        .orderBy(desc(adminAuditLog.created_at))
        .limit(boundedLimit)
        .offset(Math.max(offset, 0)),
      db.select({ count: sql<number>`count(*)::int` }).from(adminAuditLog).where(where),
    ])

    return {
      rows: rows.map(row => ({
        id: row.id,
        actorLabel: row.actor_label,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        summary: row.summary,
        createdAt: row.created_at.toISOString(),
      })),
      totalCount: Number(count),
    }
  }
  catch (error) {
    console.error('Failed to list audit events', error)
    return { rows: [], totalCount: 0 }
  }
}

/** Most recent audit events, newest first. Powers the Overview activity feed. */
export async function getRecentAuditEvents(limit = 12): Promise<AuditFeedItem[]> {
  try {
    const rows = await db
      .select()
      .from(adminAuditLog)
      .orderBy(desc(adminAuditLog.created_at))
      .limit(limit)

    return rows.map(row => ({
      id: row.id,
      actorLabel: row.actor_label,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      summary: row.summary,
      createdAt: row.created_at.toISOString(),
    }))
  }
  catch (error) {
    console.error('Failed to load audit events', error)
    return []
  }
}
