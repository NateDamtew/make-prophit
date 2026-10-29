import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

import { AdminSuggestionsManager } from '@/app/[locale]/admin/communities/suggestions/_components/AdminSuggestionsManager'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminSuggestionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-sm" />}>
      <SuggestionsGate />
    </Suspense>
  )
}

async function SuggestionsGate() {
  await requireAdmin()
  return <AdminSuggestionsManager />
}
