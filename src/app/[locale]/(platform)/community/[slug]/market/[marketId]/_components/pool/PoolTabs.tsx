'use client'

import { useExtracted } from 'next-intl'
import { useState } from 'react'

import type { PoolActivityItem, PoolHolder } from '@/lib/pools/activity'

import { CommentsSection } from '@/components/community-engagement/CommentsSection'
import ProfileLink from '@/components/ProfileLink'
import ProfileLinkSkeleton from '@/components/ProfileLinkSkeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import useLocalizedTimeAgo from '@/hooks/useLocalizedTimeAgo'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { formatPoolMoney } from '@/lib/pools/format'
import { cn } from '@/lib/utils'

import type { PoolCommunityRecord, PoolMarketRecord } from './pool-market-types'

import { communityPath } from './pool-market-types'
import { usePoolActivity, usePoolHolders } from './usePoolMarketData'

/**
 * Comments / Top Holders / Activity tabs for pool markets, styled like the
 * platform `EventTabs`. Holders and activity come from pool_stakes; comments
 * are the community discussion thread.
 */

type PoolTabKey = 'comments' | 'holders' | 'activity'

interface PoolTabsProps {
  market: PoolMarketRecord
  community: PoolCommunityRecord
  currency: string | null
  memberRole: string | null
  currentUserId: string | null
  outcomeLabels: { yes: string; no: string }
}

function PoolTabSelector({ activeTab }: { activeTab: PoolTabKey }) {
  const t = useExtracted()
  const tabs: Array<{ key: PoolTabKey; label: string }> = [
    { key: 'comments', label: t('Comments') },
    { key: 'holders', label: t('Top Holders') },
    { key: 'activity', label: t('Activity') },
  ]

  return (
    <div className="mt-3 flex items-center gap-2 border-b border-border">
      <div className="flex w-0 flex-1 overflow-x-auto">
        <TabsList className="flex h-8 min-w-max gap-8 rounded-none bg-transparent p-0 text-sm font-medium">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className={cn(
                'h-full rounded-none border-b-2 bg-transparent px-0 pb-2 whitespace-nowrap shadow-none transition-colors duration-200 data-active:bg-transparent data-active:shadow-none',
                activeTab === tab.key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </div>
  )
}

function HolderColumn({
  title,
  holders,
  isLoading,
  currency,
  amountClassName,
}: {
  title: string
  holders: PoolHolder[] | undefined
  isLoading: boolean
  currency: string | null
  amountClassName: string
}) {
  const t = useExtracted()
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-[10px]/none font-semibold tracking-wide text-muted-foreground">{t('STAKED')}</span>
      </div>
      <div className="mt-1 divide-y divide-border border-t">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => <ProfileLinkSkeleton key={index} />)
        ) : !holders || holders.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t('No holders found')}</p>
        ) : (
          holders.map((holder) => (
            <ProfileLink
              key={holder.userId}
              user={{ address: '', image: holder.image ?? '', username: holder.username ?? '' }}
              usernameClassName="font-semibold text-foreground hover:underline underline-offset-2"
              usernameMaxWidthClassName="max-w-35"
              trailing={
                <span className={cn('text-sm font-semibold tabular-nums', amountClassName)}>
                  {formatPoolMoney(holder.amountMinor, currency)}
                </span>
              }
            />
          ))
        )}
      </div>
    </div>
  )
}

function PoolTopHolders({
  marketId,
  currency,
  enabled,
  outcomeLabels,
}: {
  marketId: string
  currency: string | null
  enabled: boolean
  outcomeLabels: { yes: string; no: string }
}) {
  const t = useExtracted()
  const holdersQuery = usePoolHolders(marketId, enabled)
  const isLoading = holdersQuery.isPending

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-6">
        <HolderColumn
          title={t('{outcome} holders', { outcome: outcomeLabels.yes })}
          holders={holdersQuery.data?.yes}
          isLoading={isLoading}
          currency={currency}
          amountClassName="text-yes"
        />
        <HolderColumn
          title={t('{outcome} holders', { outcome: outcomeLabels.no })}
          holders={holdersQuery.data?.no}
          isLoading={isLoading}
          currency={currency}
          amountClassName="text-no"
        />
      </div>
    </div>
  )
}

