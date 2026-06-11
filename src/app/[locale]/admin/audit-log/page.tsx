import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { AuditLogManager } from '@/app/[locale]/admin/audit-log/_components/AuditLogManager'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminAuditLogPage({ params }: PageProps<'/[locale]/admin/audit-log'>) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<AuditLogSkeleton />}>
      <AuditLogGate />
    </Suspense>
  )
}

async function AuditLogGate() {
  await requireAdmin()
  return <AuditLogManager />
}

function AuditLogSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-12 w-64 rounded-sm" />
      <Skeleton className="h-96 rounded-sm" />
    </div>
  )
}
