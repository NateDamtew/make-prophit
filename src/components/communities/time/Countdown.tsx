'use client'

import { Clock3Icon } from 'lucide-react'
import { useLocale } from 'next-intl'

import { formatCloseLabel, formatCountdown, formatShortCountdown } from '@/components/communities/format'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { cn } from '@/lib/utils'

/**
 * Time left, written calmly. Words when there is time ("Closes Sat 13 Dec,
 * 11:59 pm · in 3 days"), digits only under two hours, a live dot while
 * closing. Never red, never flashing, never yellow.
 */

interface CountdownProps {
  target: Date | string | number | null
  /** What the moment is: the verb before the time. */
  verb?: string
  /** Compact strip form ("18h 20m") for cards and bars. */
  compact?: boolean
  /** Add a 4px progress bar from `start` to `target`. */
  start?: Date | string | number | null
  className?: string
}

export function Countdown({ target, verb = 'Closes', compact = false, start = null, className }: CountdownProps) {
  const locale = useLocale()
  const now = useNowTimestamp()
  const targetMs = target === null ? Number.NaN : new Date(target).getTime()
  if (!Number.isFinite(targetMs)) {
    return null
  }
  const remaining = now === null ? Number.NaN : targetMs - now
  const closing = Number.isFinite(remaining) && remaining > 0 && remaining < 2 * 60 * 60 * 1000
  const startMs = start === null ? Number.NaN : new Date(start).getTime()
  const progress =
    Number.isFinite(startMs) && Number.isFinite(remaining) && targetMs > startMs
      ? Math.max(0, Math.min(1, 1 - remaining / (targetMs - startMs)))
      : null

  if (compact) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums', className)}>
        {closing ? (
          <span className="relative inline-flex size-2" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-foreground/15" />
            <span className="absolute inset-0.5 rounded-full bg-foreground" />
          </span>
        ) : (
          <Clock3Icon className="size-3.5" aria-hidden="true" />
        )}
        <span>
          {verb} in {Number.isFinite(remaining) ? formatShortCountdown(remaining) : '…'}
        </span>
      </span>
    )
  }

  if (closing) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="relative inline-flex size-2" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-foreground/15" />
            <span className="absolute inset-0.5 rounded-full bg-foreground" />
          </span>
          Closing soon
          <span className="font-normal text-muted-foreground">· {formatCloseLabel(targetMs, locale, now)}</span>
        </div>
        <div className="text-[28px]/none font-bold tabular-nums">{formatCountdown(remaining)}</div>
        {progress !== null && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            <span className="block h-full bg-muted-foreground" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
    )
  }

  return (
    <span
      className={cn('inline-flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground tabular-nums', className)}
    >
      <Clock3Icon className="size-4" aria-hidden="true" />
      <span>
        {verb} <strong className="font-semibold text-foreground">{formatCloseLabel(targetMs, locale, now)}</strong>
        {Number.isFinite(remaining) && remaining > 0 ? ` · ${formatCountdown(remaining)}` : null}
      </span>
    </span>
  )
}
