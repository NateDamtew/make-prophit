import type { LucideIcon } from 'lucide-react'
import { ArrowDownRightIcon, ArrowUpRightIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Sparkline } from './Sparkline'

interface KpiCardProps {
  label: string
  value: string
  icon?: LucideIcon
  /** Percentage change vs prior period. Positive = up (green), negative = down (red). */
  delta?: number
  deltaSuffix?: string
  sparkline?: number[]
  hint?: string
  className?: string
}

function formatDelta(delta: number): string {
  const rounded = Math.abs(Math.round(delta * 10) / 10)
  return `${rounded}%`
}

/**
 * KPI tile: label, big value, optional trend delta, optional sparkline. The
 * building block of the Overview and section header strips.
 */
export function KpiCard({ label, value, icon: Icon, delta, deltaSuffix, sparkline, hint, className }: KpiCardProps) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta)
  const isUp = hasDelta && delta! >= 0

  return (
    <Card className={cn('gap-0 p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {Icon && <Icon className="size-4 text-muted-foreground/70" />}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="grid gap-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
          {hasDelta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-xs font-medium',
                isUp ? 'text-(--yes)' : 'text-(--no)',
              )}
            >
              {isUp ? <ArrowUpRightIcon className="size-3" /> : <ArrowDownRightIcon className="size-3" />}
              {formatDelta(delta!)}
              {deltaSuffix && <span className="text-muted-foreground">{` ${deltaSuffix}`}</span>}
            </span>
          )}
          {!hasDelta && hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>

        {sparkline && sparkline.length > 0 && <Sparkline data={sparkline} className="shrink-0" />}
      </div>
    </Card>
  )
}
