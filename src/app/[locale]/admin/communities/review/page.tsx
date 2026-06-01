import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { Clock, AlertCircle } from 'lucide-react'
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

async function ReviewQueueContent() {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user?.is_admin) {
    redirect('/' as any)
  }

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
        pendingMarkets={pendingList.map(row => ({
          ...row.market,
          community_slug: row.community_slug,
          community_name: row.community_name,
          community_icon: row.community_icon,
          creator_username: row.creator_username,
        }))}
        failureMarkets={failureList.map(row => ({
          ...row.market,
          community_slug: row.community_slug,
          community_name: row.community_name,
        }))}
      />
    </>
  )
}

export default async function AdminCommunityReviewPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Community Market Reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review markets submitted by community admins. Approving deploys the
          market on-chain via the platform&apos;s signer pool.
        </p>
      </div>

      <Suspense fallback={<PageLoadingSkeleton />}>
        <ReviewQueueContent />
      </Suspense>
    </div>
  )
}
