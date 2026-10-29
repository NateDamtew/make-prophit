import type { Metadata } from 'next'

import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'

import type { SupportedLocale } from '@/i18n/locales'
import type { PoolCardSummary } from '@/lib/pools/activity'

import { MoneySheets } from '@/components/communities/money/MoneySheets'
import { CommunityThemeStyle } from '@/components/community-themes/CommunityThemeStyle'
import { WhiteLabelBrandBar } from '@/components/community-themes/WhiteLabelBrandBar'
import { isOwnerRole } from '@/lib/communities/roles'
import { CommunityRepository } from '@/lib/db/queries/community'
import { getCommunityHome } from '@/lib/db/queries/community-home'
import { CommunityMonetizationRepository } from '@/lib/db/queries/community-monetization'
import { CommunityThemeRepository } from '@/lib/db/queries/community-theme'
import { getTrustCard } from '@/lib/db/queries/community-trust'
import { UserRepository } from '@/lib/db/queries/user'
import { getPoolCardSummaries } from '@/lib/pools/activity'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

import CommunityTabPanels from './_components/home/CommunityTabPanels'
import { CommunityPresetSwitch } from './_components/presets/PresetDispatcher'
import { isCommunityTab } from './_components/shell/community-tabs'
import CommunityBanners from './_components/shell/CommunityBanners'
import CommunityHeader from './_components/shell/CommunityHeader'
import CommunityTabNav from './_components/shell/CommunityTabNav'

type SearchParams = Record<string, string | string[] | undefined>

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  // Bun SQL reads `Date.now()` on connect, which cacheComponents rejects during prerender.
  if (slug === STATIC_PARAMS_PLACEHOLDER) {
    return { title: 'Community' }
  }
  const { data: community } = await CommunityRepository.getBySlug(slug)
  if (!community) {
    return { title: 'Community Not Found' }
  }
  const ogUrl = `/og/community/${community.slug}`
  return {
    title: `${community.name} — Community`,
    description: community.description ?? undefined,
    openGraph: {
      title: community.name,
      description: community.description ?? undefined,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: community.name }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: community.name,
      description: community.description ?? undefined,
      images: [ogUrl],
    },
  }
}

function CommunityLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="size-16 animate-pulse rounded-xl bg-secondary" />
        <div className="space-y-2 pt-1">
          <div className="h-6 w-48 animate-pulse rounded-sm bg-secondary" />
          <div className="h-3 w-72 animate-pulse rounded-sm bg-secondary" />
        </div>
      </div>
      <div className="h-11 animate-pulse rounded-sm bg-secondary/60" />
      <div className="h-96 animate-pulse rounded-xl bg-secondary/40" />
    </div>
  )
}

function firstParam(query: SearchParams, key: string): string | undefined {
  const value = query[key]
  return Array.isArray(value) ? value[0] : value
}

/** The render-time clock the home starts from (the client ticks on from here). */
function requestTimestamp() {
  return Date.now()
}

async function CommunityContent({ slug, searchParams }: { slug: string; searchParams: Promise<SearchParams> }) {
  // Request-time render: the clock and the viewer's session are read here.
  await connection()
  const query = await searchParams
  const { data: community } = await CommunityRepository.getBySlug(slug)
  if (!community) {
    notFound()
  }

  const user = await UserRepository.getCurrentUser({ minimal: true })
  const { data: memberRole } = user ? await CommunityRepository.getMemberRole(community.id, user.id) : { data: null }

  const [{ data: members }, { data: markets }, { data: reviews }, monetization, theme, trust, home] = await Promise.all(
    [
      CommunityRepository.listMembers(community.id),
      CommunityRepository.listMarketsWithVoteTallies(community.id),
      CommunityRepository.listReviews(community.id),
      CommunityMonetizationRepository.getFields(community.id).catch(() => null),
      CommunityThemeRepository.get(community.id),
      getTrustCard(community.id).catch(() => null),
      getCommunityHome(community.id, user?.id ?? null).catch(() => ({
        currency: null,
        yourStakes: [],
        topStakers: [],
        openMarkets: 0,
        volume30dMinor: '0',
      })),
    ],
  )

  // Pool totals drive the odds and volume on every market card.
  const poolSummaries: Record<string, PoolCardSummary> = await getPoolCardSummaries(
    (markets ?? []).map((market) => market.id),
  ).catch(() => ({}))
  const marketsWithPools = (markets ?? []).map((market) => ({ ...market, pool: poolSummaries[market.id] ?? null }))

  const isVerified = monetization?.is_verified ?? false
  const communityWithVerified = { ...community, is_verified: isVerified }
  const tabParam = firstParam(query, 'tab')
  const tab = isCommunityTab(tabParam) ? tabParam : 'markets'
  const previewParam = process.env.NODE_ENV === 'production' ? undefined : firstParam(query, 'preview')
  const bannerPreview =
    previewParam === 'paused' || previewParam === 'dormant' || previewParam === 'level0' ? previewParam : null
  const pinnedMarketId = firstParam(query, 'm') ?? null
  const themeScopeId = `community-theme-${community.id}`
  const presetProps = {
    community: communityWithVerified,
    members: members ?? [],
    markets: marketsWithPools,
    reviews: reviews ?? [],
    memberRole,
    currentUserId: user?.id ?? null,
    theme,
    trust,
    home,
    pinnedMarketId,
    serverNow: requestTimestamp(),
  }

  return (
    <div id={themeScopeId} className="flex flex-col gap-5">
      <CommunityThemeStyle scopeId={themeScopeId} theme={theme} />
      {isVerified ? (
        <WhiteLabelBrandBar communityName={community.name} communityIcon={community.icon_url ?? null} />
      ) : null}
      <CommunityHeader
        community={communityWithVerified}
        trust={trust}
        memberRole={memberRole}
        currentUserId={user?.id ?? null}
      />
      <MoneySheets community={{ slug: community.slug, name: community.name }} signedIn={Boolean(user)} />
      <CommunityBanners trust={trust} isOwner={isOwnerRole(memberRole)} preview={bannerPreview} />
      <CommunityTabNav
        slug={community.slug}
        active={tab}
        counts={{ markets: home.openMarkets, members: members?.length ?? 0, reviews: reviews?.length ?? 0 }}
      />
      {tab === 'markets' ? (
        <CommunityPresetSwitch preset={theme.layout_preset} {...presetProps} />
      ) : (
        <CommunityTabPanels tab={tab} {...presetProps} />
      )}
    </div>
  )
}

export default async function CommunityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<SearchParams>
}) {
  const { locale, slug } = await params
  setRequestLocale(locale as SupportedLocale)

  if (slug === STATIC_PARAMS_PLACEHOLDER) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Suspense fallback={<CommunityLoadingSkeleton />}>
        <CommunityContent slug={slug} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
