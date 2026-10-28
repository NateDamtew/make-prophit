'use client'

import type { ReactNode } from 'react'

import { useExtracted } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'

import type { CommunityTrust } from '@/components/communities/types'
import type { PoolSummary } from '@/lib/pools/service'

import { PositionShareDialog } from '@/app/[locale]/(platform)/_components/PositionShareDialog'
import { buildPoolSharePayload } from '@/components/communities/share/payload'
import { readStakeIntent } from '@/components/communities/stake/stake-intent'
import { StakeSheet } from '@/components/communities/stake/StakeSheet'
import { TrustBlock } from '@/components/communities/trust/TrustBlock'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { useIsMobile } from '@/hooks/useIsMobile'
import { isJurorRole } from '@/lib/communities/roles'
import { useUser } from '@/stores/useUser'

import type { PoolCommunityRecord, PoolJuryVote, PoolMarketRecord, PoolSide } from './pool-market-types'

import MarketBottomBar from './MarketBottomBar'
import MarketHero from './MarketHero'
import MarketJuryList from './MarketJuryList'
import MarketJuryVote from './MarketJuryVote'
import MarketPositionCard from './MarketPositionCard'
import MarketResolvedBy from './MarketResolvedBy'
import MarketRules from './MarketRules'
import MarketStatePanel, { MarketStateBody } from './MarketStatePanel'
import MarketVerdicts from './MarketVerdicts'
import { communityPath } from './pool-market-types'
import PoolChart from './PoolChart'
import PoolMarketHeader from './PoolMarketHeader'
import PoolTabs from './PoolTabs'
import { useMarketLifecycle } from './useMarketLifecycle'
import { useInvalidatePool, usePoolSummary } from './usePoolMarketData'

/**
 * The pool market page, driven by one lifecycle: title, what the market is
 * doing now, the chart while it is open, your stake, the verdicts, the
 * jury, who resolves it, the rules, then the discussion. The side panel on
 * desktop and the bottom bar on phones hold the one action for the state.
 */

interface PoolMarketContentProps {
  market: PoolMarketRecord
  community: PoolCommunityRecord
  votes: PoolJuryVote[]
  trust: CommunityTrust | null
  memberRole: string | null
  currentUserId: string | null
  initialSummary: PoolSummary | null
  initialOutcome: PoolSide
  /** Open the stake sheet on load (from `?stake=yes|no`). */
  openStakeOnLoad: boolean
  serverNow: number
  /** When set, the page is a preview and never refetches. */
  preview?: boolean
  headerActions?: ReactNode
  moderationSlot?: ReactNode
}

