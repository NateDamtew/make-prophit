'use client'

import { useLocale } from 'next-intl'

import { formatCloseLabel, formatShortCountdown } from '@/components/communities/format'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { cn } from '@/lib/utils'

/**
 * The 24-hour hold after a result: when payouts land, how far along the hold
 * is, and why it exists.
 */

interface HoldCardProps {
  /** When the result was announced (the hold starts here). */
  announcedAt: Date | string | number
  /** When payouts land if no appeal is backed. */
  paysAt: Date | string | number
  /** True when an open appeal has extended the window. */
  extended?: boolean
  className?: string
}

export function HoldCard({ announcedAt, paysAt, extended = false, className }: HoldCardProps) {
  const locale = useLocale()
  const now = useNowTimestamp()
  const startMs = new Date(announcedAt).getTime()
  const endMs = new Date(paysAt).getTime()
  const remaining = now === null ? null : Math.max(0, endMs - now)
  const progress = now === null || endMs <= startMs ? 0 : Math.max(0, Math.min(1, (now - startMs) / (endMs - startMs)))

  return (
    <div className={cn('flex flex-col gap-2 rounded-xl bg-secondary p-4', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">
          Payouts in <span className="tabular-nums">{remaining === null ? '…' : formatShortCountdown(remaining)}</span>
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">{formatCloseLabel(endMs, locale, now)}</p>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-background" aria-hidden="true">
        <span className="block h-full rounded-full bg-foreground" style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="text-xs/relaxed text-muted-foreground">
        {extended
          ? 'An appeal is open, so the hold runs up to 48 hours. Payouts wait until it closes.'
          : 'Results wait 24 hours before anyone is paid, so any staker can check the verdicts and appeal.'}
      </p>
    </div>
  )
}
