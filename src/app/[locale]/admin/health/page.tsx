import type { HealthState } from '@/lib/admin-ui/health-checks'
import { CheckCircle2Icon, CircleAlertIcon, CircleXIcon } from 'lucide-react'
import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { formatAbsolute } from '@/components/admin-ui/format'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/admin-ui/guard'
import { runHealthChecks } from '@/lib/admin-ui/health-checks'
import { cn } from '@/lib/utils'

const STATE_META: Record<HealthState, { icon: typeof CheckCircle2Icon, className: string, label: string }> = {
  ok: { icon: CheckCircle2Icon, className: 'text-(--yes)', label: 'Operational' },
  warn: { icon: CircleAlertIcon, className: 'text-amber-500', label: 'Optional' },
  down: { icon: CircleXIcon, className: 'text-(--no)', label: 'Down' },
}

export default async function AdminHealthPage({ params }: PageProps<'/[locale]/admin/health'>) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <section className="grid gap-6">
      <PageHeader title="Health" description="Live status of core services and configuration." />
      <Suspense fallback={<Skeleton className="h-80 rounded-sm" />}>
        <HealthContent />
      </Suspense>
    </section>
  )
}

async function HealthContent() {
  await requireAdmin()
  const report = await runHealthChecks()

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>
          Checked
          {' '}
          {formatAbsolute(report.checkedAt)}
        </span>
        {report.deploy.env && (
          <span>
            Env:
            {' '}
            <span className="font-medium text-foreground">{report.deploy.env}</span>
          </span>
        )}
        {report.deploy.commit && (
          <span>
            Commit:
            {' '}
            <span className="font-mono text-foreground">{report.deploy.commit}</span>
          </span>
        )}
      </div>

      <Card className="gap-0 p-0">
        <ul className="divide-y divide-border/50">
          {report.checks.map((check) => {
            const meta = STATE_META[check.state]
            const Icon = meta.icon
            return (
              <li key={check.name} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Icon className={cn('size-5 shrink-0', meta.className)} />
                  <span className="font-medium">{check.name}</span>
                </div>
                <span className="text-sm text-muted-foreground">{check.detail}</span>
              </li>
            )
          })}
        </ul>
      </Card>
    </>
  )
}
