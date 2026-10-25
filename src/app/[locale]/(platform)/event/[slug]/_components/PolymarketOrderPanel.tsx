'use client'

import { BellIcon, CheckIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useState, useTransition } from 'react'

import type { Event, Market } from '@/types'

import { registerPolymarketTradingInterestAction } from '@/app/[locale]/(platform)/event/[slug]/_actions/polymarket-interest'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useAppKit } from '@/hooks/useAppKit'
import { formatCentsLabel } from '@/lib/formatters'
import { resolveFallbackOutcomeUnitPrice } from '@/lib/market-pricing'
import { cn } from '@/lib/utils'
import { useUser } from '@/stores/useUser'

interface PolymarketOrderPanelProps {
  event: Event
  isMobile: boolean
  initialMarket?: Market | null
  className?: string
}

/**
 * Order panel for venue = 'polymarket' events. Shows Polymarket's live
 * prices; until Polymarket trading opens for the user it collects interest
 * instead of taking orders.
 */
export default function PolymarketOrderPanel({ event, isMobile, initialMarket, className }: PolymarketOrderPanelProps) {
  const t = useExtracted()
  const user = useUser()
  const { open: openAppKit } = useAppKit()
  const [isSubmitting, startTransition] = useTransition()
  const [isRegistered, setIsRegistered] = useState(false)
  const market = initialMarket ?? event.markets[0] ?? null

  function handleNotify() {
    if (!user) {
      void openAppKit()
      return
    }
    startTransition(async () => {
      const result = await registerPolymarketTradingInterestAction(event.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setIsRegistered(true)
    })
  }

  return (
    <div className={cn('grid gap-4 rounded-xl border bg-card p-4', !isMobile && 'lg:w-85', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{market?.short_title || market?.title || event.title}</span>
        <Badge variant="outline">{t('On Polymarket')}</Badge>
      </div>

      {market && (
        <div className="grid grid-cols-2 gap-2">
          {market.outcomes.map((outcome) => (
            <div key={outcome.token_id} className="grid gap-0.5 rounded-lg border bg-background px-3 py-2">
              <span className="truncate text-xs text-muted-foreground">{outcome.outcome_text}</span>
              <span className="text-base font-semibold tabular-nums">
                {formatCentsLabel(resolveFallbackOutcomeUnitPrice(market, outcome))}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {t('Trading this market with Polymarket’s full liquidity is coming soon to Prophit.')}
      </p>

      <Button className="h-11 w-full font-semibold" onClick={handleNotify} disabled={isSubmitting || isRegistered}>
        {isRegistered ? <CheckIcon className="size-4" /> : <BellIcon className="size-4" />}
        {isRegistered ? t('We’ll let you know') : t('Notify me when trading opens')}
      </Button>
    </div>
  )
}
