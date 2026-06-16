'use client'

import type { PresetMarket } from '../presets/types'
import { useMemo } from 'react'
import { formatRelativeTime } from '@/components/admin-ui/format'
import { describeFeedItem } from '@/components/community-engagement/activity-format'
import { useCommunityActivity } from '@/components/community-engagement/useCommunityActivity'
import { cn } from '@/lib/utils'

interface Props {
  communityId: string
  markets: PresetMarket[]
}

export default function ClassicSideRail({ communityId, markets }: Props) {
  const { data, isLoading } = useCommunityActivity(communityId, 6)
  const items = data?.items ?? []

  const stats = useMemo(() => {
    const resolved = markets.filter(m => m.status === 'resolved').length
    const disputed = markets.filter(m => m.status === 'disputed').length
    const totalResolved = resolved + disputed
    const accuracy = totalResolved > 0 ? Math.round((resolved / totalResolved) * 100) : null
    return { resolved, disputed, accuracy }
  }, [markets])

  return (
    <aside className="flex flex-col gap-4">
      {/* Recent Activity */}
      <section className="rounded-2xl border bg-card p-5">
        <h3 className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
          Recent Activity
        </h3>
        <div className="mt-4 space-y-3">
          {isLoading && (
            <>
              <ActivitySkeleton />
              <ActivitySkeleton />
              <ActivitySkeleton />
            </>
          )}
          {!isLoading && items.length === 0 && (
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          )}
          {!isLoading && items.map(item => (
            <ActivityRow
              key={item.id}
              actor={item.actorLabel ?? null}
              text={describeFeedItem(item)}
              at={item.createdAt}
            />
          ))}
        </div>
      </section>

      {/* Community Stats — lime highlight */}
      <section className="rounded-2xl border-2 border-primary/40 bg-primary/15 p-5 ring-1 ring-primary/30">
        <div className="mb-1 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-foreground">Community Stats</h3>
          <span className="text-2xs font-medium text-foreground/60">All time</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <StatTile label="Markets" value={String(markets.length)} />
          <StatTile label="Accuracy" value={stats.accuracy === null ? '—' : `${stats.accuracy}%`} />
          <StatTile label="Resolved" value={String(stats.resolved)} />
          <StatTile label="Disputes" value={String(stats.disputed)} />
        </div>
      </section>
    </aside>
  )
}

function ActivityRow({ actor, text, at }: { actor: string | null, text: string, at: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className={cn(
        'flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md',
        'bg-muted text-xs font-semibold text-muted-foreground',
      )}
      >
        <span>{(actor ?? '?').charAt(0).toUpperCase()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs/snug text-foreground/90">{text}</p>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          {formatRelativeTime(at)}
        </p>
      </div>
    </div>
  )
}

function ActivitySkeleton() {
  return (
    <div className="flex items-start gap-3">
      <div className="size-8 shrink-0 animate-pulse rounded-md bg-muted" />
      <div className="flex-1 space-y-1.5">
        <div className="h-2.5 w-full animate-pulse rounded-sm bg-muted" />
        <div className="h-2 w-1/3 animate-pulse rounded-sm bg-muted" />
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string, value: string }) {
  return (
    <div className="rounded-xl bg-background/70 p-3 backdrop-blur-sm">
      <p className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-xl font-bold text-foreground tabular-nums">{value}</p>
    </div>
  )
}
