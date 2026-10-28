import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

import type { SupportedLocale } from '@/i18n/locales'
import type { PoolCardSummary } from '@/lib/pools/activity'

import { CommunityRepository } from '@/lib/db/queries/community'
import { listCommunitiesForExplore } from '@/lib/db/queries/community-home'
import { UserRepository } from '@/lib/db/queries/user'
import { getPoolCardSummaries } from '@/lib/pools/activity'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

import CommunitiesBrowse from './_components/CommunitiesBrowse'

export async function generateStaticParams() {
  return [{ locale: STATIC_PARAMS_PLACEHOLDER }]
}

function CommunitiesLoadingSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8 h-10 w-64 animate-pulse rounded-sm bg-secondary" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-xl bg-secondary/50" />
        ))}
      </div>
    </div>
  )
}

async function CommunitiesContent() {
  const viewer = await UserRepository.getCurrentUser({ minimal: true })
  const [communities, { data: featuredMarkets }] = await Promise.all([
    listCommunitiesForExplore({ limit: 60, userId: viewer?.id ?? null }),
    CommunityRepository.listFeaturedMarkets(6),
  ])

  const poolSummaries: Record<string, PoolCardSummary> = await getPoolCardSummaries(
    (featuredMarkets ?? []).map((market) => market.id),
  ).catch(() => ({}))
  const featuredWithPools = (featuredMarkets ?? [])
    .map((market) => ({ ...market, pool: poolSummaries[market.id] ?? null }))
    .filter((market) => market.pool !== null && market.pool.state === 'open')

  return <CommunitiesBrowse communities={communities} featuredMarkets={featuredWithPools} signedIn={Boolean(viewer)} />
}

export default async function CommunitiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale as SupportedLocale)

  return (
    <Suspense fallback={<CommunitiesLoadingSkeleton />}>
      <CommunitiesContent />
    </Suspense>
  )
}
