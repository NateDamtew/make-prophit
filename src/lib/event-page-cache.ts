import type { Event } from '@/types'

/**
 * Event pages are invalidated by tag (`cacheTags.event(slug)`) from the sync
 * routes and admin actions, so the time-based lifetime below is only a safety
 * net. Events that are still trading keep a short lifetime so server-rendered
 * prices stay close to live; settled events are effectively static and would
 * otherwise be regenerated on every crawler visit, which is billed as an ISR
 * write on Vercel.
 */
export const PUBLIC_EVENT_PAGE_CACHE_LIFE = {
  stale: 60,
  revalidate: 60,
  expire: 3_660,
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
