import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

import { PaymentsManager } from '@/app/[locale]/admin/payments/_components/PaymentsManager'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminPaymentsPage({ params }: PageProps<'/[locale]/admin/payments'>) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<PaymentsSkeleton />}>
      <PaymentsGate />
    </Suspense>
  )
}

async function PaymentsGate() {
  await requireAdmin()
  return <PaymentsManager />
}

function PaymentsSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-12 w-64 rounded-sm" />
      <Skeleton className="h-96 rounded-sm" />
    </div>
  )
}
