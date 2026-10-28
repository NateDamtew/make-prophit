import { and, desc, eq, inArray } from 'drizzle-orm'

import type { LeaderType } from '@/lib/communities/rules'
import type {
  ApplicationSampleMarket,
  ApplicationStatus,
  CommunityApplicationRow,
} from '@/lib/db/schema/communities/applications'

import { users } from '@/lib/db/schema/auth/tables'
import { community_applications } from '@/lib/db/schema/communities/applications'
import { db } from '@/lib/drizzle'

/**
 * Leader applications: one open application per person at a time.
 */

export interface ApplicationView {
  id: string
  leaderType: LeaderType
  name: string
  slug: string
  description: string
  audience: string | null
  sampleMarkets: ApplicationSampleMarket[]
  links: string[]
  currency: string
  status: ApplicationStatus
  adminNote: string | null
  startLevel: number | null
  communityId: string | null
  createdAt: string
  reviewedAt: string | null
}

function toView(row: CommunityApplicationRow): ApplicationView {
  return {
    id: row.id,
    leaderType: row.leader_type as LeaderType,
    name: row.name,
    slug: row.slug,
    description: row.description,
    audience: row.audience,
    sampleMarkets: row.sample_markets,
    links: row.links,
    currency: row.currency,
    status: row.status,
    adminNote: row.admin_note,
    startLevel: row.start_level,
    communityId: row.community_id,
    createdAt: row.created_at.toISOString(),
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
  }
}

export async function getOpenApplicationForUser(userId: string): Promise<ApplicationView | null> {
  const [row] = await db
    .select()
    .from(community_applications)
    .where(
      and(eq(community_applications.user_id, userId), inArray(community_applications.status, ['pending', 'more_info'])),
    )
    .orderBy(desc(community_applications.created_at))
    .limit(1)
  return row ? toView(row) : null
}

export async function listApplicationsForUser(userId: string): Promise<ApplicationView[]> {
  const rows = await db
    .select()
    .from(community_applications)
    .where(eq(community_applications.user_id, userId))
    .orderBy(desc(community_applications.created_at))
    .limit(10)
  return rows.map(toView)
}

export async function createApplication(input: {
  userId: string
  leaderType: LeaderType
  name: string
  slug: string
  description: string
  audience: string | null
  sampleMarkets: ApplicationSampleMarket[]
  links: string[]
  currency: string
}): Promise<ApplicationView> {
  const [row] = await db
    .insert(community_applications)
    .values({
      user_id: input.userId,
      leader_type: input.leaderType,
      name: input.name,
      slug: input.slug,
      description: input.description,
      audience: input.audience,
      sample_markets: input.sampleMarkets,
      links: input.links,
      currency: input.currency,
      status: 'pending',
    })
    .returning()
  if (!row) {
    throw new Error('Could not save the application.')
  }
  return toView(row)
}

/** Re-submit after "more info": the same row goes back to pending with the new answers. */
export async function updateApplication(
  id: string,
  userId: string,
  input: {
    description: string
    audience: string | null
    sampleMarkets: ApplicationSampleMarket[]
    links: string[]
  },
): Promise<ApplicationView | null> {
  const [row] = await db
    .update(community_applications)
    .set({
      description: input.description,
      audience: input.audience,
      sample_markets: input.sampleMarkets,
      links: input.links,
      status: 'pending',
      updated_at: new Date(),
    })
    .where(
      and(
        eq(community_applications.id, id),
        eq(community_applications.user_id, userId),
        eq(community_applications.status, 'more_info'),
      ),
    )
    .returning()
  return row ? toView(row) : null
}

/** Admin: applications by status, newest first, with the applicant. */
export async function listApplicationsForAdmin(
  status: ApplicationStatus | 'all' = 'pending',
): Promise<Array<ApplicationView & { applicant: { id: string; username: string | null; image: string | null } }>> {
  const rows = await db
    .select({
      application: community_applications,
      username: users.username,
      image: users.image,
    })
    .from(community_applications)
    .innerJoin(users, eq(users.id, community_applications.user_id))
    .where(status === 'all' ? undefined : eq(community_applications.status, status))
    .orderBy(desc(community_applications.created_at))
    .limit(200)
  return rows.map((row) => ({
    ...toView(row.application),
    applicant: { id: row.application.user_id, username: row.username, image: row.image },
  }))
}

export async function getApplicationById(id: string): Promise<CommunityApplicationRow | null> {
  const [row] = await db.select().from(community_applications).where(eq(community_applications.id, id)).limit(1)
  return row ?? null
}

/** Admin ruling on an application. Approval also records the community it created. */
export async function reviewApplication(input: {
  id: string
  status: Extract<ApplicationStatus, 'approved' | 'more_info' | 'rejected'>
  note: string | null
  startLevel: number | null
  communityId: string | null
  reviewerId: string
}): Promise<void> {
  await db
    .update(community_applications)
    .set({
      status: input.status,
      admin_note: input.note,
      start_level: input.startLevel,
      community_id: input.communityId,
      reviewed_by: input.reviewerId,
      reviewed_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(community_applications.id, input.id))
}
