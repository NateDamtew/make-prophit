'use client'

import type { ReactNode } from 'react'

import { useExtracted } from 'next-intl'
import { useState } from 'react'

import type { PoolSummary } from '@/lib/pools/service'

import { useIsMobile } from '@/hooks/useIsMobile'

import type { PoolCommunityRecord, PoolJuryVote, PoolMarketRecord, PoolSide } from './pool-market-types'

import PoolChart from './PoolChart'
import PoolDesktopSidebar from './PoolDesktopSidebar'
import PoolJuryPanel from './PoolJuryPanel'
import PoolMarketHeader from './PoolMarketHeader'
import PoolMobileOrderPanel from './PoolMobileOrderPanel'
import PoolRules from './PoolRules'
import PoolTabs from './PoolTabs'
import { usePoolSummary } from './usePoolMarketData'

/**
 * Page body for pool-engine community markets. Composes the same sections,
 * in the same order and grid, as the platform `EventContent`: header, chart,
 * rules, tabs, and the order panel in the right column / bottom drawer.
 */

interface PoolMarketContentProps {
  market: PoolMarketRecord
  community: PoolCommunityRecord
  votes: PoolJuryVote[]
  memberRole: string | null
  currentUserId: string | null
  initialSummary: PoolSummary | null
  initialOutcome: PoolSide
  headerActions?: ReactNode
  moderationSlot?: ReactNode
}

export default function PoolMarketContent({
  market,
  community,
  votes,
  memberRole,
  currentUserId,
  initialSummary,
  initialOutcome,
  headerActions,
  moderationSlot,
}: PoolMarketContentProps) {
  const t = useExtracted()
  const isMobile = useIsMobile()
  const summaryQuery = usePoolSummary(market.id, initialSummary)
  const summary = summaryQuery.data ?? null
  const [selectedOutcome, setSelectedOutcome] = useState<PoolSide>(initialOutcome)
  const outcomeLabels = {
    yes: market.binary_outcome_yes?.trim() || t('Yes'),
    no: market.binary_outcome_no?.trim() || t('No'),
  }
  const panelProps = {
    market,
    community,
    summary,
    isSummaryLoading: summaryQuery.isPending,
    selectedOutcome,
    onSelectOutcome: setSelectedOutcome,
    outcomeLabels,
  }

  return (
    <>
      <div className="grid gap-6 pt-5 pb-20 md:pb-0">
        <div className="grid gap-3">
          <PoolMarketHeader market={market} community={community} actions={headerActions} />
          {moderationSlot && <div>{moderationSlot}</div>}

          <div className="min-h-96 w-full">
            <PoolChart market={market} summary={summary} isMobile={isMobile} outcomeLabels={outcomeLabels} />
          </div>

          <div className="grid gap-6">
            <PoolRules market={market} community={community} summary={summary} />
            <PoolJuryPanel
              market={market}
              community={community}
              votes={votes}
              memberRole={memberRole}
              currentUserId={currentUserId}
              outcomeLabels={outcomeLabels}
            />
          </div>

          <PoolTabs
            market={market}
            community={community}
            currency={summary?.pool.currency ?? null}
            memberRole={memberRole}
            currentUserId={currentUserId}
            outcomeLabels={outcomeLabels}
          />
        </div>
      </div>

      <PoolDesktopSidebar {...panelProps} />
      <PoolMobileOrderPanel {...panelProps} />
    </>
  )
}
