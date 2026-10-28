'use client'

import { Share2Icon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'

import { MOBILE_BOTTOM_NAV_OFFSET } from '@/app/[locale]/(platform)/_lib/mobile-bottom-nav'
import { formatCloseLabel, formatMoney, formatShortCountdown } from '@/components/communities/format'
import { useSheetState } from '@/components/communities/sheet/sheet-state'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { cn } from '@/lib/utils'

import type { MarketLifecycle } from './market-lifecycle'

/**
 * The fixed bar above the pill nav on phones. Open: Yes / No with the odds,
 * one tap opens the stake sheet. Otherwise one calm line about where the
 * market stands, and a share button on a win.
 */

interface MarketBottomBarProps {
  lifecycle: MarketLifecycle
  outcomeLabels: { yes: string; no: string }
  onPick: (side: 'yes' | 'no') => void
  onShareWin: () => void
}

export default function MarketBottomBar({ lifecycle, outcomeLabels, onPick, onShareWin }: MarketBottomBarProps) {
  const t = useExtracted()
  const locale = useLocale()
  const now = useNowTimestamp()
  const sheetOpen = useSheetState((state) => state.openCount > 0)
  const { phase, chance, currency, viewer } = lifecycle
  if (sheetOpen) {
    return null
  }

  let content: React.ReactNode = null
  if (phase === 'open' || phase === 'closing') {
    const yesPct = chance === null ? null : Math.round(chance * 100)
    content = (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPick('yes')}
          className="flex h-13 min-w-0 flex-1 items-center justify-center gap-2 rounded-md bg-yes text-base font-bold text-background tabular-nums"
        >
          <span className="truncate">{outcomeLabels.yes}</span>
          {yesPct !== null ? <span>{yesPct}%</span> : null}
        </button>
        <button
          type="button"
          onClick={() => onPick('no')}
          className="flex h-13 min-w-0 flex-1 items-center justify-center gap-2 rounded-md bg-no text-base font-bold text-background tabular-nums"
        >
          <span className="truncate">{outcomeLabels.no}</span>
          {yesPct !== null ? <span>{100 - yesPct}%</span> : null}
        </button>
      </div>
    )
  } else if (phase === 'awaiting') {
    content = (
      <p className="text-center text-sm font-semibold tabular-nums">
        {lifecycle.juryDueAt !== null
          ? t('Closed · jury decides by {time}', { time: formatCloseLabel(lifecycle.juryDueAt, locale, now) })
          : t('Closed · jury deciding')}
      </p>
    )
  } else if (phase === 'hold' && lifecycle.hold) {
    const remaining = now === null ? null : Math.max(0, lifecycle.hold.paysAt - now)
    content = (
      <p className="text-center text-sm font-semibold tabular-nums">
        {t('Result {outcome} · payouts in {time}', {
          outcome:
            lifecycle.outcome === 'yes' ? outcomeLabels.yes : lifecycle.outcome === 'no' ? outcomeLabels.no : '—',
          time: remaining === null ? '…' : formatShortCountdown(remaining),
        })}
      </p>
    )
  } else if (phase === 'settled' && viewer.result === 'won' && viewer.stake?.payoutMinor) {
    content = (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold tabular-nums">
          {t('You won {amount}', { amount: formatMoney(viewer.stake.payoutMinor, currency) })}
        </p>
        <button
          type="button"
          onClick={onShareWin}
          className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          <Share2Icon className="size-4" aria-hidden="true" />
          {t('Share')}
        </button>
      </div>
    )
  }

  if (!content) {
    return null
  }
  return (
    <div
      className={cn('fixed inset-x-0 z-30 border-t border-border bg-background px-4 py-3 lg:hidden')}
      style={{ bottom: MOBILE_BOTTOM_NAV_OFFSET }}
    >
      {content}
    </div>
  )
}
