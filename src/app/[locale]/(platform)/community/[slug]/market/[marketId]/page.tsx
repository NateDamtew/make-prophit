import type { Metadata } from 'next'

import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import type { SupportedLocale } from '@/i18n/locales'

import { applyMarketPreview, isMarketPreviewState } from '@/components/communities/dev/fixtures'
import { CommunityMarketEmbedButton } from '@/components/community-engagement/EmbedCodeButtonWrapper'
import { ModerationBar } from '@/components/community-engagement/ModerationBar'
import { getAppealView, getAppealViewerState } from '@/lib/communities/appeals-service'
import { getMarketSeats, getViewerSeat, getVotesForViewer } from '@/lib/communities/jury-service'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityIntegrityRepository } from '@/lib/db/queries/community-integrity'
import { getTrustCard } from '@/lib/db/queries/community-trust'
import { UserRepository } from '@/lib/db/queries/user'
import { formatPoolMoney } from '@/lib/pools/format'
import { getPoolSummary } from '@/lib/pools/service'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

import CommunityMarketDetail from './_components/CommunityMarketDetail'
import PoolMarketContent from './_components/pool/PoolMarketContent'

function firstParam(query: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = query[key]
  return Array.isArray(value) ? value[0] : value
}

/** The render-time clock the lifecycle starts from (the client ticks on from here). */
function requestTimestamp() {
  return Date.now()
}

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER, marketId: STATIC_PARAMS_PLACEHOLDER }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ marketId: string; slug: string }>
}): Promise<Metadata> {
  const { marketId } = await params
  // Bun SQL reads `Date.now()` on connect, which cacheComponents rejects during prerender.
  if (marketId === STATIC_PARAMS_PLACEHOLDER) {
    return { title: 'Market' }
  }
  const { data } = await CommunityRepository.getMarketWithCommunity(marketId)
  if (!data) {
    return { title: 'Market not found' }
  }
  // "62% Yes · 48,300 KES pool · closes Sat, Dec 13": the line under a shared link.
  const summary = await getPoolSummary(data.market.id, null).catch(() => null)
  const pool = summary?.pool ?? null
  const closesAt = pool?.closesAt ?? data.market.resolution_date
  const oddsLine = pool
    ? [
        pool.settledOutcome === 'yes'
          ? 'Resolved Yes'
          : pool.settledOutcome === 'no'
            ? 'Resolved No'
            : `${Math.round(pool.odds.yes * 100)}% Yes`,
        `${formatPoolMoney(BigInt(pool.totalYes) + BigInt(pool.totalNo), pool.currency)} pool`,
        closesAt
          ? `${pool.acceptingStakes ? 'closes' : 'closed'} ${new Date(closesAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null
  const description = oddsLine ?? data.market.description ?? `Prediction market in ${data.community.name}`
  return {
    title: `${data.market.title} — ${data.community.name}`,
    description,
    openGraph: {
      title: data.market.title,
      description,
      images: [
        {
          url: `/og/community/${data.community.slug}/market/${data.market.id}`,
          width: 1200,
          height: 630,
          alt: data.market.title,
        },
      ],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: data.market.title,
      description,
      images: [`/og/community/${data.community.slug}/market/${data.market.id}`],
    },
  }
}

export default async function CommunityMarketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string; marketId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale, slug, marketId } = await params
  setRequestLocale(locale as SupportedLocale)

  if (slug === STATIC_PARAMS_PLACEHOLDER || marketId === STATIC_PARAMS_PLACEHOLDER) {
    notFound()
  }

  const { data } = await CommunityRepository.getMarketWithCommunity(marketId)
  if (!data || data.community.slug.toLowerCase() !== slug.toLowerCase()) {
    notFound()
  }

  const user = await UserRepository.getCurrentUser({ minimal: true })
  const { data: memberRole } = user
    ? await CommunityRepository.getMemberRole(data.community.id, user.id)
    : { data: null }

  // Votes stay sealed until they open; the viewer only ever sees their own before that.
  const [votes, moderation, viewerSeat, seats, appeal, appealViewer] = await Promise.all([
    getVotesForViewer(marketId, user?.id ?? null),
    CommunityIntegrityRepository.getModerationFields(marketId),
    getViewerSeat(marketId, user?.id ?? null),
    getMarketSeats(marketId),
    getAppealView(marketId).catch(() => null),
    getAppealViewerState(marketId, user?.id ?? null).catch(() => null),
  ])

  // The Embed button is only useful for actively-trading markets, and only
  // community admins / super-admins should ever see it (it generates iframes
  // any reader could grab from the network tab otherwise).
  const isCommunityAdmin = memberRole === 'admin' || (user as any)?.is_admin === true
  const canManageEmbed = isCommunityAdmin && data.market.status === 'active'
  const embedSlot = canManageEmbed ? <CommunityMarketEmbedButton communitySlug={slug} marketId={marketId} /> : null

  const moderationSlot = isCommunityAdmin ? (
    <ModerationBar
      marketId={marketId}
      initial={{
        is_pinned: moderation?.is_pinned ?? false,
        is_locked: !!moderation?.locked_at,
        is_archived: !!moderation?.archived_at,
      }}
    />
  ) : null

  // Fork: pool-engine markets (no platform event behind them) render with the
  // platform market page layout and trade against the local-currency ledger.
  if (data.market.engine === 'pool' && !data.market.event_id) {
    const [loadedSummary, trust, query] = await Promise.all([
      getPoolSummary(marketId, user?.id ?? null).catch(() => null),
      getTrustCard(data.community.id).catch(() => null),
      searchParams,
    ])
    const requestedStake = firstParam(query, 'stake') ?? firstParam(query, 'outcome')
    const previewState = process.env.NODE_ENV === 'production' ? undefined : firstParam(query, 'preview')
    const serverNow = requestTimestamp()
    const preview = isMarketPreviewState(previewState)
      ? applyMarketPreview(previewState, {
          market: data.market,
          summary: loadedSummary,
          votes: votes ?? [],
          // Previews show the viewer's panels even when signed out (dev only).
          userId: user?.id ?? 'preview-viewer',
          now: serverNow,
        })
      : null
    return (
      <main className="container grid min-h-screen gap-8 pb-12 lg:grid-cols-[minmax(0,3fr)_22.5rem]">
        <PoolMarketContent
          market={preview?.market ?? data.market}
          community={data.community}
          votes={preview?.votes ?? votes ?? []}
          trust={trust}
          memberRole={memberRole}
          currentUserId={user?.id ?? null}
          viewerSeat={viewerSeat}
          seats={seats}
          appeal={preview?.appeal ?? appeal}
          appealViewer={appealViewer}
          initialSummary={preview?.summary ?? loadedSummary}
          initialOutcome={requestedStake === 'no' ? 'no' : 'yes'}
          openStakeOnLoad={requestedStake === 'yes' || requestedStake === 'no'}
          serverNow={serverNow}
          preview={preview !== null}
          headerActions={embedSlot}
          moderationSlot={moderationSlot}
        />
      </main>
    )
  }

  return (
    <CommunityMarketDetail
      market={data.market}
      community={data.community}
      votes={votes ?? []}
      memberRole={memberRole}
      currentUserId={user?.id ?? null}
      embedSlot={embedSlot}
      moderationSlot={moderationSlot}
    />
  )
}
