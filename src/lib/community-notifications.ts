/**
 * In-app notification helpers for the community workflow.
 *
 * Used by:
 *   - review-actions.ts (approve/reject events)
 *   - community-deploy-hooks.ts (deploy lifecycle events)
 *   - jury vote handler (resolution events)
 */

import { inArray, or, sql } from 'drizzle-orm'
import { getAdminIdentifierLists } from '@/lib/admin'
import { notifications } from '@/lib/db/schema/notifications/tables'
import { users } from '@/lib/db/schema/auth/tables'
import { db } from '@/lib/drizzle'

interface CreateNotificationInput {
  userId: string
  category: string
  title: string
  description: string
  extraInfo?: string
  linkType?: 'community' | 'community_market' | 'admin_review' | 'none'
  linkTarget?: string // e.g. community slug
  linkUrl?: string
  linkLabel?: string
  metadata?: Record<string, unknown>
}

async function createNotification(input: CreateNotificationInput) {
  try {
    await db.insert(notifications).values({
      user_id: input.userId,
      category: input.category,
      title: input.title,
      description: input.description,
      extra_info: input.extraInfo ?? null,
      link_type: input.linkType ?? 'none',
      link_target: input.linkTarget ?? null,
      link_url: input.linkUrl ?? null,
      link_label: input.linkLabel ?? null,
      metadata: input.metadata ?? {},
    })
  }
  catch (err) {
    console.error('[community-notifications] Failed to create notification:', err)
  }
}

async function getAllPlatformAdmins(): Promise<string[]> {
  try {
    const { wallets, emails, usernames } = getAdminIdentifierLists()
    if (wallets.length === 0 && emails.length === 0 && usernames.length === 0) {
      return []
    }

    const conditions: any[] = []
    if (emails.length > 0) {
      conditions.push(inArray(sql`LOWER(${users.email})`, emails))
    }
    if (wallets.length > 0) {
      conditions.push(inArray(sql`LOWER(${users.address})`, wallets))
    }
    if (usernames.length > 0) {
      conditions.push(inArray(sql`LOWER(${users.username})`, usernames))
    }
    if (conditions.length === 0) {
      return []
    }

    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(or(...conditions))

    return rows.map(r => r.id)
  }
  catch (err) {
    console.error('[getAllPlatformAdmins] Failed:', err)
    return []
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Notifications for community admins (creators of markets)
// ────────────────────────────────────────────────────────────────────────────

export async function notifyMarketSubmitted(input: {
  communityAdminId: string
  communitySlug: string
  marketTitle: string
}) {
  await createNotification({
    userId: input.communityAdminId,
    category: 'community_market_review',
    title: 'Market submitted for review',
    description: `"${input.marketTitle}" is awaiting platform admin review.`,
    linkType: 'community',
    linkTarget: input.communitySlug,
    linkUrl: `/community/${input.communitySlug}/markets/new`,
    linkLabel: 'View status',
  })
}

export async function notifyMarketApproved(input: {
  communityAdminId: string
  communitySlug: string
  marketTitle: string
}) {
  await createNotification({
    userId: input.communityAdminId,
    category: 'community_market_review',
    title: 'Market approved!',
    description: `"${input.marketTitle}" was approved and is being deployed on-chain (~5–15 min).`,
    linkType: 'community',
    linkTarget: input.communitySlug,
    linkUrl: `/community/${input.communitySlug}`,
    linkLabel: 'View community',
  })
}

export async function notifyMarketRejected(input: {
  communityAdminId: string
  communitySlug: string
  marketTitle: string
  feedback: string
}) {
  await createNotification({
    userId: input.communityAdminId,
    category: 'community_market_review',
    title: 'Market needs revision',
    description: `"${input.marketTitle}" was rejected. Tap to view feedback and revise.`,
    extraInfo: input.feedback,
    linkType: 'community',
    linkTarget: input.communitySlug,
    linkUrl: `/community/${input.communitySlug}/markets/new`,
    linkLabel: 'Revise market',
  })
}

export async function notifyMarketDeployed(input: {
  communityAdminId: string
  communitySlug: string
  marketTitle: string
  eventSlug: string
}) {
  await createNotification({
    userId: input.communityAdminId,
    category: 'community_market_deployed',
    title: 'Market is live!',
    description: `"${input.marketTitle}" has been deployed and members can now trade.`,
    linkType: 'community_market',
    linkTarget: input.eventSlug,
    linkUrl: `/event/${input.eventSlug}`,
    linkLabel: 'View market',
  })
}

export async function notifyMarketDeployFailed(input: {
  communityAdminId: string
  communitySlug: string
  marketTitle: string
}) {
  await createNotification({
    userId: input.communityAdminId,
    category: 'community_market_deploy_failed',
    title: 'Deployment issue',
    description: `"${input.marketTitle}" hit a deployment issue. The platform team is investigating.`,
    linkType: 'community',
    linkTarget: input.communitySlug,
    linkUrl: `/community/${input.communitySlug}/markets/new`,
    linkLabel: 'View status',
  })
}

export async function notifyMarketResolved(input: {
  communityAdminId: string
  communitySlug: string
  marketTitle: string
  outcome: 'yes' | 'no' | 'cancelled'
}) {
  const outcomeLabel = input.outcome === 'cancelled' ? 'Cancelled' : input.outcome.toUpperCase()
  await createNotification({
    userId: input.communityAdminId,
    category: 'community_market_resolved',
    title: `Market resolved: ${outcomeLabel}`,
    description: `"${input.marketTitle}" was resolved by jury consensus.`,
    linkType: 'community',
    linkTarget: input.communitySlug,
    linkUrl: `/community/${input.communitySlug}`,
    linkLabel: 'View community',
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Notifications for super admins (deploy failures need attention)
// ────────────────────────────────────────────────────────────────────────────

export async function notifySuperAdminsOfDeployFailure(input: {
  marketTitle: string
  communityName: string
  error: string
}) {
  const adminIds = await getAllPlatformAdmins()
  if (adminIds.length === 0) {
    console.warn('[notifySuperAdminsOfDeployFailure] No admins found to notify')
    return
  }
  await Promise.all(adminIds.map(adminId =>
    createNotification({
      userId: adminId,
      category: 'community_market_deploy_failure_admin',
      title: 'Community market deployment failed',
      description: `"${input.marketTitle}" from "${input.communityName}" failed to deploy. Manual review needed.`,
      extraInfo: input.error,
      linkType: 'admin_review',
      linkUrl: '/admin/communities/review',
      linkLabel: 'Open review queue',
    }),
  ))
}
