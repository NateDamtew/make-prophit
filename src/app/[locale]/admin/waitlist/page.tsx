import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { WaitlistManager } from '@/app/[locale]/admin/waitlist/_components/WaitlistManager'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminWaitlistPage({ params }: PageProps<'/[locale]/admin/waitlist'>) {
  const { locale } = await params
  setRequestLocale(locale)

  // The admin gate reads headers() (dynamic), so it must run inside a Suspense
  // boundary under cacheComponents. WaitlistManager itself is a client component
  // that fetches its own data.
  return (
    <Suspense fallback={<WaitlistSkeleton />}>
      <WaitlistGate />
    </Suspense>
  )
}

async function WaitlistGate() {
  await requireAdmin()
  return <WaitlistManager />
}

function WaitlistSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-12 w-64 rounded-sm" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-sm" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-sm" />
    </div>
  )
}
