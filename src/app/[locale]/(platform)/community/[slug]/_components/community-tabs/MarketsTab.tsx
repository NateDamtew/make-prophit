'use client'

import type { CommunityMarketSummary, CommunitySummary } from './types'
import { TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import CommunityMarketCard from '../CommunityMarketCard'

interface MarketsTabProps {
  community: CommunitySummary
  markets: CommunityMarketSummary[]
  memberRole: string | null
  isJuror: boolean
}

export function MarketsTab({ community, markets, memberRole, isJuror }: MarketsTabProps) {
  const { liveMarkets, pendingMarkets, resolvedMarkets } = useMemo(() => {
    const now = Date.now()
    const active = markets.filter(m => m.status === 'active')
    const pending = active.filter(
      m => m.resolution_date && new Date(m.resolution_date).getTime() <= now,
    )
    const pendingIds = new Set(pending.map(m => m.id))
    return {
      liveMarkets: active.filter(m => !pendingIds.has(m.id)),
      pendingMarkets: pending,
      resolvedMarkets: markets.filter(m => m.status === 'resolved' || m.status === 'disputed'),
    }
  }, [markets])

  if (markets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="relative">
          <div className="absolute inset-0 animate-pulse rounded-full bg-primary/10 blur-xl" />
          <div className="
            relative flex size-20 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/5
          "
          >
            <TrendingUp className="size-9 text-primary/80" />
          </div>
        </div>
        <div className="max-w-sm">
          <p className="text-lg font-semibold">No markets yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {memberRole === 'admin'
              ? 'Be the first to create a market in this community. Members will be able to trade and your jury will resolve the outcome.'
              : 'The community admin is curating markets. Check back soon.'}
          </p>
        </div>
        {memberRole === 'admin' && (
          <Button asChild size="sm">
            <Link href={`/community/${community.slug}/markets/new` as any}>
              <TrendingUp className="mr-1.5 size-3.5" />
              Create First Market
            </Link>
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {liveMarkets.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Live Markets (
              {liveMarkets.length}
              )
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {liveMarkets.map(m => (
              <CommunityMarketCard
                communitySlug={community.slug}
                key={m.id}
                market={m}
                yesVotes={m.votes?.yes ?? 0}
                noVotes={m.votes?.no ?? 0}
                totalJurors={community.jury_size}
                isJuror={isJuror}
              />
            ))}
          </div>
        </section>
      )}

      {pendingMarkets.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-amber-600 uppercase">
              Awaiting Resolution (
              {pendingMarkets.length}
              )
            </h3>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-medium text-amber-600">
              Jury vote needed
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pendingMarkets.map(m => (
              <CommunityMarketCard
                communitySlug={community.slug}
                key={m.id}
                market={m}
                yesVotes={m.votes?.yes ?? 0}
                noVotes={m.votes?.no ?? 0}
                totalJurors={community.jury_size}
                isJuror={isJuror}
              />
            ))}
          </div>
        </section>
      )}

      {resolvedMarkets.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Resolved (
            {resolvedMarkets.length}
            )
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {resolvedMarkets.map(m => (
              <CommunityMarketCard
                communitySlug={community.slug}
                key={m.id}
                market={m}
                yesVotes={m.votes?.yes ?? 0}
                noVotes={m.votes?.no ?? 0}
                totalJurors={community.jury_size}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
