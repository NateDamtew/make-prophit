'use client'

import Link from 'next/link'
import { Calendar, CheckCircle, AlertCircle, ExternalLink, Gavel, FileText, BarChart3 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface CommunityMarketCardData {
  id: string
  title: string
  description: string | null
  resolution_source: string | null
  resolution_rules: string | null
  resolution_date: Date | null
  status: string
  resolved_outcome: string | null
  event_id: string | null
  created_at: Date
}

interface Props {
  market: CommunityMarketCardData
  yesVotes?: number
  noVotes?: number
  totalJurors?: number
  isJuror?: boolean
  onVoteClick?: () => void
}

function StatusBadge({ status, outcome }: { status: string, outcome: string | null }) {
  if (status === 'resolved' && outcome === 'yes') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-600">
        <CheckCircle className="size-3" />
        Resolved YES
      </span>
    )
  }
  if (status === 'resolved' && outcome === 'no') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
        <CheckCircle className="size-3" />
        Resolved NO
      </span>
    )
  }
  if (status === 'disputed') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600">
        <AlertCircle className="size-3" />
        Disputed
      </span>
    )
  }
  if (status === 'draft') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <FileText className="size-3" />
        Draft
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
      <span className="size-1.5 animate-pulse rounded-full bg-primary" />
      Live
    </span>
  )
}

export default function CommunityMarketCard({
  market,
  yesVotes = 0,
  noVotes = 0,
  totalJurors = 0,
  isJuror = false,
  onVoteClick,
}: Props) {
  const totalVotes = yesVotes + noVotes
  const yesChance = totalVotes > 0 ? (yesVotes / totalVotes) * 100 : 50
  const noChance = 100 - yesChance
  const roundedYes = Math.round(yesChance)

  const isResolved = market.status === 'resolved'
  const isActive = market.status === 'active'

  return (
    <Card className="group flex h-full flex-col overflow-hidden rounded-xl shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:hover:bg-secondary">
      <CardContent className="flex h-full flex-col gap-3 px-4 pt-4 pb-3">
        {/* Header: title + chance */}
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="size-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-semibold leading-snug">{market.title}</p>
            {market.resolution_source && (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                Source: {market.resolution_source}
              </p>
            )}
          </div>
          {isActive && (
            <div className="flex shrink-0 flex-col items-end">
              <span className="text-lg font-bold leading-none">
                {roundedYes}%
              </span>
              <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                chance
              </span>
            </div>
          )}
        </div>

        {/* Yes/No actions */}
        <div className="mt-auto flex gap-2">
          {market.event_id
            ? (
                <Link
                  href={`/event/${market.event_id}` as any}
                  className="group/btn flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs font-semibold text-green-600 transition-all hover:bg-green-500/20"
                >
                  Buy Yes
                  <span className="font-bold">{roundedYes}¢</span>
                  <ExternalLink className="size-3" />
                </Link>
              )
            : (
                <button
                  type="button"
                  onClick={isJuror ? onVoteClick : undefined}
                  disabled={!isJuror || isResolved}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-all',
                    isResolved && market.resolved_outcome === 'yes'
                      ? 'border-green-500 bg-green-500/20 text-green-600'
                      : 'border-green-500/30 bg-green-500/10 text-green-600',
                    !isResolved && isJuror && 'hover:bg-green-500/20 cursor-pointer',
                    !isJuror && !isResolved && 'cursor-not-allowed opacity-60',
                  )}
                >
                  Yes
                  <span className="font-bold">{roundedYes}¢</span>
                </button>
              )}

          {market.event_id
            ? (
                <Link
                  href={`/event/${market.event_id}` as any}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition-all hover:bg-destructive/20"
                >
                  Buy No
                  <span className="font-bold">{Math.round(noChance)}¢</span>
                  <ExternalLink className="size-3" />
                </Link>
              )
            : (
                <button
                  type="button"
                  onClick={isJuror ? onVoteClick : undefined}
                  disabled={!isJuror || isResolved}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-all',
                    isResolved && market.resolved_outcome === 'no'
                      ? 'border-destructive bg-destructive/20 text-destructive'
                      : 'border-destructive/30 bg-destructive/10 text-destructive',
                    !isResolved && isJuror && 'hover:bg-destructive/20 cursor-pointer',
                    !isJuror && !isResolved && 'cursor-not-allowed opacity-60',
                  )}
                >
                  No
                  <span className="font-bold">{Math.round(noChance)}¢</span>
                </button>
              )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <StatusBadge status={market.status} outcome={market.resolved_outcome} />
            {totalVotes > 0 && (
              <span className="flex items-center gap-1">
                <Gavel className="size-3" />
                {totalVotes}/{totalJurors} voted
              </span>
            )}
          </div>
          {market.resolution_date && (
            <span className="flex items-center gap-1">
              <Calendar className="size-3" />
              {new Date(market.resolution_date).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
