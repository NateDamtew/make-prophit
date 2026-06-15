import { sql } from 'drizzle-orm'
import { db } from '@/lib/drizzle'

export interface ResolverStats {
  userId: string
  marketsResolved: number
  upheldCount: number
  upheldRate: number | null // 0-1, null when marketsResolved=0
}

/**
 * Compute a user's resolver track record. A vote is "upheld" when the
 * juror's vote matches the market's final resolved_outcome (or 'disputed'
 * status when the juror voted disputed).
 *
 * Cheap query — joins jury_votes with community_markets and aggregates.
 * Returns zeros if the user has never voted.
 */
export async function getResolverStats(userId: string): Promise<ResolverStats> {
  try {
    const result = await db.execute(sql`
      SELECT
        count(*)::int AS markets_resolved,
        sum(
          CASE
            WHEN jv.vote = cm.resolved_outcome THEN 1
            WHEN jv.vote = 'disputed' AND cm.status = 'disputed' THEN 1
            ELSE 0
          END
        )::int AS upheld_count
      FROM jury_votes jv
      JOIN community_markets cm ON cm.id = jv.community_market_id
      WHERE jv.juror_id = ${userId}
        AND cm.status IN ('resolved', 'disputed')
    `)
    const row = ((result as unknown as { rows: Array<{ markets_resolved: number, upheld_count: number }> }).rows
      ?? (result as unknown as Array<{ markets_resolved: number, upheld_count: number }>))[0]
    const marketsResolved = Number(row?.markets_resolved ?? 0)
    const upheldCount = Number(row?.upheld_count ?? 0)
    return {
      userId,
      marketsResolved,
      upheldCount,
      upheldRate: marketsResolved > 0 ? upheldCount / marketsResolved : null,
    }
  }
  catch (error) {
    console.error('Resolver stats query failed', error)
    return { userId, marketsResolved: 0, upheldCount: 0, upheldRate: null }
  }
}
