'use client'

import type { MarketCardFooterState } from '@/components/communities/cards/MarketCardFooter'

import { MarketCard } from '@/components/communities/cards/MarketCard'

import type { PresetMarket } from '../presets/types'

/**
 * Adapter from a community market row (+ its pool summary) to the shared
 * `MarketCard`. Markets linked to a platform event open the event page.
 */

interface PoolMarketCardProps {
  market: PresetMarket
  communitySlug: string
  communityIconUrl?: string | null
  jurySize?: number | null
}

function footerFor(market: PresetMarket): MarketCardFooterState | null {
  const pool = market.pool ?? null
  const outcome = market.resolved_outcome ?? pool?.settledOutcome ?? null
  if (market.status === 'resolved' && (outcome === 'yes' || outcome === 'no')) {
    return {
      kind: 'resolved',
      outcome: outcome === 'yes' ? 'Yes' : 'No',
      side: outcome,
      paidAt: pool?.state === 'settled' ? (market.resolved_at ?? null) : null,
    }
  }
  if (market.status === 'cancelled' || market.status === 'disputed' || outcome === 'cancelled') {
    return { kind: 'voided', refundMinor: null, currency: pool?.currency ?? null }
  }
  if (pool && pool.state === 'closed') {
    const voted = (market.votes?.yes ?? 0) + (market.votes?.no ?? 0) + (market.votes?.disputed ?? 0)
    return { kind: 'jury', voted, seats: 0, dueAt: market.resolution_date ?? null }
  }
  return null
}

export default function PoolMarketCard({ market, communitySlug, communityIconUrl, jurySize }: PoolMarketCardProps) {
  const pool = market.pool ?? null
  const href = market.event_id ? `/event/${market.event_id}` : `/community/${communitySlug}/market/${market.id}`
  const iconUrl = market.image_url?.trim() || communityIconUrl?.trim() || null
  const total = pool ? BigInt(pool.totalYesMinor) + BigInt(pool.totalNoMinor) : 0n
  const chance = pool && total > 0n ? pool.yesChance / 100 : null
  let footer = footerFor(market)
  if (footer?.kind === 'jury' && jurySize) {
    footer = { ...footer, seats: jurySize }
  }

  return (
    <MarketCard
      href={href}
      title={market.title}
      iconUrl={iconUrl}
      chance={chance}
      poolMinor={total}
      stakeCount={pool?.stakeCount ?? 0}
      currency={pool?.currency ?? null}
      closesAt={market.resolution_date ?? null}
      stakeHrefs={market.event_id ? undefined : { yes: `${href}?stake=yes`, no: `${href}?stake=no` }}
      footer={footer}
      jurySize={jurySize ?? null}
      juryRating={null}
    />
  )
}
