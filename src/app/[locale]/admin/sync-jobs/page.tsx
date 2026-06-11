import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { SyncJobsManager } from '@/app/[locale]/admin/sync-jobs/_components/SyncJobsManager'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminSyncJobsPage({ params }: PageProps<'/[locale]/admin/sync-jobs'>) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<SyncJobsSkeleton />}>
      <SyncJobsGate />
    </Suspense>
  )
}

async function SyncJobsGate() {
  await requireAdmin()
  return <SyncJobsManager />
}

function SyncJobsSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-12 w-64 rounded-sm" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-sm" />)}
      </div>
      <Skeleton className="h-96 rounded-sm" />
    </div>
  )
}
