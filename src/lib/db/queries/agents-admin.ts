import type { AgentStatus } from '@/lib/admin-ui/agent-status'
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { AGENT_STATUSES } from '@/lib/admin-ui/agent-status'
import { agents } from '@/lib/db/schema/agents/tables'
import { users } from '@/lib/db/schema/auth/tables'
import { db } from '@/lib/drizzle'

export interface AdminAgentRow {
  id: string
  name: string
  slug: string
  status: AgentStatus
  is_public: boolean
  owner: string
  total_volume_usd: string
  total_trades: number
  created_at: string
}

interface ListParams {
  limit?: number
  offset?: number
  search?: string
  status?: AgentStatus | 'all'
}

function buildFilters(search?: string, status?: AgentStatus | 'all') {
  const filters = []
  if (status && status !== 'all') {
    filters.push(eq(agents.status, status))
  }
  if (search && search.trim()) {
    const term = `%${search.trim()}%`
    filters.push(or(ilike(agents.name, term), ilike(agents.slug, term)))
  }
  return filters.length > 0 ? and(...filters) : undefined
}

export const AgentsAdminRepository = {
  async list(params: ListParams = {}): Promise<{ rows: AdminAgentRow[], totalCount: number }> {
    const { limit = 50, offset = 0, search, status = 'all' } = params
    const boundedLimit = Math.min(Math.max(limit, 1), 200)
    const where = buildFilters(search, status)

    const [rows, [{ count }]] = await Promise.all([
      db
        .select({
          id: agents.id,
          name: agents.name,
          slug: agents.slug,
          status: agents.status,
          is_public: agents.is_public,
          ownerUsername: users.username,
          ownerAddress: users.address,
          total_volume_usd: agents.total_volume_usd,
          total_trades: agents.total_trades,
          created_at: agents.created_at,
        })
        .from(agents)
        .leftJoin(users, eq(agents.user_id, users.id))
        .where(where)
        .orderBy(desc(agents.created_at))
        .limit(boundedLimit)
        .offset(Math.max(offset, 0)),
      db.select({ count: sql<number>`count(*)::int` }).from(agents).where(where),
    ])

    return {
      rows: rows.map(row => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status as AgentStatus,
        is_public: row.is_public,
        owner: row.ownerUsername || row.ownerAddress || '—',
        total_volume_usd: row.total_volume_usd,
        total_trades: row.total_trades,
        created_at: row.created_at.toISOString(),
      })),
      totalCount: Number(count),
    }
  },

  async stats(): Promise<{ total: number, byStatus: Record<AgentStatus, number> }> {
    const rows = await db
      .select({ status: agents.status, count: sql<number>`count(*)::int` })
      .from(agents)
      .groupBy(agents.status)

    const byStatus = Object.fromEntries(AGENT_STATUSES.map(s => [s, 0])) as Record<AgentStatus, number>
    let total = 0
    for (const row of rows) {
      const status = row.status as AgentStatus
      const count = Number(row.count)
      if (status in byStatus) {
        byStatus[status] = count
      }
      total += count
    }
    return { total, byStatus }
  },

  async getName(id: string): Promise<string | null> {
    const [row] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, id)).limit(1)
    return row?.name ?? null
  },

  async setStatus(id: string, status: AgentStatus): Promise<boolean> {
    const updated = await db.update(agents).set({ status }).where(eq(agents.id, id)).returning({ id: agents.id })
    return updated.length > 0
  },
}
