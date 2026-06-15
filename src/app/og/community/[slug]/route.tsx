/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityMonetizationRepository } from '@/lib/db/queries/community-monetization'
import { CommunityThemeRepository, isSafeAccent } from '@/lib/db/queries/community-theme'

const SIZE = { width: 1200, height: 630 }

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data: community } = await CommunityRepository.getBySlug(slug)
  if (!community) {
    return new Response('Not found', { status: 404 })
  }

  const [theme, monetization] = await Promise.all([
    CommunityThemeRepository.get(community.id),
    CommunityMonetizationRepository.getFields(community.id).catch(() => null),
  ])
  const isVerified = !!monetization?.is_verified

  const accent = (theme.accent && isSafeAccent(theme.accent)) ? theme.accent : '#4f8cff'

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
        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 16,
              background: `${accent}30`,
              border: `2px solid ${accent}80`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              fontSize: 56,
            }}
          >
            {community.icon_url
              ? <img src={community.icon_url} alt="" width="96" height="96" />
              : <span>🏛️</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 24, fontWeight: 500, color: accent }}>
              {isVerified ? '✓ Verified community' : 'Community'}
            </span>
            <span style={{ fontSize: 60, fontWeight: 700, marginTop: 4 }}>{community.name}</span>
          </div>
        </div>

        {/* Description */}
        {community.description && (
          <p style={{
            marginTop: 48,
            fontSize: 36,
            lineHeight: 1.3,
            color: '#cbd5e1',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
          >
            {community.description}
          </p>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Footer band */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 32,
          borderTop: `1px solid ${accent}40`,
          color: '#94a3b8',
          fontSize: 24,
        }}
        >
          <span>
            {community.member_count}
            {' '}
            members ·
            {' '}
            {community.market_count}
            {' '}
            markets
          </span>
          <span style={{ fontWeight: 600, color: '#e2e8f0' }}>
            Prophit
          </span>
        </div>
      </div>
    ),
    {
      ...SIZE,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
    },
  )
}
