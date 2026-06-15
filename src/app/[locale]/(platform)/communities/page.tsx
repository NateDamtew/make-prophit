import type { SupportedLocale } from '@/i18n/locales'
import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityDiscoveryRepository } from '@/lib/db/queries/community-discovery'
import { MyCommunitiesRepository } from '@/lib/db/queries/my-communities'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'
import CommunitiesBrowse from './_components/CommunitiesBrowse'

export async function generateStaticParams() {
  return [{ locale: STATIC_PARAMS_PLACEHOLDER }]
}

function CommunitiesLoadingSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-8 h-32 animate-pulse rounded-2xl bg-muted/50" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted/30" />
        ))}
      </div>
    </div>
  )
}

async function CommunitiesContent() {
  const viewer = await UserRepository.getCurrentUser({ minimal: true })
  const [
    { data: communities },
    { data: featuredMarkets },
    joined,
    trending,
    categories,
  ] = await Promise.all([
    CommunityRepository.listPublic({ limit: 30, sort: 'popular' }),
    CommunityRepository.listFeaturedMarkets(8),
    viewer ? MyCommunitiesRepository.listForUser(viewer.id) : Promise.resolve([]),
    CommunityDiscoveryRepository.listTrending(30),
    CommunityDiscoveryRepository.listCategories(12),
  ])

  return (
    <CommunitiesBrowse
      initialCommunities={communities ?? []}
      featuredMarkets={featuredMarkets ?? []}
      joinedCommunityIds={joined.map(c => c.id)}
      trendingCommunities={trending as any}
      categories={categories}
    />
  )
}

export default async function CommunitiesPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale as SupportedLocale)

  return (
    <Suspense fallback={<CommunitiesLoadingSkeleton />}>
      <CommunitiesContent />
    </Suspense>
  )
}
