import type { ShareCardPayload } from '@/lib/share-card'

import { formatPoolMoney } from '@/lib/pools/format'

/**
 * Share-card payload for a pool stake, in the shape the platform's share
 * dialog and /api/og/position expect. Odds are percentages and money is in
 * the pool's currency; nothing crypto leaks onto the card.
 */
export function buildPoolSharePayload(params: {
  market: { id: string; title: string; imageUrl?: string | null }
  community: { slug: string; name: string; iconUrl?: string | null }
  outcome: 'yes' | 'no'
  outcomeLabel: string
  stakeMinor: bigint
  payoutMinor: bigint
  totalYes: bigint
  totalNo: bigint
  currency: string
  userName?: string | null
  userImage?: string | null
  /** "won" after a payout: the card leads with the amount paid. */
  kind?: 'call' | 'won'
  wonMinor?: bigint | null
  accent?: string | null
}): ShareCardPayload {
  const total = params.totalYes + params.totalNo
  const yesChance = total > 0n ? Number((params.totalYes * 10_000n) / total) / 100 : 50
  const chance = params.outcome === 'yes' ? yesChance : 100 - yesChance
  const avgPricePct =
    params.payoutMinor > 0n
      ? Math.max(1, Math.min(99, Math.round((Number(params.stakeMinor) / Number(params.payoutMinor)) * 100)))
      : Math.round(chance)
  const imageUrl = params.market.imageUrl?.trim() || params.community.iconUrl?.trim() || undefined
  return {
    title: params.market.title,
    outcome: params.outcomeLabel,
    avgPrice: `${avgPricePct}%`,
    odds: `${Math.round(chance)}%`,
    cost: formatPoolMoney(params.stakeMinor, params.currency),
    invested: formatPoolMoney(params.stakeMinor, params.currency),
    toWin: formatPoolMoney(params.payoutMinor, params.currency),
    imageUrl,
    userName: params.userName?.trim() || undefined,
    userImage: params.userImage?.trim() || undefined,
    variant: params.outcome,
    eventSlug: `community/${params.community.slug}/market/${params.market.id}`,
    tag: params.community.name,
    kind: params.kind ?? 'call',
    won: params.kind === 'won' && params.wonMinor ? formatPoolMoney(params.wonMinor, params.currency) : undefined,
    accent: params.accent ?? undefined,
  }
}
