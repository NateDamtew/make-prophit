/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityMonetizationRepository } from '@/lib/db/queries/community-monetization'
import { CommunityThemeRepository, isSafeAccent } from '@/lib/db/queries/community-theme'

const SIZE = { width: 1200, height: 630 }

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string, marketId: string }> }) {
  const { slug, marketId } = await params

  const { data } = await CommunityRepository.getMarketWithCommunity(marketId)
  if (!data || data.community.slug.toLowerCase() !== slug.toLowerCase()) {
    return new Response('Not found', { status: 404 })
  }
  const { market, community } = data

  const [theme, monetization] = await Promise.all([
    CommunityThemeRepository.get(community.id),
    CommunityMonetizationRepository.getFields(community.id).catch(() => null),
  ])
  const isVerified = !!monetization?.is_verified
  const accent = (theme.accent && isSafeAccent(theme.accent)) ? theme.accent : '#4f8cff'

  const resolutionLabel = market.resolution_date
    ? new Date(market.resolution_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(135deg, ${accent}22 0%, #0b1220 60%)`,
          color: '#e2e8f0',
          padding: 80,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Community pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: `${accent}30`,
              border: `1px solid ${accent}80`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              fontSize: 32,
            }}
          >
            {community.icon_url
              ? <img src={community.icon_url} alt="" width="56" height="56" />
              : <span>🏛️</span>}
          </div>
          <span style={{ fontSize: 26, color: '#94a3b8' }}>
            {community.name}
            {isVerified ? ' ✓' : ''}
          </span>
        </div>

        {/* Market title */}
        <p
          style={{
            marginTop: 36,
            fontSize: 62,
            fontWeight: 700,
            lineHeight: 1.15,
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {market.title}
        </p>

        <div style={{ flex: 1 }} />

        {/* Outcomes preview */}
        <div style={{ display: 'flex', gap: 18 }}>
          <div style={{
            flex: 1,
            background: '#10b98115',
            border: '1px solid #10b98155',
            borderRadius: 12,
            padding: '20px 24px',
            color: '#10b981',
            fontSize: 28,
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
          }}
          >
            <span>YES</span>
            <span style={{ color: '#94a3b8', fontWeight: 400 }}>awaiting trading</span>
          </div>
          <div style={{
            flex: 1,
            background: '#ef444415',
            border: '1px solid #ef444455',
            borderRadius: 12,
            padding: '20px 24px',
            color: '#ef4444',
            fontSize: 28,
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
          }}
          >
            <span>NO</span>
            <span style={{ color: '#94a3b8', fontWeight: 400 }}>awaiting trading</span>
          </div>
        </div>

        {/* Footer band */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 32,
          paddingTop: 24,
          borderTop: `1px solid ${accent}40`,
          color: '#94a3b8',
          fontSize: 22,
        }}
        >
          <span>{resolutionLabel ? `Resolves ${resolutionLabel}` : 'Open market'}</span>
          <span style={{ fontWeight: 600, color: '#e2e8f0' }}>Prophit</span>
        </div>
      </div>
    ),
    {
      ...SIZE,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
    },
  )
}