function PoolActivityRow({
  item,
  nowTimestamp,
  outcomeLabels,
}: {
  item: PoolActivityItem
  nowTimestamp: number | null
  outcomeLabels: { yes: string; no: string }
}) {
  const t = useExtracted()
  const { formatTimeAgo } = useLocalizedTimeAgo()
  const timeAgoLabel = nowTimestamp === null ? '—' : formatTimeAgo(item.createdAt, nowTimestamp)
  const chanceAfter = item.outcome === 'yes' ? item.yesChanceAfter : 100 - item.yesChanceAfter

  return (
    <ProfileLink
      user={{ address: '', image: item.image ?? '', username: item.username ?? '' }}
      layout="inline"
      usernameClassName="font-semibold text-foreground"
      usernameMaxWidthClassName="max-w-44 sm:max-w-56"
      containerClassName="px-3 py-2.5 text-sm leading-tight text-foreground sm:px-4"
      trailing={
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="whitespace-nowrap">{timeAgoLabel}</span>
        </div>
      }
      inlineContent={
        <>
          <span className="text-foreground">{t('bought')} </span>
          <span className={cn('font-semibold', item.outcome === 'yes' ? 'text-yes' : 'text-no')}>
            {formatPoolMoney(item.amountMinor, item.currency)}{' '}
            {item.outcome === 'yes' ? outcomeLabels.yes : outcomeLabels.no}{' '}
          </span>
          <span className="text-foreground">{t('at')} </span>
          <span className="font-semibold text-foreground">{Math.round(chanceAfter)}%</span>
        </>
      }
    />
  )
}

function PoolActivity({
  marketId,
  enabled,
  outcomeLabels,
}: {
  marketId: string
  enabled: boolean
  outcomeLabels: { yes: string; no: string }
}) {
  const t = useExtracted()
  const nowTimestamp = useNowTimestamp()
  const activityQuery = usePoolActivity(marketId, null, enabled)

  if (activityQuery.isPending) {
    return (
      <div className="mt-2 grid gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-md" />
        ))}
      </div>
    )
  }

  const activities = activityQuery.data ?? []
  if (activities.length === 0) {
    return (
      <div className="mt-2 py-6 text-center">
        <div className="text-sm text-muted-foreground">{t('No activity yet')}</div>
      </div>
    )
  }

  return (
    <div className="mt-2 grid gap-6">
      <div className="overflow-hidden">
        <div className="divide-y divide-border/80">
          {activities.map((item) => (
            <div key={item.id}>
              <PoolActivityRow item={item} nowTimestamp={nowTimestamp} outcomeLabels={outcomeLabels} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function PoolTabs({
  market,
  community,
  currency,
  memberRole,
  currentUserId,
  outcomeLabels,
}: PoolTabsProps) {
  const [activeTab, setActiveTab] = useState<PoolTabKey>('comments')

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PoolTabKey)} className="mt-6">
      <PoolTabSelector activeTab={activeTab} />
      <TabsContent value="comments" className="mt-4">
        <CommentsSection
          marketId={market.id}
          currentUserId={currentUserId}
          memberRole={memberRole}
          joinHref={communityPath(community.slug)}
        />
      </TabsContent>
      <TabsContent value="holders" className="mt-0">
        <PoolTopHolders
          marketId={market.id}
          currency={currency}
          enabled={activeTab === 'holders'}
          outcomeLabels={outcomeLabels}
        />
      </TabsContent>
      <TabsContent value="activity" className="mt-0">
        <PoolActivity marketId={market.id} enabled={activeTab === 'activity'} outcomeLabels={outcomeLabels} />
      </TabsContent>
    </Tabs>
  )
}
