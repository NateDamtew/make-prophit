import type { Event } from '@/types'

/**
 * Event pages are invalidated by tag (`cacheTags.event(slug)`) from the sync
 * routes and admin actions, so the time-based lifetime below is only a safety
 * net. Every regeneration is billed as an ISR write on Vercel (per 8 KB of a
 * 1.5-2 MB page), so even trading events keep a 10-minute lifetime: prices and
 * the order book refresh on the client, and a 60s lifetime meant nearly every
 * crawler visit regenerated the page. Settled events are effectively static.
 */
export const PUBLIC_EVENT_PAGE_CACHE_LIFE = {
  stale: 60,
  revalidate: 600,
  expire: 86_400,
} as const

export const SETTLED_EVENT_PAGE_CACHE_LIFE = {
  stale: 3_600,
  revalidate: 86_400,
  expire: 2_592_000,
} as const

/**
 * Pick the cache lifetime for an event page once the event status is known.
 * Must be the only `cacheLife()` call in the cached scope: Next keeps the
 * shortest explicit lifetime, so an earlier short call cannot be extended.
 */
export function resolveEventPageCacheLife(status: Event['status']) {
  return status === 'resolved' || status === 'archived' ? SETTLED_EVENT_PAGE_CACHE_LIFE : PUBLIC_EVENT_PAGE_CACHE_LIFE
}