export default function PoolMarketContent({
  market,
  community,
  votes,
  trust,
  memberRole,
  currentUserId,
  initialSummary,
  initialOutcome,
  openStakeOnLoad,
  serverNow,
  preview = false,
  headerActions,
  moderationSlot,
}: PoolMarketContentProps) {
  const t = useExtracted()
  const isMobile = useIsMobile()
  const user = useUser()
  const summaryQuery = usePoolSummary(market.id, initialSummary, { enabled: !preview })
  const summary = preview ? initialSummary : (summaryQuery.data ?? null)
  const invalidatePool = useInvalidatePool(market.id)
  const hydrated = useHasHydrated()
  // A pick saved before sign-up / deposit wins over the default side until the viewer taps one.
  const savedIntent = useMemo(() => (hydrated ? readStakeIntent(market.id) : null), [hydrated, market.id])
  const [pickedSide, setSide] = useState<PoolSide | null>(openStakeOnLoad ? initialOutcome : null)
  const side: PoolSide = pickedSide ?? savedIntent?.side ?? initialOutcome
  const [sheetOpen, setSheetOpen] = useState(openStakeOnLoad)
  const [shareOpen, setShareOpen] = useState(false)

  const jurySize = trust?.jurySize ?? community.jury_size
  const juryRequired = trust?.juryRequired ?? Math.floor(community.jury_size / 2) + 1
  const { lifecycle } = useMarketLifecycle({ market, summary, votes, jurySize, juryRequired, serverNow })

  const outcomeLabels = useMemo(
    () => ({ yes: market.binary_outcome_yes?.trim() || t('Yes'), no: market.binary_outcome_no?.trim() || t('No') }),
    [market.binary_outcome_yes, market.binary_outcome_no, t],
  )
  const totals = useMemo(
    () => ({ yes: summary ? BigInt(summary.pool.totalYes) : 0n, no: summary ? BigInt(summary.pool.totalNo) : 0n }),
    [summary],
  )
  const isJuror = isJurorRole(memberRole)
  const marketOpen = lifecycle.phase === 'open' || lifecycle.phase === 'closing'
  const marketDone =
    lifecycle.phase === 'settled' ||
    lifecycle.phase === 'refunded' ||
    lifecycle.phase === 'hold' ||
    lifecycle.phase === 'review'
  const showJuryVote = isJuror && lifecycle.phase === 'awaiting' && lifecycle.source === 'community'

  const onMoneyMoved = useCallback(() => {
    if (!preview) {
      void invalidatePool()
    }
  }, [invalidatePool, preview])

  const winPayload = useMemo(() => {
    const stake = lifecycle.viewer.stake
    if (!stake || lifecycle.viewer.result !== 'won' || stake.payoutMinor === null || stake.side === 'mixed') {
      return null
    }
    return buildPoolSharePayload({
      market: { id: market.id, title: market.title, imageUrl: market.image_url },
      community: { slug: community.slug, name: community.name, iconUrl: community.icon_url },
      outcome: stake.side,
      outcomeLabel: stake.side === 'yes' ? outcomeLabels.yes : outcomeLabels.no,
      stakeMinor: stake.amountMinor,
      payoutMinor: stake.payoutMinor,
      totalYes: totals.yes,
      totalNo: totals.no,
      currency: lifecycle.currency ?? 'KES',
      userName: user?.username,
      userImage: user?.image,
    })
  }, [lifecycle, market, community, outcomeLabels, totals, user])

  function pickSide(next: PoolSide) {
    setSide(next)
    setSheetOpen(true)
  }

  const stakeMarket = {
    id: market.id,
    title: market.title,
    imageUrl: market.image_url,
    closesAt: lifecycle.closesAt,
    juryDueAt: lifecycle.juryDueAt,
  }
  const stakeCommunity = {
    id: community.id,
    slug: community.slug,
    name: community.name,
    iconUrl: community.icon_url,
    jurySize,
    juryRequired,
  }

  return (
    <>
      <div className="grid gap-8 pt-5 pb-24 lg:pb-8">
        <div className="grid gap-5">
          <PoolMarketHeader market={market} community={community} actions={headerActions} />
          {moderationSlot && <div>{moderationSlot}</div>}
          <MarketHero market={market} lifecycle={lifecycle} outcomeLabels={outcomeLabels} totals={totals} />
        </div>

        {marketOpen && !preview && (
          <div className="min-h-72 w-full">
            <PoolChart market={market} summary={summary} isMobile={isMobile} outcomeLabels={outcomeLabels} />
          </div>
        )}

        {lifecycle.viewer.stake && <MarketPositionCard lifecycle={lifecycle} outcomeLabels={outcomeLabels} />}

        {!marketOpen && (
          <div className="lg:hidden">
            <MarketStateBody
              community={community}
              lifecycle={lifecycle}
              outcomeLabels={outcomeLabels}
              onShareWin={() => setShareOpen(true)}
            />
          </div>
        )}

        {showJuryVote && (
          <MarketJuryVote
            market={market}
            community={community}
            votes={votes}
            currentUserId={currentUserId}
            outcomeLabels={outcomeLabels}
          />
        )}

        {(marketDone || lifecycle.phase === 'awaiting' || votes.length > 0) && (
          <MarketVerdicts
            marketId={market.id}
            lifecycle={lifecycle}
            votes={votes}
            trust={trust}
            outcomeLabels={outcomeLabels}
            canManageEvidence={isJuror}
          />
        )}

        {lifecycle.source === 'community' && (
          <MarketJuryList trust={trust} jurySize={jurySize} juryRequired={juryRequired} />
        )}

        <MarketResolvedBy
          community={community}
          trust={trust}
          jurySize={jurySize}
          juryRequired={juryRequired}
          holdHours={summary?.holdHours ?? trust?.holdHours ?? 24}
          imported={lifecycle.source === 'imported'}
          source={market.resolution_source}
        />

        <MarketRules market={market} summary={summary} closesAt={lifecycle.closesAt} />

        {!preview && (
          <PoolTabs
            market={market}
            community={community}
            currency={lifecycle.currency}
            memberRole={memberRole}
            currentUserId={currentUserId}
            outcomeLabels={outcomeLabels}
          />
        )}

        {trust && (
          <div className="lg:hidden">
            <TrustBlock trust={trust} variant="full" rulesHref={communityPath(community.slug)} />
          </div>
        )}
      </div>

      <MarketStatePanel
        market={market}
        community={community}
        summary={summary}
        lifecycle={lifecycle}
        trust={trust}
        side={side}
        onSideChange={setSide}
        outcomeLabels={outcomeLabels}
        onShareWin={() => setShareOpen(true)}
        onMoneyMoved={onMoneyMoved}
      />

      <MarketBottomBar
        lifecycle={lifecycle}
        outcomeLabels={outcomeLabels}
        onPick={pickSide}
        onShareWin={() => setShareOpen(true)}
      />

      {marketOpen && (
        <div className="lg:hidden">
          <StakeSheet
            market={stakeMarket}
            community={stakeCommunity}
            summary={summary}
            side={side}
            onSideChange={setSide}
            outcomeLabels={outcomeLabels}
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            onMoneyMoved={onMoneyMoved}
          />
        </div>
      )}

      <PositionShareDialog open={shareOpen} onOpenChange={setShareOpen} payload={winPayload} />
    </>
  )
}
