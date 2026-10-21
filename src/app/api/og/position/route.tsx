import { ImageResponse } from 'next/og'

import OgImage from '@/app/api/og/_components/OgImage'
import {
  fetchSafeOgImageDataUrl,
  normalizeOutboundImageUrl,
  resolveTrustedOgImageSource,
} from '@/lib/og-image-security'
import { loadRuntimeThemeState } from '@/lib/theme-settings'

// Slip palette (shared with the daily-call share card).
const YELLOW = '#EDFF3D'
const INK = '#0E0F0D'
const PAPER = '#FAFAF5'
const MUTED = '#9AA09A'
const YES = '#2EBD85'
const NO = '#E5484D'

// Heavy weights for the slip. Satori cannot read the woff2 files in /public/fonts,
// so the TTFs come from fontsource (cached per instance); without them the
// default font is used.
const SLIP_FONT_URLS = {
  medium: 'https://cdn.jsdelivr.net/fontsource/fonts/archivo@latest/latin-500-normal.ttf',
  black: 'https://cdn.jsdelivr.net/fontsource/fonts/archivo@latest/latin-800-normal.ttf',
} as const
let slipFontsCache: Promise<Array<{ name: string; data: ArrayBuffer; weight: 500 | 800; style: 'normal' }>> | null =
  null

