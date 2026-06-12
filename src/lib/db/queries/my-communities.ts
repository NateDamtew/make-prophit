import { desc, eq } from 'drizzle-orm'
import { communities, community_members } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'

export interface MyCommunityRow {
  id: string
  slug: string
  name: string
  description: string | null
  icon_url: string | null
  banner_url: string | null
  type: string
  member_count: number
  market_count: number
  role: string
  joined_at: string
}

/** All communities a user has joined (any role), most recently joined first. */
export const MyCommunitiesRepository = {
  async listForUser(userId: string): Promise<MyCommunityRow[]> {
    const rows = await db
      .select({
        id: communities.id,
        slug: communities.slug,
        name: communities.name,
        description: communities.description,
        icon_url: communities.icon_url,
        banner_url: communities.banner_url,
        type: communities.type,
        member_count: communities.member_count,
        market_count: communities.market_count,
        role: community_members.role,
        joined_at: community_members.joined_at,
      })
      .from(community_members)
      .innerJoin(communities, eq(community_members.community_id, communities.id))
      .where(eq(community_members.user_id, userId))
      .orderBy(desc(community_members.joined_at))

    return rows.map(row => ({
      ...row,
      joined_at: row.joined_at.toISOString(),
    }))
  },
}
