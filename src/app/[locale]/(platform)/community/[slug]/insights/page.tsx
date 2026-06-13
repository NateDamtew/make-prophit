import type { SupportedLocale } from '@/i18n/locales'
import {
  ActivityIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ClockIcon,
  GitPullRequestIcon,
  MessageCircleIcon,
  ShieldCheckIcon,
  UsersIcon,
} from 'lucide-react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { formatAbsolute, formatNumber, formatRelativeTime } from '@/components/admin-ui/format'
import { KpiCard } from '@/components/admin-ui/KpiCard'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CommunityRepository } from '@/lib/db/queries/community'
import {
  getCommunityKpis,
  getMemberGrowth,
  getRecentCommunityEvents,
  getRejectionReasons,
  getTopMarkets,
} from '@/lib/db/queries/community-insights'
import { CommunityMonetizationRepository } from '@/lib/db/queries/community-monetization'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
}

function buildDenseSeries(rows: Array<{ date: string, count: number }>, days: number): number[] {
  const byDate = new Map(rows.map(r => [r.date, r.count]))
  const series: number[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    series.push(byDate.get(d.toISOString().slice(0, 10)) ?? 0)
  }
  return series
}

function formatHours(hours: number | null): string {
  if (hours == null) {
    return '—'
  }
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`
  }
  if (hours < 48) {
    return `${hours.toFixed(1)}h`
  }
  return `${Math.round(hours / 24)}d`
}

async function InsightsContent({ slug }: { slug: string }) {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    redirect(`/community/${slug}` as any)
  }

  const { data: community } = await CommunityRepository.getBySlug(slug)
  if (!community) {
    notFound()
  }

  const { data: role } = await CommunityRepository.getMemberRole(community.id, user.id)
  if (role !== 'admin' && !user.is_admin) {
    redirect(`/community/${slug}` as any)
  }

  const [kpis, growth, topMarkets, recent, rejections, monetization] = await Promise.all([
    getCommunityKpis(community.id),
    getMemberGrowth(community.id, 30),
    getTopMarkets(community.id, 5),
    getRecentCommunityEvents(community.id, 12),
    getRejectionReasons(community.id, 5),
    CommunityMonetizationRepository.getFields(community.id),
  ])

  const sparkline = buildDenseSeries(growth, 30)
  const feeBps = monetization?.community_fee_bps ?? 0
  const feePct = feeBps / 100

  return (
    <div className="grid gap-6">
      <header>
        <Link
          href={`/community/${community.slug}` as any}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
          Back to
          {' '}
          {community.name}
        </Link>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Insights</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Members, markets, engagement, and the review pipeline for
              {' '}
              {community.name}
              .
            </p>
          </div>
          <Link
            href={`/community/${community.slug}/insights/payouts` as any}
            className="text-sm font-medium text-primary hover:underline"
          >
            Payouts →
          </Link>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Members"
          value={formatNumber(kpis.members.total)}
          icon={UsersIcon}
          delta={kpis.members.weeklyDelta ?? undefined}
          deltaSuffix="vs last wk"
          sparkline={sparkline}
        />
        <KpiCard
          label="Active markets"
          value={formatNumber(kpis.markets.active)}
          icon={CalendarIcon}
          hint={`${kpis.markets.resolved} resolved`}
        />
        <KpiCard
          label="In review"
          value={formatNumber(kpis.markets.pending)}
          icon={GitPullRequestIcon}
          hint={kpis.markets.medianTimeToReviewHours != null
            ? `median ${formatHours(kpis.markets.medianTimeToReviewHours)}`
            : 'no history yet'}
        />
        <KpiCard
          label="Engagement (30d)"
          value={formatNumber(kpis.engagement.comments30d + kpis.engagement.reactions30d)}
          icon={MessageCircleIcon}
          hint={`${formatNumber(kpis.engagement.comments30d)} comments · ${formatNumber(kpis.engagement.reactions30d)} reactions`}
        />
      </div>

      {/* Two-column grid: review pipeline + top markets */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Review pipeline */}
        <Card className="gap-0 p-0">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <h2 className="text-sm font-semibold">Review pipeline</h2>
            <span className="text-xs text-muted-foreground">Phase 1 + 2 events</span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border/50">
            <div className="px-5 py-4">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(kpis.markets.pending)}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-muted-foreground">Median t-to-review</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatHours(kpis.markets.medianTimeToReviewHours)}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-muted-foreground">Verified</p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-xl font-semibold">
                {monetization?.is_verified
                  ? <ShieldCheckIcon className="size-5 text-primary" />
                  : <span className="text-muted-foreground">—</span>}
                <span>{monetization?.is_verified ? 'Yes' : 'No'}</span>
              </p>
            </div>
          </div>
          {rejections.length > 0
            ? (
                <div className="border-t border-border/60 px-5 py-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent rejection reasons</p>
                  <ul className="mt-2 space-y-2 text-sm">
                    {rejections.map(r => (
                      <li key={r.excerpt} className="flex items-start justify-between gap-3">
                        <span className="line-clamp-2 flex-1 text-foreground/80">{r.excerpt}</span>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">
                          {r.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            : (
                <div className="border-t border-border/60 px-5 py-4 text-xs text-muted-foreground">
                  No rejections recorded yet.
                </div>
              )}
        </Card>

        {/* Top markets */}
        <Card className="gap-0 p-0">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <h2 className="text-sm font-semibold">Top markets by engagement</h2>
            <span className="text-xs text-muted-foreground">last 30d activity</span>
          </div>
          {topMarkets.length === 0
            ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No engagement yet. Comments and reactions surface here.
                </div>
              )
            : (
                <ul className="divide-y divide-border/50">
                  {topMarkets.map(m => (
                    <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                      <Link
                        href={`/community/${community.slug}/market/${m.id}` as any}
                        className="min-w-0 flex-1 text-sm font-medium hover:underline"
                      >
                        <span className="line-clamp-1">{m.title}</span>
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatNumber(m.comments)} · {formatNumber(m.reactions)} ❤
                      </span>
                    </li>
                  ))}
                </ul>
              )}
        </Card>
      </div>

      {/* Recent activity feed */}
      <Card className="gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          <span className="text-xs text-muted-foreground">all community events</span>
        </div>
        {recent.length === 0
          ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No activity yet.</div>
            )
          : (
              <ul className="divide-y divide-border/50">
                {recent.map(item => (
                  <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm">
                        <span className="font-mono text-xs text-muted-foreground">{item.kind}</span>
                        {' '}
                        {item.actorLabel && <span className="text-muted-foreground">by {item.actorLabel}</span>}
                      </p>
                      {typeof item.payload?.title === 'string' && (
                        <p className="line-clamp-1 text-xs text-muted-foreground">{item.payload.title as string}</p>
                      )}
                    </div>
                    <time
                      dateTime={item.createdAt}
                      title={formatAbsolute(item.createdAt)}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {formatRelativeTime(item.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
      </Card>

      {/* Monetization preview */}
      <Card className="gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <h2 className="text-sm font-semibold">Revenue share</h2>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ClockIcon className="size-3" />
            Activates once trading is live
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Community fee</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {feePct}
              <span className="text-base font-normal text-muted-foreground">%</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {feeBps}
              {' '}
              bps · set in
              {' '}
              <Link href="/admin/communities" className="font-medium text-primary hover:underline">platform admin</Link>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Payout address</p>
            <p className="mt-1 truncate font-mono text-sm">
              {monetization?.fee_payout_address || <span className="italic text-muted-foreground">Not set</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium">
              <ActivityIcon className="size-4 text-amber-500" />
              Pre-trading
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

function InsightsSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-10 w-64 rounded-sm" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-sm" />)}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-sm" />
        <Skeleton className="h-64 rounded-sm" />
      </div>
      <Skeleton className="h-64 rounded-sm" />
    </div>
  )
}

export default async function CommunityInsightsPage({
  params,
}: {
  params: Promise<{ locale: string, slug: string }>
}) {
  const { locale, slug } = await params
  setRequestLocale(locale as SupportedLocale)

  if (slug === STATIC_PARAMS_PLACEHOLDER) {
    notFound()
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Suspense fallback={<InsightsSkeleton />}>
        <InsightsContent slug={slug} />
      </Suspense>
    </div>
  )
}
