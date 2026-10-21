import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

import { LedgerManager } from '@/app/[locale]/admin/ledger/_components/LedgerManager'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminLedgerPage({ params }: PageProps<'/[locale]/admin/ledger'>) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<LedgerSkeleton />}>
      <LedgerGate />
    </Suspense>
  )
}

async function LedgerGate() {
  await requireAdmin()
  return <LedgerManager />
}

function LedgerSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-12 w-64 rounded-sm" />
      <Skeleton className="h-64 rounded-sm" />
    </div>
  )
}
