'use client'

import type { PoolSummary } from '@/lib/pools/service'

import EventOrderPanelTermsDisclaimer from '@/app/[locale]/(platform)/event/[slug]/_components/EventOrderPanelTermsDisclaimer'
import { useIsMobile } from '@/hooks/useIsMobile'

import type { PoolCommunityRecord, PoolMarketRecord, PoolSide } from './pool-market-types'

import PoolOrderPanel from './PoolOrderPanel'

/**
 * Sticky right column for pool markets, same placement and spacing as the
 * platform `EventDesktopSidebar`.
 */

interface PoolDesktopSidebarProps {
  market: PoolMarketRecord
  community: PoolCommunityRecord
  summary: PoolSummary | null | undefined
  isSummaryLoading: boolean
  selectedOutcome: PoolSide
  onSelectOutcome: (outcome: PoolSide) => void
  outcomeLabels: { yes: string; no: string }
}

export default function PoolDesktopSidebar(props: PoolDesktopSidebarProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return null
  }

  return (
    <aside className="hidden lg:block lg:pt-5">
      <div className="grid gap-6 lg:sticky lg:top-29 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
        <PoolOrderPanel {...props} isMobile={false} className="bg-card" />
        <EventOrderPanelTermsDisclaimer />
      </div>
    </aside>
  )
}
