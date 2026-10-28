import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

import { AdminApplicationsManager } from '@/app/[locale]/admin/communities/applications/_components/AdminApplicationsManager'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminApplicationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-sm" />}>
      <ApplicationsGate />
    </Suspense>
  )
}

async function ApplicationsGate() {
  await requireAdmin()
  return <AdminApplicationsManager />
}
