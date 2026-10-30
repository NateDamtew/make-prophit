'use client'

import { BellIcon, CheckIcon, GlobeIcon, Loader2Icon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'
import { useState, useTransition } from 'react'

import type { Event } from '@/types'

import { registerPolymarketTradingInterestAction } from '@/app/[locale]/(platform)/event/[slug]/_actions/polymarket-interest'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { useAppKit } from '@/hooks/useAppKit'
import { useUser } from '@/stores/useUser'

/** `region`: Polymarket refuses orders from the visitor's country. `coming-soon`: trading isn't open to them yet. */
export type PolymarketNotifyReason = 'region' | 'coming-soon'

interface PolymarketNotifyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reason: PolymarketNotifyReason
  country: string | null
  event: Event
  /** The trade the visitor was about to make, echoed back so the modal keeps their intent. */
  pick: { label: string; amountUsd: number | null; toWinUsd: number | null } | null
}

function useCountryName(country: string | null) {
  const locale = useLocale()
  if (!country) {
    return null
  }
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(country.toUpperCase()) ?? country
  } catch {
    return country
  }
}

/** Shown on Trade when the visitor can't trade this Polymarket market yet; records "notify me" for the event. */
export default function PolymarketNotifyDialog({
  open,
  onOpenChange,
  reason,
  country,
  event,
  pick,
}: PolymarketNotifyDialogProps) {
  const t = useExtracted()
  const user = useUser()
  const { open: openAppKit } = useAppKit()
  const countryName = useCountryName(country)
  const [isSubmitting, startTransition] = useTransition()
  const [isRegistered, setIsRegistered] = useState(false)

  function handleNotify() {
    if (!user) {
      onOpenChange(false)
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

  const title =
    reason === 'region'
      ? countryName
        ? t('Trading isn’t available in {country} yet', { country: countryName })
        : t('Trading isn’t available in your region yet')
      : t('Trading opens soon')
  const description =
    reason === 'region'
      ? t('Polymarket doesn’t take orders from your region. We’ll tell you when you can trade this market on Prophit.')
      : t(
          'Trading this market with Polymarket’s full liquidity is coming soon to Prophit. We’ll tell you the moment it opens.',
        )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            {reason === 'region' ? <GlobeIcon className="size-6" /> : <BellIcon className="size-6" />}
          </div>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription className="text-center">{description}</DialogDescription>
        </DialogHeader>

        {pick && (
          <div className="grid gap-1 rounded-lg border bg-background p-3 text-sm">
            <span className="truncate font-semibold">{pick.label}</span>
            {pick.amountUsd !== null && pick.toWinUsd !== null && (
              <span className="text-muted-foreground tabular-nums">
                {t('${amount} to win ${toWin}', {
                  amount: pick.amountUsd.toFixed(2),
                  toWin: pick.toWinUsd.toFixed(2),
                })}
              </span>
            )}
          </div>
        )}

        <Button className="h-11 w-full font-semibold" onClick={handleNotify} disabled={isSubmitting || isRegistered}>
          {isSubmitting ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : isRegistered ? (
            <CheckIcon className="size-4" />
          ) : (
            <BellIcon className="size-4" />
          )}
          {isRegistered
            ? t('You’re on the list')
            : user
              ? t('Notify me when trading opens')
              : t('Sign up to get notified')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
