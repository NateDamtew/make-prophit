import type { WaitlistStatus } from '@/lib/db/schema/waitlist/tables'
import { and, count, eq, gte, lt } from 'drizzle-orm'
import { WaitlistAdminRepository } from '@/lib/db/queries/waitlist-admin'
import { users } from '@/lib/db/schema/auth/tables'
import { communities } from '@/lib/db/schema/communities/tables'
import { events } from '@/lib/db/schema/events/tables'
import { db } from '@/lib/drizzle'

export interface OverviewStats {
  totalUsers: number
  usersWeekDelta: number | null
  activeEvents: number
  communities: number
  waitlist: {
    total: number
    byStatus: Record<WaitlistStatus, number>
    sparkline: number[]
    weekDelta: number | null
  }
}

async function safeCount(run: () => Promise<number>): Promise<number> {
  try {
    return await run()
  }
  catch (error) {
    console.error('Overview stat query failed', error)
    return 0
  }
}

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null
  }
  return ((current - previous) / previous) * 100
}

/** Aggregate counts for the Overview page. Each query degrades to 0 on error. */
export async function getOverviewStats(): Promise<OverviewStats> {
  const now = Date.now()
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    usersThisWeek,
    usersPrevWeek,
    activeEvents,
    communitiesCount,
    waitlistStats,
    waitlistDaily,
  ] = await Promise.all([
    safeCount(async () => {
      const [row] = await db.select({ value: count() }).from(users)
      return Number(row?.value ?? 0)
    }),
    safeCount(async () => {
      const [row] = await db.select({ value: count() }).from(users).where(gte(users.created_at, weekAgo))
      return Number(row?.value ?? 0)
    }),
    safeCount(async () => {
      const [row] = await db
        .select({ value: count() })
        .from(users)
        .where(and(gte(users.created_at, twoWeeksAgo), lt(users.created_at, weekAgo)))
      return Number(row?.value ?? 0)
    }),
    safeCount(async () => {
      const [row] = await db
        .select({ value: count() })
        .from(events)
        .where(eq(events.status, 'active'))
      return Number(row?.value ?? 0)
    }),
    safeCount(async () => {
      const [row] = await db.select({ value: count() }).from(communities)
      return Number(row?.value ?? 0)
    }),
    WaitlistAdminRepository.stats().catch(() => ({
      total: 0,
      byStatus: { pending: 0, invited: 0, joined: 0, spam: 0 } as Record<WaitlistStatus, number>,
    })),
    WaitlistAdminRepository.dailySignups(30).catch(() => [] as Array<{ date: string, count: number }>),
  ])

  // Build a dense 30-day sparkline (fill gaps with 0).
  const sparkline = buildDenseSeries(waitlistDaily, 30)
  const waitlistThisWeek = sparkline.slice(-7).reduce((a, b) => a + b, 0)
  const waitlistPrevWeek = sparkline.slice(-14, -7).reduce((a, b) => a + b, 0)

  return {
    totalUsers,
    usersWeekDelta: percentDelta(usersThisWeek, usersPrevWeek),
    activeEvents,
    communities: communitiesCount,
    waitlist: {
      total: waitlistStats.total,
      byStatus: waitlistStats.byStatus,
      sparkline,
      weekDelta: percentDelta(waitlistThisWeek, waitlistPrevWeek),
    },
  }
}

function buildDenseSeries(daily: Array<{ date: string, count: number }>, days: number): number[] {
  const byDate = new Map(daily.map(d => [d.date, d.count]))
  const series: number[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    series.push(byDate.get(key) ?? 0)
  }
  return series
}
