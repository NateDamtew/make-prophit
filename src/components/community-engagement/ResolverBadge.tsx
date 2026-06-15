import { GavelIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ResolverBadgeProps {
  marketsResolved: number
  upheldRate: number | null
  className?: string
  variant?: 'inline' | 'block'
}

/**
 * Compact badge showing a juror's track record. Renders nothing if they
 * haven't resolved any markets yet — keeps unranked members clean.
 *
 *   variant="inline" — one-line pill for member lists
 *   variant="block"  — small card for profile pages (future use)
 */
export function ResolverBadge({ marketsResolved, upheldRate, className, variant = 'inline' }: ResolverBadgeProps) {
  if (!marketsResolved) {
    return null
  }
  const ratePct = upheldRate == null ? null : Math.round(upheldRate * 100)
  const tone
    = ratePct == null
      ? 'text-muted-foreground'
      : ratePct >= 80
        ? 'text-(--yes)'
        : ratePct >= 50
          ? 'text-amber-600'
          : 'text-(--no)'

  if (variant === 'block') {
    return (
      <div className={cn('rounded-sm border bg-card px-3 py-2', className)}>
        <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase text-muted-foreground">
          <GavelIcon className="size-3.5" />
          Resolver record
        </div>
        <p className="mt-1 text-sm">
          <strong className="tabular-nums">{marketsResolved}</strong>
          {' '}
          markets
          {ratePct != null && (
            <>
              {' · '}
              <span className={tone}>{ratePct}% upheld</span>
            </>
          )}
        </p>
      </div>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium',
        className,
      )}
      title={`Voted on ${marketsResolved} resolved markets${ratePct == null ? '' : `, ${ratePct}% upheld`}`}
    >
      <GavelIcon className="size-3 opacity-70" />
      <span className="tabular-nums">{marketsResolved}</span>
      {ratePct != null && (
        <span className={tone}>
          ·
          {' '}
          {ratePct}
          %
        </span>
      )}
    </span>
  )
}