function loadSlipFonts() {
  if (!slipFontsCache) {
    slipFontsCache = Promise.all(
      (Object.entries(SLIP_FONT_URLS) as Array<[keyof typeof SLIP_FONT_URLS, string]>).map(async ([key, url]) => {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Slip font fetch failed: ${url}`)
        }
        return {
          name: 'Archivo',
          data: await response.arrayBuffer(),
          weight: key === 'black' ? (800 as const) : (500 as const),
          style: 'normal' as const,
        }
      }),
    ).catch((error) => {
      slipFontsCache = null
      console.warn('Share slip fonts unavailable, using the default font.', error)
      return []
    })
  }
  return slipFontsCache
}

interface ShareCardPayload {
  title: string
  outcome: string
  avgPrice: string
  odds: string
  cost: string
  invested: string
  toWin: string
  imageUrl?: string
  userName?: string
  userImage?: string
  variant: 'yes' | 'no'
  eventSlug: string
  tag?: string
}

function normalizeRequiredText(value: unknown, maxLength = 120) {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 3)}...` : trimmed
}

function normalizeOptionalText(value: unknown, maxLength = 120) {
  if (typeof value !== 'string') {
    return ''
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 3)}...` : trimmed
}

function parsePayload(rawPayload: string | null): ShareCardPayload | null {
  if (!rawPayload) {
    return null
  }

  try {
    const parsed = parsePayloadJson(rawPayload)
    if (!parsed) {
      return null
    }
    const normalized = normalizeSharePayload(parsed)
    return normalized ?? null
  } catch (error) {
    console.error('Failed to parse share payload.', error)
    return null
  }
}

function parsePayloadJson(rawPayload: string) {
  try {
    return JSON.parse(rawPayload) as Partial<ShareCardPayload>
  } catch {
    try {
      const decoded = decodeBase64Url(rawPayload)
      return JSON.parse(decoded) as Partial<ShareCardPayload>
    } catch {
      return null
    }
  }
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function normalizeSharePayload(parsed: Partial<ShareCardPayload>): ShareCardPayload | null {
  const title = normalizeRequiredText(parsed.title, 140)
  const outcome = normalizeRequiredText(parsed.outcome, 24)
  const avgPrice = normalizeRequiredText(parsed.avgPrice, 24)
  const odds = normalizeRequiredText(parsed.odds, 16)
  const cost = normalizeRequiredText(parsed.cost, 24)
  const toWin = normalizeRequiredText(parsed.toWin, 24)
  const eventSlug = normalizeRequiredText(parsed.eventSlug, 120)

  if (!title || !outcome || !avgPrice || !odds || !cost || !toWin || !eventSlug) {
    return null
  }

  const variant = parsed.variant === 'no' || parsed.variant === 'yes' ? parsed.variant : null
  if (!variant) {
    return null
  }

  const rawImageUrl = typeof parsed.imageUrl === 'string' ? parsed.imageUrl : ''
  const rawUserImage = typeof parsed.userImage === 'string' ? parsed.userImage : ''
  const safeImageUrl = normalizeOutboundImageUrl(rawImageUrl)
  const safeUserImage = normalizeOutboundImageUrl(rawUserImage)
  return {
    title,
    outcome,
    avgPrice,
    odds,
    cost,
    invested: normalizeOptionalText(parsed.invested, 24),
    toWin,
    imageUrl: safeImageUrl || undefined,
    userName: typeof parsed.userName === 'string' ? parsed.userName.trim() || undefined : undefined,
    userImage: safeUserImage || undefined,
    variant,
    eventSlug,
    tag: normalizeOptionalText(parsed.tag, 40) || undefined,
  }
}

function Eyebrow({ children, size = 16 }: { children: string; size?: number }) {
  return (
    <div style={{ display: 'flex', fontSize: `${size}px`, fontWeight: 800, letterSpacing: '4px', color: MUTED }}>
      {children}
    </div>
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const payload = parsePayload(searchParams.get('position'))
  if (!payload) {
    return new Response('Missing or invalid share payload.', { status: 400 })
  }
  const requestedFormat = searchParams.get('format')
  const format = requestedFormat === 'landscape' ? 'landscape' : requestedFormat === 'portrait' ? 'portrait' : 'square'
  // square (1080²) and portrait/story (1080×1350) share the stacked layout; landscape (1200×630) is two columns.
  const isTall = format !== 'landscape'
  const isStory = format === 'portrait'
  const variant = payload.variant === 'no' ? 'no' : 'yes'
  const sideColor = variant === 'no' ? NO : YES
  const sideTint = variant === 'no' ? 'rgba(229, 72, 77, 0.16)' : 'rgba(46, 189, 133, 0.16)'
  const outcomeLabel = payload.outcome || (variant === 'no' ? 'No' : 'Yes')
  const runtimeTheme = await loadRuntimeThemeState()
  const [siteLogoSrc, positionImageSrc, userImageSrc, fonts] = await Promise.all([
    resolveTrustedOgImageSource(runtimeTheme.site.logoUrl),
    fetchSafeOgImageDataUrl(payload.imageUrl),
    fetchSafeOgImageDataUrl(payload.userImage),
    loadSlipFonts(),
  ])
  const siteName = runtimeTheme.site.name
  const fontFamily = fonts.length > 0 ? 'Archivo' : 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif'
  const host = new URL(request.url).host.replace(/^www\./, '')
  const eyebrow = (payload.tag || siteName).toUpperCase()
  const shortPath = payload.eventSlug.replace(/^\//, '').split('/').slice(0, 2).join('/')
  const titleLength = payload.title.length
  const tallTitleFontSize = titleLength > 90 ? 44 : titleLength > 60 ? 52 : 60
  const titleFontSize = isTall
    ? Math.round(tallTitleFontSize * (isStory ? 1.12 : 1))
    : titleLength > 90
      ? 34
      : titleLength > 60
        ? 40
        : 46
  const userLabel = payload.userName ? `@${payload.userName.replace(/^@/, '')}` : siteName

  const wordmark = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      {siteLogoSrc && (
        <OgImage
          src={siteLogoSrc}
          alt=""
          width={44}
          height={44}
          style={{ width: '44px', height: '44px', filter: 'brightness(0)' }}
        />
      )}
      <div style={{ display: 'flex', fontSize: '36px', fontWeight: 800, letterSpacing: '-1px' }}>{siteName}</div>
    </div>
  )

  const userBadge = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {userImageSrc && (
        <OgImage
          src={userImageSrc}
          alt=""
          width={36}
          height={36}
          style={{ width: '36px', height: '36px', borderRadius: '999px', objectFit: 'cover' }}
        />
      )}
      <div style={{ display: 'flex', fontSize: '26px', fontWeight: 800, color: INK }}>{userLabel}</div>
    </div>
  )

  const header = (
    <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
      {wordmark}
      {userBadge}
    </div>
  )

  const marketChip = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '72px',
        height: '72px',
        borderRadius: '16px',
        backgroundColor: sideTint,
        color: sideColor,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {positionImageSrc ? (
        <OgImage
          src={positionImageSrc}
          alt=""
          width={72}
          height={72}
          style={{ width: '72px', height: '72px', objectFit: 'cover' }}
        />
      ) : (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={sideColor} strokeWidth="2.5">
          <path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 7h7v7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )

  const marketBlock = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px' }}>
      {marketChip}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: '1 1 0%' }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <div
          style={{
            display: 'flex',
            marginTop: '6px',
            fontSize: `${titleFontSize}px`,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.5px',
          }}
        >
          {payload.title}
        </div>
      </div>
    </div>
  )

  const sideRow = (
    <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: '18px' }}>
      <div
        style={{
          display: 'flex',
          padding: '8px 18px',
          borderRadius: '10px',
          backgroundColor: sideTint,
          color: sideColor,
          fontSize: '28px',
          fontWeight: 800,
          letterSpacing: '1px',
        }}
      >
        {outcomeLabel.toUpperCase()}
      </div>
      <div style={{ display: 'flex', gap: '8px', fontSize: '22px', color: MUTED }}>
        <span>Avg price</span>
        <span style={{ color: PAPER, fontWeight: 800 }}>{payload.avgPrice}</span>
      </div>
    </div>
  )

  const betBlock = (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Eyebrow>BET</Eyebrow>
      <div
        style={{
          display: 'flex',
          marginTop: '4px',
          fontSize: isTall ? (isStory ? '68px' : '56px') : '50px',
          fontWeight: 800,
        }}
      >
        {payload.cost}
      </div>
    </div>
  )

  const toWinBlock = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isTall ? 'flex-end' : 'flex-start' }}>
      <Eyebrow>TO WIN</Eyebrow>
      <div
        style={{
          display: 'flex',
          marginTop: '4px',
          fontSize: isTall ? (isStory ? '78px' : '64px') : '58px',
          fontWeight: 800,
          color: YELLOW,
        }}
      >
        {payload.toWin}
      </div>
    </div>
  )

  const oddsRow = (
    <div style={{ display: 'flex', gap: '8px', fontSize: '22px', color: MUTED }}>
      <span>Odds</span>
      <span style={{ color: PAPER, fontWeight: 800 }}>{payload.odds}</span>
    </div>
  )

  const slipPadX = isStory ? 52 : isTall ? 44 : 40
  const slipPadTop = isStory ? 56 : isTall ? 44 : 34
  const notchStyle = {
    display: 'flex',
    position: 'absolute' as const,
    width: '36px',
    height: '36px',
    borderRadius: '999px',
    backgroundColor: YELLOW,
  }

  const wideInnerWidth = 1200 - 2 * 72 - 2 * slipPadX
  const wideNotchLeft = Math.round(slipPadX + ((wideInnerWidth - 3 - 80) * 3) / 5 + 40 + 1.5 - 18)

  const horizontalDivider = (
    <div style={{ display: 'flex', position: 'relative', alignItems: 'center', gap: '10px', margin: '34px 0' }}>
      <div style={{ ...notchStyle, left: `${-(slipPadX + 18)}px`, top: '-16.5px' }} />
      <div style={{ ...notchStyle, right: `${-(slipPadX + 18)}px`, top: '-16.5px' }} />
      {Array.from({ length: 36 }).map((_, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            height: '3px',
            width: index === 17 ? '26px' : '12px',
            borderRadius: '3px',
            backgroundColor: index === 17 ? YELLOW : '#2A2D28',
            flexGrow: index === 17 ? 0 : 1,
          }}
        />
      ))}
    </div>
  )

  const verticalDivider = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      {Array.from({ length: 14 }).map((_, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            width: '3px',
            height: index === 6 ? '26px' : '12px',
            borderRadius: '3px',
            backgroundColor: index === 6 ? YELLOW : '#2A2D28',
          }}
        />
      ))}
    </div>
  )

  const urlText = `${host}/${shortPath}`.toUpperCase()
  const urlLine = (
    <div
      style={{
        display: 'flex',
        marginTop: '22px',
        fontSize: '16px',
        fontWeight: 800,
        letterSpacing: '4px',
        color: 'rgba(14, 15, 13, 0.7)',
      }}
    >
      {urlText}
    </div>
  )

  const slipStyle = {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    backgroundColor: INK,
    color: PAPER,
    borderRadius: '28px',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
  }

  const body = isTall ? (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: YELLOW,
        padding: isStory ? '72px 56px' : '56px 56px',
        fontFamily,
        color: INK,
      }}
    >
      <div style={{ display: 'flex', width: '100%', marginBottom: '28px' }}>{header}</div>
      <div style={{ ...slipStyle, padding: `${slipPadTop}px ${slipPadX}px ${isStory ? 48 : 40}px` }}>
        {marketBlock}
        <div style={{ display: 'flex', marginTop: '36px' }}>{sideRow}</div>
        {horizontalDivider}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          {betBlock}
          {toWinBlock}
        </div>
        <div style={{ display: 'flex', marginTop: '18px' }}>{oddsRow}</div>
      </div>
      {urlLine}
    </div>
  ) : (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: YELLOW,
        padding: '36px 72px 28px',
        fontFamily,
        color: INK,
      }}
    >
      <div style={{ display: 'flex', width: '100%', marginBottom: '30px' }}>{header}</div>
      <div style={{ ...slipStyle, position: 'relative', padding: `${slipPadTop}px ${slipPadX}px 34px` }}>
        {/* ticket notches on the perforation: columns are 3fr | divider | 2fr with 40px gaps */}
        <div style={{ ...notchStyle, left: `${wideNotchLeft}px`, top: '-18px' }} />
        <div style={{ ...notchStyle, left: `${wideNotchLeft}px`, bottom: '-18px' }} />
        <div style={{ display: 'flex', gap: '40px', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: '3 1 0%', minWidth: 0 }}>
            {marketBlock}
            <div style={{ display: 'flex', flex: '1 1 0%' }} />
            <div style={{ display: 'flex', height: '52px', alignItems: 'center', marginTop: '22px' }}>{sideRow}</div>
          </div>
          {verticalDivider}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: '2 1 0%',
              minWidth: 0,
            }}
          >
            {betBlock}
            <div style={{ display: 'flex', marginTop: '18px' }}>{toWinBlock}</div>
            <div style={{ display: 'flex', flex: '1 1 0%' }} />
            <div style={{ display: 'flex', height: '52px', alignItems: 'center' }}>{oddsRow}</div>
          </div>
        </div>
      </div>
      {urlLine}
    </div>
  )

  const response = new ImageResponse(body, {
    width: isTall ? 1080 : 1200,
    height: isStory ? 1350 : isTall ? 1080 : 630,
    fonts: fonts.length > 0 ? fonts : undefined,
  })

  response.headers.set('Cache-Control', 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=1800')
  return response
}
