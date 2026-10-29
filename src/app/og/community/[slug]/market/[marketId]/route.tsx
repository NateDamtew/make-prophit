/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og'

import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityMonetizationRepository } from '@/lib/db/queries/community-monetization'
import { CommunityThemeRepository, isSafeAccent } from '@/lib/db/queries/community-theme'
import { getTrustCard } from '@/lib/db/queries/community-trust'
import { formatPoolMoney } from '@/lib/pools/format'
import { getPoolSummary } from '@/lib/pools/service'

const SIZE = { width: 1200, height: 630 }

/**
 * The link preview for a community market: the community and its level,
 * the question, live odds, the pool and when it closes, and how it is
 * resolved. Cached for five minutes so odds in a shared card stay fresh.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; marketId: string }> }) {
  const { slug, marketId } = await params

  const { data } = await CommunityRepository.getMarketWithCommunity(marketId)
  if (!data || data.community.slug.toLowerCase() !== slug.toLowerCase()) {
    return new Response('Not found', { status: 404 })
  }
  const { market, community } = data

  const [theme, monetization, trust, summary] = await Promise.all([
    CommunityThemeRepository.get(community.id),
    CommunityMonetizationRepository.getFields(community.id).catch(() => null),
    getTrustCard(community.id).catch(() => null),
    getPoolSummary(market.id, null).catch(() => null),
  ])
  const isVerified = !!monetization?.is_verified
  const accent = theme.accent && isSafeAccent(theme.accent) ? theme.accent : '#ffc932'
  const pool = summary?.pool ?? null
  const yesPct = Math.round((pool?.odds.yes ?? 0.5) * 100)
  const noPct = 100 - yesPct
  const totalMinor = pool ? BigInt(pool.totalYes) + BigInt(pool.totalNo) : 0n
  const settledOutcome = pool?.settledOutcome ?? null
  const settled = pool ? pool.state === 'settled' || pool.state === 'cancelled' : false
  const closesAt = pool?.closesAt
    ? new Date(pool.closesAt)
    : market.resolution_date
      ? new Date(market.resolution_date)
      : null
  const closesLabel = closesAt
    ? closesAt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null
  const footerLeft = settled
    ? settledOutcome === 'yes'
      ? 'Resolved Yes'
      : settledOutcome === 'no'
        ? 'Resolved No'
        : 'Stakes refunded'
    : closesLabel
      ? `Closes ${closesLabel}`
      : 'Open market'
  const trustLine = trust
    ? `Level ${trust.level} · ${trust.levelName} · ${trust.jurySize} jurors · payouts held ${trust.holdHours}h`
    : null

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f1a2b',
        color: '#f1f5f9',
        padding: '64px 72px 56px',
        fontFamily: 'system-ui, sans-serif',
        position: 'relative',
      }}
    >
      <div
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 14, background: accent, display: 'flex' }}
      />

      {/* Community row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: `${accent}30`,
            border: `1px solid ${accent}80`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            fontSize: 30,
          }}
        >
          {community.icon_url ? <img src={community.icon_url} alt="" width="56" height="56" /> : <span>🏛️</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9' }}>
            {community.name}
            {isVerified ? ' ✓' : ''}
          </span>
          {trustLine ? <span style={{ fontSize: 20, color: '#94a3b8' }}>{trustLine}</span> : null}
        </div>
      </div>

      {/* Question */}
      <p
        style={{
          marginTop: 36,
          marginBottom: 0,
          fontSize: market.title.length > 90 ? 48 : 58,
          fontWeight: 800,
          lineHeight: 1.12,
          letterSpacing: -1,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {market.title}
      </p>

      <div style={{ flex: 1, display: 'flex' }} />

      {/* Odds */}
      <div style={{ display: 'flex', gap: 18 }}>
        <div
          style={{
            flex: 1,
            background: settledOutcome === 'no' ? 'rgba(74,222,128,0.06)' : 'rgba(74,222,128,0.14)',
            borderRadius: 16,
            padding: '20px 26px',
            color: '#4ade80',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            opacity: settledOutcome === 'no' ? 0.55 : 1,
          }}
        >
          <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>YES</span>
          <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2 }}>{yesPct}%</span>
        </div>
        <div
          style={{
            flex: 1,
            background: settledOutcome === 'yes' ? 'rgba(248,113,113,0.06)' : 'rgba(248,113,113,0.14)',
            borderRadius: 16,
            padding: '20px 26px',
            color: '#f87171',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            opacity: settledOutcome === 'yes' ? 0.55 : 1,
          }}
        >
          <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>NO</span>
          <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2 }}>{noPct}%</span>
        </div>
      </div>

      {/* Footer band */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 28,
          paddingTop: 22,
          borderTop: '1px solid rgba(255,255,255,0.12)',
          color: '#94a3b8',
          fontSize: 24,
        }}
      >
        <span>
          {pool ? `${formatPoolMoney(totalMinor, pool.currency)} pool · ${pool.stakeCount} stakes · ` : ''}
          {footerLeft}
        </span>
        <span style={{ fontWeight: 700, color: accent }}>Prophit</span>
      </div>
    </div>,
    {
      ...SIZE,
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600' },
    },
  )
}
