'use client'

import Link from 'next/link'
import { CheckIcon, Repeat, XIcon } from 'lucide-react'
import AppLink from '@/components/AppLink'
import EventIconImage from '@/components/EventIconImage'
import { Button } from '@/components/ui/button'
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
  communitySlug: string
  yesVotes?: number
  noVotes?: number
  totalJurors?: number
  isJuror?: boolean
}

function formatVolume(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`
  }
  return `$${value}`
}

export default function CommunityMarketCard({
  market,
  communitySlug,
  yesVotes = 0,
  noVotes = 0,
  totalJurors = 0,
  isJuror = false,
}: Props) {
  const totalVotes = yesVotes + noVotes
  const yesChance = totalVotes > 0 ? (yesVotes / totalVotes) * 100 : 50
  const roundedYes = Math.round(yesChance)

  const isResolved = market.status === 'resolved'
  const isYesResolved = isResolved && market.resolved_outcome === 'yes'
  const isNoResolved = isResolved && market.resolved_outcome === 'no'

  // For markets pulled from platform, link to actual event page
  // For custom community markets, link to community market detail (jury vote/view)
  const href = market.event_id
    ? `/event/${market.event_id}` as const
    : `/community/${communitySlug}/market/${market.id}` as const

  return (
    <Card
      className={cn(`
        group flex h-45 flex-col overflow-hidden rounded-xl shadow-md shadow-black/4 transition-all
        hover:-translate-y-0.5 hover:shadow-black/8
        dark:hover:bg-secondary
      `)}
    >
      <CardContent className="flex h-full flex-col px-3 pt-3 pb-3 md:pb-1">
        {/* HEADER: icon + title + chance ring */}
        <div className="mb-3 flex items-start justify-between">
          <AppLink
            intentPrefetch
            href={href as any}
            className="flex flex-1 items-center gap-2 pr-2"
          >
            <div className="flex size-10 shrink-0 items-center justify-center self-start rounded-sm">
              <EventIconImage
                src={''}
                alt={market.title}
                sizes="40px"
                containerClassName="size-full rounded-sm"
              />
            </div>
            <h3 className="line-clamp-3 w-full text-sm/5 font-semibold underline-offset-2 transition-colors duration-200 hover:text-foreground hover:underline">
              {market.title}
            </h3>
          </AppLink>

          {!isResolved && (
            <div className="relative -mt-3 flex flex-col items-center">
              <div className="relative">
                <svg width="72" height="52" viewBox="0 0 72 52" className="rotate-0 transform">
                  <path
                    d="M 6 46 A 30 30 0 0 1 66 46"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                    className="text-slate-200 dark:text-slate-600"
                  />
                  <path
                    d="M 6 46 A 30 30 0 0 1 66 46"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                    className={cn(
                      'transition-all duration-300',
                      roundedYes < 40
                        ? 'text-no'
                        : roundedYes === 50
                          ? 'text-slate-400'
                          : 'text-yes',
                    )}
                    strokeDasharray={`${(roundedYes / 100) * 94.25} 94.25`}
                    strokeDashoffset="0"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center pt-4">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {roundedYes}%
                  </span>
                </div>
              </div>
              <div className="-mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                chance
              </div>
            </div>
          )}
        </div>

        {/* ACTIONS: Yes/No buttons */}
        <div className="flex flex-1 flex-col">
          <div className="mt-auto">
            {isResolved
              ? (
                  <div className="mt-auto mb-0">
                    <div className="flex h-12 w-full cursor-default items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold text-foreground transition-colors dark:border-none dark:bg-secondary dark:group-hover:bg-card">
                      <span className={cn(
                        'flex size-4 items-center justify-center rounded-full',
                        isYesResolved ? 'bg-yes' : 'bg-no',
                      )}
                      >
                        {isYesResolved
                          ? <CheckIcon className="size-3 text-background" strokeWidth={2.5} />
                          : <XIcon className="size-3 text-background" strokeWidth={2.5} />}
                      </span>
                      <span className="min-w-8 text-left">
                        {isYesResolved ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                )
              : (
                  <div className="mt-auto mb-2 grid grid-cols-2 gap-2">
                    <Button asChild variant="yes" size="outcome">
                      <AppLink intentPrefetch href={href as any}>
                        <span className="truncate">Yes</span>
                      </AppLink>
                    </Button>
                    <Button asChild variant="no" size="outcome">
                      <AppLink intentPrefetch href={href as any}>
                        <span className="truncate">No</span>
                      </AppLink>
                    </Button>
                  </div>
                )}
          </div>
        </div>

        {/* FOOTER: volume / status + bookmark/date */}
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {!isResolved && totalVotes > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-2 animate-ping rounded-full bg-amber-500 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
                </span>
                <span className="leading-none font-medium text-amber-600 uppercase">
                  {totalVotes}/{totalJurors} voted
                </span>
              </span>
            )}
            {!isResolved && totalVotes === 0 && (
              <span>{formatVolume(0)} Vol.</span>
            )}
            {isResolved && market.resolution_date && (
              <span>Ended {new Date(market.resolution_date).toLocaleDateString()}</span>
            )}
          </div>
          {!isResolved && market.resolution_date && (
            <span className="text-muted-foreground">
              {new Date(market.resolution_date).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
