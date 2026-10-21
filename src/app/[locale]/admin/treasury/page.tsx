import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

import { TreasuryManager } from '@/app/[locale]/admin/treasury/_components/TreasuryManager'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminTreasuryPage({ params }: PageProps<'/[locale]/admin/treasury'>) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<TreasurySkeleton />}>
      <TreasuryGate />
    </Suspense>
  )
}

async function TreasuryGate() {
  await requireAdmin()
  return <TreasuryManager />
}

function TreasurySkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-12 w-64 rounded-sm" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28 rounded-sm" />
        <Skeleton className="h-28 rounded-sm" />
        <Skeleton className="h-28 rounded-sm" />
        <Skeleton className="h-28 rounded-sm" />
      </div>
      <Skeleton className="h-96 rounded-sm" />
    </div>
  )
}
