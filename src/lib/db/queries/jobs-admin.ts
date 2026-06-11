import type { SyncJobStatus } from '@/lib/admin-ui/job-status'
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { SYNC_JOB_STATUSES } from '@/lib/admin-ui/job-status'
import { jobs } from '@/lib/db/schema/events/tables'
import { db } from '@/lib/drizzle'

export type JobRow = typeof jobs.$inferSelect

export interface ListJobsParams {
  limit?: number
  offset?: number
  search?: string
  status?: SyncJobStatus | 'all'
  sortOrder?: 'asc' | 'desc'
}

function buildFilters(search?: string, status?: SyncJobStatus | 'all') {
  const filters = []
  if (status && status !== 'all') {
    filters.push(eq(jobs.status, status))
  }
  if (search && search.trim()) {
    const term = `%${search.trim()}%`
    filters.push(or(ilike(jobs.job_type, term), ilike(jobs.dedupe_key, term)))
  }
  return filters.length > 0 ? and(...filters) : undefined
}

export const JobsAdminRepository = {
  async list(params: ListJobsParams = {}) {
    const { limit = 50, offset = 0, search, status = 'all', sortOrder = 'desc' } = params
    const boundedLimit = Math.min(Math.max(limit, 1), 200)
    const where = buildFilters(search, status)

    const [rows, [{ count }]] = await Promise.all([
      db
        .select()
        .from(jobs)
        .where(where)
        .orderBy(sortOrder === 'asc' ? jobs.updated_at : desc(jobs.updated_at))
        .limit(boundedLimit)
        .offset(Math.max(offset, 0)),
      db.select({ count: sql<number>`count(*)::int` }).from(jobs).where(where),
    ])

    return { rows, totalCount: Number(count) }
  },

  /** Counts per status + total, for the KPI strip. */
  async stats(): Promise<{ total: number, byStatus: Record<SyncJobStatus, number> }> {
    const rows = await db
      .select({ status: jobs.status, count: sql<number>`count(*)::int` })
      .from(jobs)
      .groupBy(jobs.status)

    const byStatus = Object.fromEntries(SYNC_JOB_STATUSES.map(s => [s, 0])) as Record<SyncJobStatus, number>
    let total = 0
    for (const row of rows) {
      const status = row.status as SyncJobStatus
      const count = Number(row.count)
      if (status in byStatus) {
        byStatus[status] = count
      }
      total += count
    }
    return { total, byStatus }
  },

  async getById(id: string): Promise<JobRow | null> {
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1)
    return row ?? null
  },

  /** Reset a failed/stuck job so the next cron tick picks it up again. */
  async retry(id: string): Promise<JobRow | null> {
    const [row] = await db
      .update(jobs)
      .set({ status: 'pending', attempts: 0, reserved_at: null, last_error: null, available_at: new Date() })
      .where(eq(jobs.id, id))
      .returning()
    return row ?? null
  },
}
