'use client'

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react'

import type { OverlayPayload } from '@/app/api/communities/overlay/[slug]/route'

import { formatPoolMoney } from '@/lib/pools/format'

/**
 * Stream overlays for OBS: a lower third showing one market's live odds
 * (the newest open one, or `?market=<id>`), or a ticker scrolling every
 * open market. Both poll the overlay API every five seconds.
 */

const POLL_MS = 5_000

interface OverlayViewProps {
  slug: string
  variant: 'lower-third' | 'ticker'
  marketId?: string
  /** Seconds a lower-third stays on one market before rotating. */
  rotateSeconds?: number
}

function pct(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`
}

export default function OverlayView({ slug, variant, marketId, rotateSeconds = 20 }: OverlayViewProps) {
  const [payload, setPayload] = useState<OverlayPayload | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/communities/overlay/${encodeURIComponent(slug)}`, { cache: 'no-store' })
        if (res.ok && !cancelled) {
          setPayload((await res.json()) as OverlayPayload)
        }
      } catch {
        // keep the last good frame on screen
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [slug])

  useEffect(() => {
    if (variant !== 'lower-third' || marketId) {
      return
    }
    const timer = window.setInterval(() => setTick((value) => value + 1), rotateSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [variant, marketId, rotateSeconds])

  const accentStyle = payload?.community.accent ? { ['--ov-accent' as string]: payload.community.accent } : undefined
  const open = payload?.markets.filter((market) => market.state === 'open') ?? []

  if (!payload) {
    return null
  }

  if (variant === 'ticker') {
    if (open.length === 0) {
      return <p className="ov-empty">No open markets right now.</p>
    }
    const items = [...open, ...open]
    return (
      <div
        className="ov-ticker"
        style={{ ...accentStyle, ['--ov-duration' as string]: `${Math.max(20, open.length * 9)}s` }}
      >
        <span className="ov-ticker__label">{payload.community.name}</span>
        <div className="ov-ticker__track">
          {items.map((market, index) => (
            <span key={`${market.id}-${index}`} className="ov-ticker__item">
              {market.title}
              <b className="yes">{pct(market.yesChance)} Yes</b>
              <b className="no">{pct(1 - market.yesChance)} No</b>
              <small>{formatPoolMoney(market.poolMinor, market.currency)}</small>
            </span>
          ))}
        </div>
      </div>
    )
  }

  const chosen = marketId
    ? (payload.markets.find((market) => market.id === marketId) ?? null)
    : open.length > 0
      ? open[tick % open.length]!
      : (payload.markets[0] ?? null)
  if (!chosen) {
    return <p className="ov-empty">No markets yet.</p>
  }
  const resolved = chosen.state === 'settled' || chosen.state === 'held' || chosen.state === 'cancelled'
  const closes = chosen.closesAt
    ? new Date(chosen.closesAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <article className="ov-lower" style={accentStyle} key={chosen.id}>
      <div className="ov-community">
        {payload.community.iconUrl ? <img src={payload.community.iconUrl} alt="" /> : null}
        <span>
          {payload.community.name} · {payload.community.levelName}
        </span>
      </div>
      <h1 className="ov-title">{chosen.title}</h1>
      <div className="ov-odds">
        <div className={`ov-side ov-side--yes${resolved && chosen.outcome === 'no' ? ' ov-side--lost' : ''}`}>
          <span>Yes</span>
          <strong>{pct(chosen.yesChance)}</strong>
        </div>
        <div className={`ov-side ov-side--no${resolved && chosen.outcome === 'yes' ? ' ov-side--lost' : ''}`}>
          <span>No</span>
          <strong>{pct(1 - chosen.yesChance)}</strong>
        </div>
      </div>
      <div className="ov-meta">
        <span>
          {formatPoolMoney(chosen.poolMinor, chosen.currency)} pool · {chosen.stakeCount} stakes
        </span>
        <span>
          {resolved ? (
            <b>{chosen.outcome === 'yes' ? 'Resolved Yes' : chosen.outcome === 'no' ? 'Resolved No' : 'Refunded'}</b>
          ) : closes ? (
            <>
              Closes <b>{closes}</b>
            </>
          ) : (
            <b>Open</b>
          )}
        </span>
      </div>
    </article>
  )
}
