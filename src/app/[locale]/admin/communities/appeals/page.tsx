import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

import { AdminAppealsManager } from '@/app/[locale]/admin/communities/appeals/_components/AdminAppealsManager'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminAppealsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-sm" />}>
      <AppealsGate />
    </Suspense>
  )
}

/** Read after the admin check (which reads cookies), so the page is dynamic by then. */
function requestTimestamp() {
  return Date.now()
}

async function AppealsGate() {
  await requireAdmin()
  return <AdminAppealsManager loadedAt={requestTimestamp()} />
}
