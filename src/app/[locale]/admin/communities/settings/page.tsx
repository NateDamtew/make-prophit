import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

import { CommunitySettingsManager } from '@/app/[locale]/admin/communities/settings/_components/CommunitySettingsManager'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminCommunitySettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-sm" />}>
      <SettingsGate />
    </Suspense>
  )
}

async function SettingsGate() {
  await requireAdmin()
  return <CommunitySettingsManager />
}
