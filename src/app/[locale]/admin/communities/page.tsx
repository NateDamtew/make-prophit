import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { AdminCommunitiesManager } from '@/app/[locale]/admin/communities/_components/AdminCommunitiesManager'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminCommunitiesPage({ params }: PageProps<'/[locale]/admin/communities'>) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-sm" />}>
      <CommunitiesGate />
    </Suspense>
  )
}

async function CommunitiesGate() {
  await requireAdmin()
  return <AdminCommunitiesManager />
}
