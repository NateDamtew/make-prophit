import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { NotificationComposer } from '@/app/[locale]/admin/notifications/_components/NotificationComposer'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminNotificationsPage({ params }: PageProps<'/[locale]/admin/notifications'>) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-2xl rounded-sm" />}>
      <NotificationsGate />
    </Suspense>
  )
}

async function NotificationsGate() {
  await requireAdmin()
  return <NotificationComposer />
}
