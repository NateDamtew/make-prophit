import type { WaitlistRow, WaitlistStatus } from '@/lib/db/schema/waitlist/tables'
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { WAITLIST_STATUSES, waitlists } from '@/lib/db/schema/waitlist/tables'
import { db } from '@/lib/drizzle'

type WaitlistSortField = 'email' | 'created_at' | 'status'

export interface ListWaitlistParams {
  limit?: number
  offset?: number
  search?: string
  status?: WaitlistStatus | 'all'
  sortBy?: WaitlistSortField
  sortOrder?: 'asc' | 'desc'
}

export interface ListWaitlistResult {
  rows: WaitlistRow[]
  totalCount: number
}

function buildFilters(search?: string, status?: WaitlistStatus | 'all') {
  const filters = []

  if (status && status !== 'all') {
    filters.push(eq(waitlists.status, status))
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`
    filters.push(
      or(
        ilike(waitlists.email, term),
        ilike(waitlists.name, term),
        ilike(waitlists.country, term),
        ilike(waitlists.role, term),
      ),
    )
  }

  return filters.length > 0 ? and(...filters) : undefined
}

export const WaitlistAdminRepository = {
  async list(params: ListWaitlistParams = {}): Promise<ListWaitlistResult> {
    const {
      limit = 50,
      offset = 0,
      search,
      status = 'all',
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = params

    const boundedLimit = Math.min(Math.max(limit, 1), 200)
    const where = buildFilters(search, status)

    const sortColumn
      = sortBy === 'email'
        ? waitlists.email
        : sortBy === 'status'
          ? waitlists.status
          : waitlists.created_at
    const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn)

    const [rows, [{ count }]] = await Promise.all([
      db
        .select()
        .from(waitlists)
        .where(where)
        .orderBy(orderBy)
        .limit(boundedLimit)
        .offset(Math.max(offset, 0)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(waitlists)
        .where(where),
    ])

    return { rows, totalCount: Number(count) }
  },

  async getById(id: string): Promise<WaitlistRow | null> {
    const [row] = await db.select().from(waitlists).where(eq(waitlists.id, id)).limit(1)
    return row ?? null
  },

  async updateStatus(id: string, status: WaitlistStatus, invitedBy?: string): Promise<WaitlistRow | null> {
    const patch: Partial<WaitlistRow> = { status }
    if (status === 'invited') {
      patch.invited_at = new Date()
      if (invitedBy) {
        patch.invited_by = invitedBy
      }
    }

    const [row] = await db.update(waitlists).set(patch).where(eq(waitlists.id, id)).returning()
    return row ?? null
  },

  async setNotes(id: string, notes: string | null): Promise<WaitlistRow | null> {
    const [row] = await db.update(waitlists).set({ notes }).where(eq(waitlists.id, id)).returning()
    return row ?? null
  },

  async remove(id: string): Promise<boolean> {
    const deleted = await db.delete(waitlists).where(eq(waitlists.id, id)).returning({ id: waitlists.id })
    return deleted.length > 0
  },

  /** Per-status counts plus total. Powers the KPI strip and Overview. */
  async stats(): Promise<{ total: number, byStatus: Record<WaitlistStatus, number> }> {
    const rows = await db
      .select({ status: waitlists.status, count: sql<number>`count(*)::int` })
      .from(waitlists)
      .groupBy(waitlists.status)

    const byStatus = Object.fromEntries(WAITLIST_STATUSES.map(s => [s, 0])) as Record<WaitlistStatus, number>
    let total = 0
    for (const row of rows) {
      const status = row.status as WaitlistStatus
      const count = Number(row.count)
      if (status in byStatus) {
        byStatus[status] = count
      }
      total += count
    }

    return { total, byStatus }
  },

  /** Daily signup counts for the last `days` days, oldest first. Feeds sparklines. */
  async dailySignups(days = 30): Promise<Array<{ date: string, count: number }>> {
    const rows = await db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${waitlists.created_at}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(waitlists)
      .where(sql`${waitlists.created_at} >= now() - make_interval(days => ${days})`)
      .groupBy(sql`date_trunc('day', ${waitlists.created_at})`)
      .orderBy(sql`date_trunc('day', ${waitlists.created_at}) asc`)

    return rows.map(r => ({ date: r.date, count: Number(r.count) }))
  },

  async allForExport(status?: WaitlistStatus | 'all'): Promise<WaitlistRow[]> {
    const where = buildFilters(undefined, status)
    return db.select().from(waitlists).where(where).orderBy(desc(waitlists.created_at)).limit(50_000)
  },
}
