import { sql } from 'drizzle-orm'
import { WaitlistAdminRepository } from '@/lib/db/queries/waitlist-admin'
import { users } from '@/lib/db/schema/auth/tables'
import { db } from '@/lib/drizzle'

interface DailyPoint {
  date: string
  count: number
}

export interface AnalyticsData {
  rangeDays: number
  newUsers: DailyPoint[]
  waitlistSignups: DailyPoint[]
  totals: {
    newUsers: number
    waitlistSignups: number
  }
}

function densify(rows: Array<{ date: string, count: number }>, days: number): DailyPoint[] {
  const byDate = new Map(rows.map(r => [r.date, Number(r.count)]))
  const out: DailyPoint[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    out.push({ date: key, count: byDate.get(key) ?? 0 })
  }
  return out
}

async function dailyNewUsers(days: number): Promise<Array<{ date: string, count: number }>> {
  try {
    return await db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${users.created_at}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(sql`${users.created_at} >= now() - make_interval(days => ${days})`)
      .groupBy(sql`date_trunc('day', ${users.created_at})`)
      .orderBy(sql`date_trunc('day', ${users.created_at}) asc`)
  }
  catch (error) {
    console.error('dailyNewUsers failed', error)
    return []
  }
}

export async function getAnalyticsData(rangeDays = 30): Promise<AnalyticsData> {
  const [userRows, waitlistRows] = await Promise.all([
    dailyNewUsers(rangeDays),
    WaitlistAdminRepository.dailySignups(rangeDays).catch(() => []),
  ])

  const newUsers = densify(userRows, rangeDays)
  const waitlistSignups = densify(waitlistRows, rangeDays)

  return {
    rangeDays,
    newUsers,
    waitlistSignups,
    totals: {
      newUsers: newUsers.reduce((a, b) => a + b.count, 0),
      waitlistSignups: waitlistSignups.reduce((a, b) => a + b.count, 0),
    },
  }
}
