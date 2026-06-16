'use client'

import { CheckIcon, XIcon } from 'lucide-react'
import AppLink from '@/components/AppLink'
import { cn } from '@/lib/utils'

interface MarketData {
  id: string
  title: string
  status: string
  resolved_outcome: string | null
  resolution_date: Date | null
  event_id: string | null
  main_category_slug?: string | null
  votes?: { yes: number, no: number, disputed: number }
}

interface Props {
  market: MarketData
  communitySlug: string
}

// Stable colour-per-category picked deterministically from the slug.
const CATEGORY_PALETTE = [
  { bg: 'bg-emerald-500/15', text: 'text-emerald-500', ring: 'ring-emerald-500/30' },
  { bg: 'bg-sky-500/15', text: 'text-sky-500', ring: 'ring-sky-500/30' },
  { bg: 'bg-amber-500/15', text: 'text-amber-500', ring: 'ring-amber-500/30' },
  { bg: 'bg-violet-500/15', text: 'text-violet-500', ring: 'ring-violet-500/30' },
  { bg: 'bg-rose-500/15', text: 'text-rose-500', ring: 'ring-rose-500/30' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-500', ring: 'ring-cyan-500/30' },
]

function paletteFor(slug: string) {
  let hash = 0
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0
  }
  return CATEGORY_PALETTE[Math.abs(hash) % CATEGORY_PALETTE.length]
}

function endsInLabel(resolutionDate: Date | null): string | null {
  if (!resolutionDate) {
    return null
  }
  const ms = new Date(resolutionDate).getTime() - Date.now()
  if (ms <= 0) {
    return 'Ended'
  }
  const days = Math.floor(ms / 86_400_000)
  if (days >= 1) {
    return `Ends in ${days}d`
  }
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 1) {
    return `Ends in ${hours}h`
  }
  return 'Ends soon'
}

export default function ClassicMarketCard({ market, communitySlug }: Props) {
  const yesVotes = market.votes?.yes ?? 0
  const noVotes = market.votes?.no ?? 0
  const total = yesVotes + noVotes
  const yesPct = total > 0 ? Math.round((yesVotes / total) * 100) : 50
  const noPct = 100 - yesPct

  const isResolved = market.status === 'resolved'
  const isYesResolved = isResolved && market.resolved_outcome === 'yes'

  const categorySlug = market.main_category_slug ?? 'general'
  const palette = paletteFor(categorySlug)

  const href = market.event_id
    ? `/event/${market.event_id}` as const
    : `/community/${communitySlug}/market/${market.id}` as const

  const ends = endsInLabel(market.resolution_date)

  return (
    <AppLink
      intentPrefetch
      href={href as any}
      className="
        group relative flex flex-col gap-4 overflow-hidden rounded-2xl border bg-card p-5 transition-all
        hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg
      "
    >
      {/* Header row: category chip + ends-in */}
      <div className="flex items-center justify-between gap-3">
        <span className={cn(
          'inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-semibold tracking-wider uppercase ring-1',
          palette.bg,
          palette.text,
          palette.ring,
        )}
        >
          {categorySlug.replace(/-/g, ' ')}
        </span>
        {ends && (
          <span className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
            {ends}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="line-clamp-2 text-base/snug font-semibold tracking-tight text-foreground sm:text-lg/snug">
        {market.title}
      </h3>

      {/* Progress / outcome */}
      {isResolved
        ? (
            <div className="
              flex h-10 items-center justify-center gap-2 rounded-md border bg-muted/30 text-sm font-semibold
              text-foreground
            "
            >
              <span className={cn(
                'flex size-4 items-center justify-center rounded-full',
                isYesResolved ? 'bg-emerald-500' : 'bg-rose-500',
              )}
              >
                {isYesResolved
                  ? <CheckIcon className="size-3 text-background" strokeWidth={2.5} />
                  : <XIcon className="size-3 text-background" strokeWidth={2.5} />}
              </span>
              Resolved
              {' '}
              {isYesResolved ? 'Yes' : 'No'}
            </div>
          )
        : (
            <div>
              <div className="flex items-center gap-3">
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
                    style={{ width: `${yesPct}%` }}
                  />
                </div>
                <span className="shrink-0 text-base font-bold tabular-nums">
                  {yesPct}
                  %
                </span>
              </div>
              <div className="
                mt-2 flex items-center justify-between text-2xs font-medium tracking-wider text-muted-foreground
                uppercase
              "
              >
                <span>
                  Yes
                  {' '}
                  {yesPct}
                  %
                  {' · '}
                  No
                  {' '}
                  {noPct}
                  %
                </span>
                <span>
                  {total > 0 ? `${total} votes` : 'No votes yet'}
                </span>
              </div>
            </div>
          )}
    </AppLink>
  )
}
