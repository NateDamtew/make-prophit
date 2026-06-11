import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { BarChart } from '@/components/admin-ui/BarChart'
import { formatNumber } from '@/components/admin-ui/format'
import { KpiCard } from '@/components/admin-ui/KpiCard'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getAnalyticsData } from '@/lib/admin-ui/analytics-stats'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminAnalyticsPage({ params }: PageProps<'/[locale]/admin/analytics'>) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <section className="grid gap-6">
      <PageHeader title="Analytics" description="Growth trends over the last 30 days." />
      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsContent />
      </Suspense>
    </section>
  )
}

async function AnalyticsContent() {
  await requireAdmin()
  const data = await getAnalyticsData(30)

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard
          label="New users (30d)"
          value={formatNumber(data.totals.newUsers)}
          sparkline={data.newUsers.map(d => d.count)}
        />
        <KpiCard
          label="Waitlist signups (30d)"
          value={formatNumber(data.totals.waitlistSignups)}
          sparkline={data.waitlistSignups.map(d => d.count)}
        />
      </div>

      <Card className="gap-4 p-6">
        <h2 className="font-semibold">New users per day</h2>
        <BarChart data={data.newUsers} />
      </Card>

      <Card className="gap-4 p-6">
        <h2 className="font-semibold">Waitlist signups per day</h2>
        <BarChart data={data.waitlistSignups} />
      </Card>
    </>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-sm" />
        <Skeleton className="h-28 rounded-sm" />
      </div>
      <Skeleton className="h-64 rounded-sm" />
      <Skeleton className="h-64 rounded-sm" />
    </div>
  )
}
