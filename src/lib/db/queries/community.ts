import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import {
  communities,
  community_invites,
  community_markets,
  community_members,
  community_reviews,
  jury_votes,
} from '@/lib/db/schema/communities/tables'
import { users } from '@/lib/db/schema/auth/tables'
import { runQuery } from '@/lib/db/utils/run-query'
import { db } from '@/lib/drizzle'

// ─── Jury capacity mapping ──────────────────────────────────────────────────

const JURY_CAPACITY: Record<number, number> = {
  1: 5,
  2: 20,
  3: 30,
  4: 40,
  5: 50,
  6: 100,
  7: 200,
  8: 500,
  9: 750,
  10: 1000,
}

export function getMaxMembersForJurySize(jurySize: number): number {
  return JURY_CAPACITY[jurySize] ?? 5
}

export function getConsensusThreshold(jurySize: number): number {
  if (jurySize <= 2) {
    return jurySize // unanimous
  }
  return Math.ceil(jurySize * 0.75) // >75%
}

// ─── Community CRUD ─────────────────────────────────────────────────────────

export const CommunityRepository = {
  async create(input: {
    name: string
    slug: string
    description?: string
    type: 'public' | 'private'
    jury_size: number
    rules?: string
    terms?: string
    creator_id: string
    icon_url?: string
    banner_url?: string
  }) {
    return await runQuery(async () => {
      const maxMembers = getMaxMembersForJurySize(input.jury_size)

      const [community] = await db
        .insert(communities)
        .values({
          name: input.name,
          slug: input.slug.toLowerCase(),
          description: input.description ?? null,
          type: input.type,
          jury_size: input.jury_size,
          max_members: maxMembers,
          rules: input.rules ?? null,
          terms: input.terms ?? null,
          creator_id: input.creator_id,
          icon_url: input.icon_url ?? null,
          banner_url: input.banner_url ?? null,
        })
        .returning()

      // Creator becomes admin + juror
      await db.insert(community_members).values({
        community_id: community.id,
        user_id: input.creator_id,
        role: 'admin',
      })

      return { data: community, error: null }
    })
  },

  async getBySlug(slug: string) {
    return await runQuery(async () => {
      const [community] = await db
        .select()
        .from(communities)
        .where(eq(sql`LOWER(${communities.slug})`, slug.toLowerCase()))
        .limit(1)

      return { data: community ?? null, error: null }
    })
  },

  async getById(id: string) {
    return await runQuery(async () => {
      const [community] = await db
        .select()
        .from(communities)
        .where(eq(communities.id, id))
        .limit(1)

      return { data: community ?? null, error: null }
    })
  },

  async listPublic(options: { limit?: number, offset?: number, search?: string } = {}) {
    return await runQuery(async () => {
      const limit = options.limit ?? 20
      const offset = options.offset ?? 0

      let query = db
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
          average_rating: communities.average_rating,
          review_count: communities.review_count,
          jury_size: communities.jury_size,
          created_at: communities.created_at,
          creator_username: users.username,
          creator_image: users.image,
        })
        .from(communities)
        .leftJoin(users, eq(communities.creator_id, users.id))
        .where(
          and(
            eq(communities.status, 'active'),
            eq(communities.type, 'public'),
            options.search
              ? or(
                  ilike(communities.name, `%${options.search}%`),
                  ilike(communities.description, `%${options.search}%`),
                )
              : undefined,
          ),
        )
        .orderBy(desc(communities.member_count))
        .limit(limit)
        .offset(offset)

      const data = await query
      return { data, error: null }
    })
  },

  async listByUser(userId: string) {
    return await runQuery(async () => {
      const data = await db
        .select({
          id: communities.id,
          slug: communities.slug,
          name: communities.name,
          description: communities.description,
          icon_url: communities.icon_url,
          type: communities.type,
          member_count: communities.member_count,
          market_count: communities.market_count,
          average_rating: communities.average_rating,
          review_count: communities.review_count,
          role: community_members.role,
          joined_at: community_members.joined_at,
        })
        .from(community_members)
        .innerJoin(communities, eq(community_members.community_id, communities.id))
        .where(eq(community_members.user_id, userId))
        .orderBy(desc(community_members.joined_at))

      return { data, error: null }
    })
  },

  async update(communityId: string, input: {
    name?: string
    description?: string
    rules?: string
    terms?: string
    icon_url?: string
    banner_url?: string
  }) {
    return await runQuery(async () => {
      const [updated] = await db
        .update(communities)
        .set({
          ...input,
          updated_at: new Date(),
        })
        .where(eq(communities.id, communityId))
        .returning()

      return { data: updated ?? null, error: null }
    })
  },

  // ─── Members ────────────────────────────────────────────────────────────

  async join(communityId: string, userId: string, invitedBy?: string) {
    return await runQuery(async () => {
      const [community] = await db
        .select({
          member_count: communities.member_count,
          max_members: communities.max_members,
          type: communities.type,
        })
        .from(communities)
        .where(eq(communities.id, communityId))
        .limit(1)

      if (!community) {
        return { data: null, error: 'Community not found.' }
      }
      if (community.member_count >= community.max_members) {
        return { data: null, error: 'Community has reached its member limit.' }
      }

      const [member] = await db
        .insert(community_members)
        .values({
          community_id: communityId,
          user_id: userId,
          role: 'member',
          invited_by: invitedBy ?? null,
        })
        .onConflictDoNothing()
        .returning()

      if (member) {
        await db
          .update(communities)
          .set({ member_count: sql`${communities.member_count} + 1` })
          .where(eq(communities.id, communityId))
      }

      return { data: member ?? null, error: null }
    })
  },

  async leave(communityId: string, userId: string) {
    return await runQuery(async () => {
      const [removed] = await db
        .delete(community_members)
        .where(
          and(
            eq(community_members.community_id, communityId),
            eq(community_members.user_id, userId),
          ),
        )
        .returning()

      if (removed) {
        await db
          .update(communities)
          .set({ member_count: sql`GREATEST(${communities.member_count} - 1, 0)` })
          .where(eq(communities.id, communityId))
      }

      return { data: removed ?? null, error: null }
    })
  },

  async getMemberRole(communityId: string, userId: string) {
    return await runQuery(async () => {
      const [member] = await db
        .select({ role: community_members.role })
        .from(community_members)
        .where(
          and(
            eq(community_members.community_id, communityId),
            eq(community_members.user_id, userId),
          ),
        )
        .limit(1)

      return { data: member?.role ?? null, error: null }
    })
  },

  async setMemberRole(communityId: string, userId: string, role: 'admin' | 'juror' | 'member') {
    return await runQuery(async () => {
      const [updated] = await db
        .update(community_members)
        .set({ role })
        .where(
          and(
            eq(community_members.community_id, communityId),
            eq(community_members.user_id, userId),
          ),
        )
        .returning()

      return { data: updated ?? null, error: null }
    })
  },

  async listMembers(communityId: string) {
    return await runQuery(async () => {
      const data = await db
        .select({
          user_id: community_members.user_id,
          role: community_members.role,
          joined_at: community_members.joined_at,
          username: users.username,
          image: users.image,
        })
        .from(community_members)
        .innerJoin(users, eq(community_members.user_id, users.id))
        .where(eq(community_members.community_id, communityId))
        .orderBy(
          sql`CASE ${community_members.role} WHEN 'admin' THEN 0 WHEN 'juror' THEN 1 ELSE 2 END`,
          community_members.joined_at,
        )

      return { data, error: null }
    })
  },

  async getJurors(communityId: string) {
    return await runQuery(async () => {
      const data = await db
        .select({
          user_id: community_members.user_id,
          username: users.username,
          image: users.image,
          joined_at: community_members.joined_at,
        })
        .from(community_members)
        .innerJoin(users, eq(community_members.user_id, users.id))
        .where(
          and(
            eq(community_members.community_id, communityId),
            or(
              eq(community_members.role, 'juror'),
              eq(community_members.role, 'admin'),
            ),
          ),
        )

      return { data, error: null }
    })
  },

  // ─── Reviews ────────────────────────────────────────────────────────────

  async addReview(communityId: string, userId: string, rating: number, reviewText?: string) {
    return await runQuery(async () => {
      const [review] = await db
        .insert(community_reviews)
        .values({
          community_id: communityId,
          user_id: userId,
          rating,
          review_text: reviewText ?? null,
        })
        .onConflictDoUpdate({
          target: [community_reviews.community_id, community_reviews.user_id],
          set: {
            rating,
            review_text: reviewText ?? null,
            updated_at: new Date(),
          },
        })
        .returning()

      // Recalculate average
      const [avg] = await db
        .select({
          avg: sql<string>`ROUND(AVG(${community_reviews.rating}), 2)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(community_reviews)
        .where(eq(community_reviews.community_id, communityId))

      await db
        .update(communities)
        .set({
          average_rating: avg?.avg ?? '0',
          review_count: avg?.count ?? 0,
        })
        .where(eq(communities.id, communityId))

      return { data: review ?? null, error: null }
    })
  },

  async listReviews(communityId: string) {
    return await runQuery(async () => {
      const data = await db
        .select({
          id: community_reviews.id,
          rating: community_reviews.rating,
          review_text: community_reviews.review_text,
          created_at: community_reviews.created_at,
          username: users.username,
          user_image: users.image,
        })
        .from(community_reviews)
        .innerJoin(users, eq(community_reviews.user_id, users.id))
        .where(eq(community_reviews.community_id, communityId))
        .orderBy(desc(community_reviews.created_at))

      return { data, error: null }
    })
  },

  // ─── Markets ────────────────────────────────────────────────────────────

  async addMarket(input: {
    community_id: string
    event_id?: string
    title: string
    description?: string
    resolution_source?: string
    resolution_rules?: string
    resolution_date?: Date
    created_by: string
  }) {
    return await runQuery(async () => {
      const [market] = await db
        .insert(community_markets)
        .values({
          community_id: input.community_id,
          event_id: input.event_id ?? null,
          title: input.title,
          description: input.description ?? null,
          resolution_source: input.resolution_source ?? null,
          resolution_rules: input.resolution_rules ?? null,
          resolution_date: input.resolution_date ?? null,
          created_by: input.created_by,
        })
        .returning()

      if (market) {
        await db
          .update(communities)
          .set({ market_count: sql`${communities.market_count} + 1` })
          .where(eq(communities.id, input.community_id))
      }

      return { data: market ?? null, error: null }
    })
  },

  async listMarkets(communityId: string) {
    return await runQuery(async () => {
      const data = await db
        .select()
        .from(community_markets)
        .where(eq(community_markets.community_id, communityId))
        .orderBy(desc(community_markets.created_at))

      return { data, error: null }
    })
  },

  async getMarket(marketId: string) {
    return await runQuery(async () => {
      const [market] = await db
        .select()
        .from(community_markets)
        .where(eq(community_markets.id, marketId))
        .limit(1)

      return { data: market ?? null, error: null }
    })
  },

  // ─── Jury Votes ─────────────────────────────────────────────────────────

  async castVote(input: {
    community_market_id: string
    juror_id: string
    vote: 'yes' | 'no' | 'disputed'
    reasoning: string
    evidence_url?: string
  }) {
    return await runQuery(async () => {
      const [juryVote] = await db
        .insert(jury_votes)
        .values({
          community_market_id: input.community_market_id,
          juror_id: input.juror_id,
          vote: input.vote,
          reasoning: input.reasoning,
          evidence_url: input.evidence_url ?? null,
        })
        .onConflictDoUpdate({
          target: [jury_votes.community_market_id, jury_votes.juror_id],
          set: {
            vote: input.vote,
            reasoning: input.reasoning,
            evidence_url: input.evidence_url ?? null,
            voted_at: new Date(),
          },
        })
        .returning()

      return { data: juryVote ?? null, error: null }
    })
  },

  async getVotes(communityMarketId: string) {
    return await runQuery(async () => {
      const data = await db
        .select({
          id: jury_votes.id,
          vote: jury_votes.vote,
          reasoning: jury_votes.reasoning,
          evidence_url: jury_votes.evidence_url,
          voted_at: jury_votes.voted_at,
          juror_username: users.username,
          juror_image: users.image,
        })
        .from(jury_votes)
        .innerJoin(users, eq(jury_votes.juror_id, users.id))
        .where(eq(jury_votes.community_market_id, communityMarketId))
        .orderBy(jury_votes.voted_at)

      return { data, error: null }
    })
  },

  async resolveMarket(communityMarketId: string, jurySize: number) {
    const votes = await db
      .select({ vote: jury_votes.vote })
      .from(jury_votes)
      .where(eq(jury_votes.community_market_id, communityMarketId))

    const yesCount = votes.filter(v => v.vote === 'yes').length
    const noCount = votes.filter(v => v.vote === 'no').length
    const disputedCount = votes.filter(v => v.vote === 'disputed').length
    const threshold = getConsensusThreshold(jurySize)

    let outcome: 'yes' | 'no' | 'cancelled' | null = null
    let resolvedStatus: 'resolved' | 'disputed' | 'pending' = 'pending'

    if (yesCount >= threshold) {
      outcome = 'yes'
      resolvedStatus = 'resolved'
    }
    else if (noCount >= threshold) {
      outcome = 'no'
      resolvedStatus = 'resolved'
    }
    else if (disputedCount >= threshold || votes.length >= jurySize) {
      outcome = 'cancelled'
      resolvedStatus = 'disputed'
    }

    if (outcome && resolvedStatus !== 'pending') {
      await db
        .update(community_markets)
        .set({
          status: resolvedStatus,
          resolved_outcome: outcome,
          resolved_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(community_markets.id, communityMarketId))
    }

    return { outcome, status: resolvedStatus, voteCount: votes.length, threshold }
  },

  // ─── Invites ────────────────────────────────────────────────────────────

  async createInvite(communityId: string, createdBy: string, options?: {
    maxUses?: number
    expiresAt?: Date
  }) {
    return await runQuery(async () => {
      const code = Math.random().toString(36).slice(2, 10).toUpperCase()

      const [invite] = await db
        .insert(community_invites)
        .values({
          community_id: communityId,
          code,
          created_by: createdBy,
          max_uses: options?.maxUses ?? null,
          expires_at: options?.expiresAt ?? null,
        })
        .returning()

      return { data: invite ?? null, error: null }
    })
  },

  async useInvite(code: string) {
    return await runQuery(async () => {
      const [invite] = await db
        .select()
        .from(community_invites)
        .where(
          and(
            eq(community_invites.code, code.toUpperCase()),
            eq(community_invites.is_active, true),
          ),
        )
        .limit(1)

      if (!invite) {
        return { data: null, error: 'Invalid invite code.' }
      }

      if (invite.expires_at && invite.expires_at < new Date()) {
        return { data: null, error: 'This invite has expired.' }
      }

      if (invite.max_uses && invite.use_count >= invite.max_uses) {
        return { data: null, error: 'This invite has reached its usage limit.' }
      }

      await db
        .update(community_invites)
        .set({ use_count: sql`${community_invites.use_count} + 1` })
        .where(eq(community_invites.id, invite.id))

      return { data: { community_id: invite.community_id, created_by: invite.created_by }, error: null }
    })
  },
}
