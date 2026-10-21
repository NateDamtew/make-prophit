'use client'

import { useExtracted } from 'next-intl'
import { useState } from 'react'

import type { PoolSummary } from '@/lib/pools/service'

import { MOBILE_BOTTOM_NAV_OFFSET } from '@/app/[locale]/(platform)/_lib/mobile-bottom-nav'
import EventOrderPanelTermsDisclaimer from '@/app/[locale]/(platform)/event/[slug]/_components/EventOrderPanelTermsDisclaimer'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { useIsMobile } from '@/hooks/useIsMobile'
import { formatOddsFromPrice } from '@/lib/odds-format'

import type { PoolCommunityRecord, PoolMarketRecord, PoolSide } from './pool-market-types'

import PoolOrderPanel from './PoolOrderPanel'

/**
 * Mobile trading entry for pool markets: the fixed Buy Yes / Buy No bar and
 * the bottom drawer with the order panel, same as `EventOrderPanelMobile`.
 */

interface PoolMobileOrderPanelProps {
  market: PoolMarketRecord
  community: PoolCommunityRecord
  summary: PoolSummary | null | undefined
  isSummaryLoading: boolean
  selectedOutcome: PoolSide
  onSelectOutcome: (outcome: PoolSide) => void
  outcomeLabels: { yes: string; no: string }
}

export default function PoolMobileOrderPanel(props: PoolMobileOrderPanelProps) {
  const { market, summary, selectedOutcome, onSelectOutcome, outcomeLabels } = props
  const t = useExtracted()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)

  if (!isMobile) {
    return null
  }

  const canTrade = Boolean(summary?.pool.acceptingStakes)
  const yesPriceLabel = formatOddsFromPrice(summary?.pool.odds.yes ?? null, 'percentage')
  const noPriceLabel = formatOddsFromPrice(summary?.pool.odds.no ?? null, 'percentage')

  function openWith(outcome: PoolSide) {
    onSelectOutcome(outcome)
    setOpen(true)
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      {canTrade && (
        <div
          className="fixed inset-x-0 z-30 border-t bg-background p-4 lg:hidden"
          style={{ bottom: MOBILE_BOTTOM_NAV_OFFSET }}
        >
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1 pb-1.25">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 rounded-b-sm bg-yes-foreground/75 dark:bg-yes/75" />
              <Button
                variant="yes"
                size="outcomeLg"
                className="relative w-full translate-y-0 bg-yes-foreground text-white transition-transform duration-150 ease-out hover:translate-y-px hover:bg-yes-foreground active:translate-y-0.5 dark:bg-yes dark:hover:bg-yes"
                onClick={() => openWith('yes')}
              >
                <span className="truncate opacity-70">
                  {t('Buy')} {outcomeLabels.yes}
                </span>
                <span className="shrink-0 font-bold">{yesPriceLabel}</span>
              </Button>
            </div>
            <div className="relative min-w-0 flex-1 pb-1.25">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 rounded-b-sm bg-no-foreground/75 dark:bg-no/75" />
              <Button
                variant="no"
                size="outcomeLg"
                className="relative w-full translate-y-0 bg-no-foreground text-white transition-transform duration-150 ease-out hover:translate-y-px hover:bg-no-foreground active:translate-y-0.5 dark:bg-no dark:hover:bg-no"
                onClick={() => openWith('no')}
              >
                <span className="truncate opacity-70">
                  {t('Buy')} {outcomeLabels.no}
                </span>
                <span className="shrink-0 font-bold">{noPriceLabel}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      <DrawerContent className="max-h-[95dvh] w-full">
        <DrawerTitle className="sr-only">{market.title}</DrawerTitle>
        <div className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <PoolOrderPanel {...props} isMobile selectedOutcome={selectedOutcome} />
          <EventOrderPanelTermsDisclaimer />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
