'use client'

import type { Event } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { useLocale } from 'next-intl'
import { useMemo } from 'react'
import { OUTCOME_INDEX } from '@/lib/constants'
import { fetchEventsApi } from '@/lib/events-api'

/**
 * A single binary market normalized into a swipe card.
 * Quick View only handles two-outcome (Yes/No, Up/Down) markets — the logic is
 * the same as a normal binary trade, just presented as a swipe.
 */
export interface QuickViewCard {
  eventId: string
  eventSlug: string
  marketSlug: string
  conditionId: string
  title: string
  iconUrl: string
  /** 0–100 chance for the YES/Up side. */
  yesChance: number
  /** Cent price (0–100) to BUY the Yes/Up side. */
  yesPriceCents: number
  /** Cent price (0–100) to BUY the No/Down side. */
  noPriceCents: number
  yesLabel: string
  noLabel: string
  volume: number
}

function toCents(price: number | null | undefined): number {
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    return 50
  }
  return Math.round(Math.max(0, Math.min(1, price)) * 100)
}

function pickBinaryMarket(event: Event): QuickViewCard | null {
  // Choose the highest-volume market on the event that has exactly the two
  // Yes/No outcomes and isn't resolved — that's a clean swipe candidate.
  const candidate = [...event.markets]
    .filter(market => market.is_active !== false && market.is_resolved !== true)
    .filter(market => market.outcomes.length === 2)
    .sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0))[0]

  if (!candidate || !candidate.slug || !candidate.condition_id) {
    return null
  }

  const yes = candidate.outcomes.find(o => o.outcome_index === OUTCOME_INDEX.YES) ?? candidate.outcomes[0]
  const no = candidate.outcomes.find(o => o.outcome_index === OUTCOME_INDEX.NO) ?? candidate.outcomes[1]
  if (!yes || !no) {
    return null
  }

  const yesPrice = typeof yes.buy_price === 'number' ? yes.buy_price : candidate.price
  const noPrice = typeof no.buy_price === 'number'
    ? no.buy_price
    : (Number.isFinite(candidate.price) ? 1 - candidate.price : 0.5)

  return {
    eventId: event.id,
    eventSlug: event.slug,
    marketSlug: candidate.slug,
    conditionId: candidate.condition_id,
    title: event.total_markets_count > 1 && candidate.title?.trim()
      ? candidate.title.trim()
      : event.title,
    iconUrl: candidate.icon_url || event.icon_url || '',
    yesChance: toCents(candidate.probability ?? candidate.price),
    yesPriceCents: toCents(yesPrice),
    noPriceCents: toCents(noPrice),
    yesLabel: yes.outcome_text?.trim() || 'Yes',
    noLabel: no.outcome_text?.trim() || 'No',
    volume: event.volume ?? 0,
  }
}

/**
 * Fetches a deck of trending binary markets for Quick View.
 * Reuses the same events API the home grid uses, then normalizes to swipe cards.
 */
export function useQuickViewDeck(enabled: boolean) {
  const locale = useLocale()
  const query = useQuery({
    queryKey: ['quick-view-deck', locale],
    enabled,
    staleTime: 60_000,
    queryFn: () => fetchEventsApi({
      tag: 'trending',
      mainTag: 'trending',
      status: 'active',
      homeFeed: true,
      locale,
    }),
  })

  const cards = useMemo<QuickViewCard[]>(() => {
    const events = query.data ?? []
    const result: QuickViewCard[] = []
    const seen = new Set<string>()

    for (const event of events) {
      const card = pickBinaryMarket(event)
      if (card && !seen.has(card.conditionId)) {
        seen.add(card.conditionId)
        result.push(card)
      }
    }

    return result
  }, [query.data])

  return {
    cards,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
