import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { AgentsManager } from '@/app/[locale]/admin/agents/_components/AgentsManager'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'

export default async function AdminAgentsPage({ params }: PageProps<'/[locale]/admin/agents'>) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <Suspense fallback={<AgentsSkeleton />}>
      <AgentsGate />
    </Suspense>
  )
}

async function AgentsGate() {
  await requireAdmin()
  return <AgentsManager />
}

function AgentsSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-12 w-64 rounded-sm" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-sm" />)}
      </div>
      <Skeleton className="h-96 rounded-sm" />
    </div>
  )
}
