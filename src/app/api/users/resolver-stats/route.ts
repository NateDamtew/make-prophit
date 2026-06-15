import type { NextRequest } from 'next/server'
import { inArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/drizzle'

export interface PublicResolverStats {
  user_id: string
  markets_resolved: number
  upheld_count: number
  upheld_rate: number | null
}

/**
 * Batch resolver-stats endpoint. Accepts ?ids=u1,u2,… (up to 50) and returns
 * an array of stats so the members list can render badges with one fetch.
 * Public — the stats are non-sensitive juror track records.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const idsParam = url.searchParams.get('ids') ?? ''
  const ids = idsParam
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 50)

  if (ids.length === 0) {
    return NextResponse.json({ data: [] })
  }

  try {
    // One round-trip: aggregate per juror_id over their jury_votes.
    const result = await db.execute(sql`
      SELECT
        jv.juror_id AS user_id,
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
      WHERE cm.status IN ('resolved', 'disputed')
        AND ${inArray(sql`jv.juror_id`, ids)}
      GROUP BY jv.juror_id
    `)
    const rows = (result as unknown as { rows: Array<{ user_id: string, markets_resolved: number, upheld_count: number }> }).rows
      ?? (result as unknown as Array<{ user_id: string, markets_resolved: number, upheld_count: number }>)

    const map = new Map<string, PublicResolverStats>()
    for (const row of rows) {
      const total = Number(row.markets_resolved)
      const upheld = Number(row.upheld_count)
      map.set(row.user_id, {
        user_id: row.user_id,
        markets_resolved: total,
        upheld_count: upheld,
        upheld_rate: total > 0 ? upheld / total : null,
      })
    }

    // Fill zeroes for users with no votes so the client can always look up by id.
    const data: PublicResolverStats[] = ids.map(id => map.get(id) ?? {
      user_id: id,
      markets_resolved: 0,
      upheld_count: 0,
      upheld_rate: null,
    })

    return NextResponse.json({ data })
  }
  catch (error) {
    console.error('resolver-stats route error', error)
    return NextResponse.json({ data: [] })
  }
}
