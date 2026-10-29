import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'

import type { SupportedLocale } from '@/i18n/locales'

import { previewAppeal } from '@/components/communities/dev/fixtures'
import { getAppealView, getAppealViewerState } from '@/lib/communities/appeals-service'
import { getVotesForViewer } from '@/lib/communities/jury-service'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'
import { getPoolSummary } from '@/lib/pools/service'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

import AppealPage from './_components/AppealPage'

export function generateStaticParams() {
  return [{ locale: STATIC_PARAMS_PLACEHOLDER, slug: STATIC_PARAMS_PLACEHOLDER, marketId: STATIC_PARAMS_PLACEHOLDER }]
}

/** The request clock, read once per render after `connection()`. */
function requestTimestamp() {
  return Date.now()
}

function firstParam(query: Record<string, string | string[] | undefined>, key: string) {
  const value = query[key]
  return Array.isArray(value) ? value[0] : value
}

function Loading() {
  return <div className="h-96 animate-pulse rounded-xl bg-secondary/50" />
}

async function AppealContent({
  slug,
  marketId,
  searchParams,
}: {
  slug: string
  marketId: string
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await connection()
  const [{ data }, user, query] = await Promise.all([
    CommunityRepository.getMarketWithCommunity(marketId),
    UserRepository.getCurrentUser({ minimal: true }),
    searchParams,
  ])
  if (!data || data.community.slug !== slug) {
    notFound()
  }
  const serverNow = requestTimestamp()
  const previewState = process.env.NODE_ENV === 'production' ? undefined : firstParam(query, 'preview')
  const preview = previewState ? previewAppeal(previewState, serverNow, user?.id ?? 'preview-viewer') : null
  const [appeal, viewer, summary, votes] = preview
    ? [preview.appeal, preview.viewer, null, preview.votes]
    : await Promise.all([
        getAppealView(marketId),
        getAppealViewerState(marketId, user?.id ?? null),
        getPoolSummary(marketId, user?.id ?? null).catch(() => null),
        getVotesForViewer(marketId, user?.id ?? null),
      ])
  return (
    <AppealPage
      market={{
        id: data.market.id,
        title: data.market.title,
        resolvedOutcome: preview?.resolvedOutcome ?? data.market.resolved_outcome,
        outcomeYes: data.market.binary_outcome_yes,
        outcomeNo: data.market.binary_outcome_no,
        jurySeatCount: data.market.jury_seat_count,
      }}
      community={{ id: data.community.id, slug: data.community.slug, name: data.community.name }}
      appeal={appeal}
      viewer={viewer}
      pool={
        preview?.pool ??
        (summary
          ? {
              state: summary.pool.state,
              settledOutcome: summary.pool.settledOutcome,
              holdUntil: summary.pool.holdUntil,
              holdExtendedUntil: summary.pool.holdExtendedUntil,
              payoutsFrozen: summary.pool.payoutsFrozen,
              totalMinor: (BigInt(summary.pool.totalYes) + BigInt(summary.pool.totalNo)).toString(),
              currency: summary.pool.currency,
            }
          : null)
      }
      votes={votes.map((vote) => ({
        id: vote.id,
        vote: vote.vote,
        username: vote.juror_username,
        image: vote.juror_image,
      }))}
      signedIn={Boolean(user)}
      serverNow={serverNow}
    />
  )
}

export default async function MarketAppealRoute({
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
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-28 sm:px-6 lg:pb-10">
      <Suspense fallback={<Loading />}>
        <AppealContent slug={slug} marketId={marketId} searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
