import type { NextRequest } from 'next/server'
import { desc, ilike, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { communities } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'

interface AdminCommunityRow {
  id: string
  slug: string
  name: string
  member_count: number
  market_count: number
  is_verified: boolean
  community_fee_bps: number
  white_label: boolean
  created_at: string
}

/**
 * Admin list of communities for the platform management surface. Returns
 * verification + fee state via a raw SELECT (the Drizzle table object doesn't
 * declare the new monetization columns to keep upstream merges clean).
 */
export async function GET(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '50', 10) || 50, 200)
    const pageIndex = Math.max(Number.parseInt(searchParams.get('pageIndex') || '0', 10) || 0, 0)
    const search = searchParams.get('search') || undefined
    const verifiedOnly = searchParams.get('verified') === 'true'

    const where = []
    if (search?.trim()) {
      const term = `%${search.trim()}%`
      where.push(ilike(communities.name, term))
    }
    if (verifiedOnly) {
      where.push(sql`is_verified = TRUE`)
    }

    const whereClause = where.length > 0 ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``

    const rowsResult = await db.execute(sql`
      SELECT id, slug, name, member_count, market_count,
             is_verified, community_fee_bps, COALESCE(white_label, FALSE) AS white_label,
             created_at::text AS created_at
      FROM communities
      ${whereClause}
      ORDER BY ${desc(communities.created_at)}
      LIMIT ${limit} OFFSET ${pageIndex * limit}
    `)
    const rows = ((rowsResult as unknown as { rows: AdminCommunityRow[] }).rows
      ?? (rowsResult as unknown as AdminCommunityRow[]))

    const countResult = await db.execute(sql`SELECT count(*)::int AS c FROM communities ${whereClause}`)
    const totalCount = Number(((countResult as unknown as { rows: Array<{ c: number }> }).rows
      ?? (countResult as unknown as Array<{ c: number }>))[0]?.c ?? 0)

    return NextResponse.json({ data: rows, totalCount })
  }
  catch (error) {
    console.error('Admin communities list error', error)
    return NextResponse.json({ error: 'Failed to load communities.' }, { status: 500 })
  }
}
