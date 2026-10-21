import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

import { ReconciliationManager } from '@/app/[locale]/admin/reconciliation/_components/ReconciliationManager'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminReconciliationPage({ params }: PageProps<'/[locale]/admin/reconciliation'>) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<ReconciliationSkeleton />}>
      <ReconciliationGate />
    </Suspense>
  )
}

async function ReconciliationGate() {
  await requireAdmin()
  return <ReconciliationManager />
}

function ReconciliationSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-12 w-64 rounded-sm" />
      <Skeleton className="h-64 rounded-sm" />
    </div>
  )
}
