import { CalendarIcon, ClipboardListIcon, UsersIcon, UsersRoundIcon } from 'lucide-react'
import { setRequestLocale } from 'next-intl/server'
import Link from 'next/link'
import { Suspense } from 'react'
import { ActivityFeed } from '@/app/[locale]/admin/overview/_components/ActivityFeed'
import { formatCompact, formatNumber } from '@/components/admin-ui/format'
import { KpiCard } from '@/components/admin-ui/KpiCard'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { WaitlistStatusBadge } from '@/components/admin-ui/WaitlistStatusBadge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getRecentAuditEvents } from '@/lib/admin-ui/audit'
import { requireAdmin } from '@/lib/admin-ui/guard'
import { getOverviewStats } from '@/lib/admin-ui/overview-stats'
import { WAITLIST_STATUSES } from '@/lib/db/schema/waitlist/tables'

export default async function AdminOverviewPage({ params }: PageProps<'/[locale]/admin/overview'>) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Overview"
        description="A snapshot of your platform — users, events, communities, and waitlist growth."
      />
      {/* Dynamic data (admin session + DB) streams inside Suspense so the static
          shell renders immediately — required by cacheComponents. */}
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent />
      </Suspense>
    </section>
  )
}

async function OverviewContent() {
  await requireAdmin()

  const [stats, activity] = await Promise.all([
    getOverviewStats(),
    getRecentAuditEvents(12),
  ])

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total users"
          value={formatNumber(stats.totalUsers)}
          icon={UsersIcon}
          delta={stats.usersWeekDelta ?? undefined}
          deltaSuffix="vs last wk"
        />
        <KpiCard
          label="Waitlist signups"
          value={formatNumber(stats.waitlist.total)}
          icon={ClipboardListIcon}
          delta={stats.waitlist.weekDelta ?? undefined}
          deltaSuffix="vs last wk"
          sparkline={stats.waitlist.sparkline}
        />
        <KpiCard
          label="Active events"
          value={formatCompact(stats.activeEvents)}
          icon={CalendarIcon}
          hint="Status: active"
        />
        <KpiCard
          label="Communities"
          value={formatNumber(stats.communities)}
          icon={UsersRoundIcon}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <ActivityFeed items={activity} />

        <Card className="gap-0 p-0">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <h2 className="font-semibold">Waitlist breakdown</h2>
            <Link href="/admin/waitlist" className="text-xs font-medium text-primary hover:underline">
              Manage →
            </Link>
          </div>
          <ul className="divide-y divide-border/50">
            {WAITLIST_STATUSES.map(status => (
              <li key={status} className="flex items-center justify-between px-5 py-3">
                <WaitlistStatusBadge status={status} />
                <span className="text-sm font-medium tabular-nums">
                  {formatNumber(stats.waitlist.byStatus[status] ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}

function OverviewSkeleton() {
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-sm" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-80 rounded-sm" />
        <Skeleton className="h-80 rounded-sm" />
      </div>
    </div>
  )
}
