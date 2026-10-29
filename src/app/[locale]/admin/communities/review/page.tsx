import { Clock, AlertCircle } from 'lucide-react'
import { setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'

import ReviewQueueClient from './_components/ReviewQueueClient'

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-8 w-12 animate-pulse rounded bg-muted" />
      <div className="mt-1 h-3 w-20 animate-pulse rounded bg-muted" />
    </div>
  )
}

function PageLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="h-64 animate-pulse rounded-2xl border bg-muted/30" />
    </div>
  )
}

/** Read after the session lookup (cookies), so the page is dynamic by then. */
function requestTimestamp() {
  return Date.now()
}

async function ReviewQueueContent() {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user?.is_admin) {
    redirect('/' as any)
  }
  const reviewedAt = requestTimestamp()

  const [pending, failures] = await Promise.all([
    CommunityRepository.listPendingReviews({ limit: 50 }),
    CommunityRepository.listDeployFailures(),
  ])

  const pendingList = pending.data ?? []
  const failureList = failures.data ?? []

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-amber-600" />
            <p className="text-sm font-medium">Pending Review</p>
          </div>
          <p className="mt-2 text-2xl font-bold">{pendingList.length}</p>
          <p className="text-xs text-muted-foreground">awaiting your action</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 text-destructive" />
            <p className="text-sm font-medium">Deploy Issues</p>
          </div>
          <p className="mt-2 text-2xl font-bold">{failureList.length}</p>
          <p className="text-xs text-muted-foreground">need intervention</p>
        </div>
      </div>

      <ReviewQueueClient
        pendingMarkets={pendingList.map((row) => ({
          ...row.market,
          community_slug: row.community_slug,
          community_name: row.community_name,
          community_icon: row.community_icon,
          community_tier: row.community_tier,
          community_level: row.community_level,
          creator_username: row.creator_username,
        }))}
        failureMarkets={failureList.map((row) => ({
          ...row.market,
          community_slug: row.community_slug,
          community_name: row.community_name,
        }))}
        reviewedAt={reviewedAt}
      />
    </>
  )
}

export default async function AdminCommunityReviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Community market reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Markets leaders submitted: read them as written, check the date and the source, then approve, send back with a
          note, or reject. Pool markets open at once on approval; order-book markets go on-chain.
        </p>
      </div>

      <Suspense fallback={<PageLoadingSkeleton />}>
        <ReviewQueueContent />
      </Suspense>
    </div>
  )
}
