import type { Event } from '@/types'

import { isEventResolvedLike } from '@/lib/home-events'

/**
 * FORK: when no featured markets are configured in Admin → General settings →
 * Home featured markets, the hero falls back to the busiest live Up/Down
 * markets so the carousel never renders empty. Pure selection logic lives
 * here so it can be unit tested; the loader is in home-featured-events.ts.
 */

export const HOME_FEATURED_FALLBACK_LIMIT = 5
export const HOME_FEATURED_FALLBACK_ID_PREFIX = 'fallback:'

export type HomeFeaturedTargetMode = 'configured' | 'fallback'

/**
 * Admin's "enabled" switch gates the manual list only: whenever that list
 * yields no live targets, the fallback keeps the carousel populated.
 */
export function resolveHomeFeaturedTargetMode(input: {
  enabled: boolean
  configuredTargetCount: number
}): HomeFeaturedTargetMode {
  return input.enabled && input.configuredTargetCount > 0 ? 'configured' : 'fallback'
}

const UP_DOWN_TITLE_PATTERN = /\bup or down\b/i

function hasUpDownOutcomes(event: Event) {
  return event.markets.some((market) => {
    const labels = market.outcomes.map((outcome) => outcome.outcome_text?.trim().toLowerCase())
    return labels.includes('up') && labels.includes('down')
  })
}

export function isLiveUpDownEvent(event: Event) {
  if (isEventResolvedLike(event)) {
    return false
  }

  return Boolean(event.has_live_chart) || UP_DOWN_TITLE_PATTERN.test(event.title) || hasUpDownOutcomes(event)
}

function sumVolume24h(event: Event) {
  return event.markets.reduce((total, market) => {
    const volume = Number(market.volume_24h)
    return total + (Number.isFinite(volume) && volume > 0 ? volume : 0)
  }, 0)
}

function normalizeSeriesSlug(event: Event) {
  return event.series_slug?.trim().toLowerCase() || null
}

/**
 * Picks up to `limit` live Up/Down events: live-chart series first, then by
 * 24h volume, then by total volume. One event per series, no duplicates.
 */
export function selectHomeFeaturedFallbackEvents(events: Event[], limit = HOME_FEATURED_FALLBACK_LIMIT): Event[] {
  const seenIds = new Set<string>()
  const seenSeries = new Set<string>()

  return events
    .filter((event) => isLiveUpDownEvent(event))
    .map((event, index) => ({ event, index, volume24h: sumVolume24h(event) }))
    .sort(
      (left, right) =>
        Number(Boolean(right.event.has_live_chart)) - Number(Boolean(left.event.has_live_chart)) ||
        right.volume24h - left.volume24h ||
        (right.event.volume ?? 0) - (left.event.volume ?? 0) ||
        left.index - right.index,
    )
    .filter(({ event }) => {
      if (seenIds.has(event.id)) {
        return false
      }

      const seriesSlug = normalizeSeriesSlug(event)
      if (seriesSlug && seenSeries.has(seriesSlug)) {
        return false
      }

      seenIds.add(event.id)
      if (seriesSlug) {
        seenSeries.add(seriesSlug)
      }
      return true
    })
    .slice(0, Math.max(0, limit))
    .map(({ event }) => event)
}
