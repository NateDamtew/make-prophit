'use client'

import type { Event } from '@/types'
import Link from 'next/link'

interface Props {
  event: Event
  locale: string
}

export default function TmaMarketCard({ event, locale }: Props) {
  const topMarket = event.markets?.[0]
  const topOutcome = topMarket?.outcomes?.[0]
  const chance = topOutcome?.buy_price != null ? Math.round(topOutcome.buy_price * 100) : null
  const volume = event.volume != null
    ? event.volume >= 1_000_000
      ? `$${(event.volume / 1_000_000).toFixed(1)}M Vol`
      : event.volume >= 1_000
        ? `$${(event.volume / 1_000).toFixed(0)}K Vol`
        : `$${event.volume} Vol`
    : null

  return (
    <Link
      href={`/${locale}/event/${event.slug}` as any}
      className="
        flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-transform
        active:scale-[0.98]
      "
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm/snug font-medium">{event.title}</p>
        {chance !== null && (
          <span className="shrink-0 text-lg font-bold text-primary">
            {chance}
            %
          </span>
        )}
      </div>

      {topMarket && (
        <div className="flex gap-2">
          {topMarket.outcomes?.slice(0, 2).map(outcome => (
            <div
              key={outcome.outcome_index}
              className="flex flex-1 items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-xs"
            >
              <span>{outcome.outcome_text}</span>
              <span className="font-semibold">
                {outcome.buy_price != null ? `${Math.round(outcome.buy_price * 100)}%` : '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      {volume && (
        <p className="text-xs text-muted-foreground">{volume}</p>
      )}
    </Link>
  )
}
