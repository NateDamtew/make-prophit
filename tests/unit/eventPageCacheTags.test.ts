import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  PUBLIC_EVENT_PAGE_CACHE_LIFE,
  resolveEventPageCacheLife,
  SETTLED_EVENT_PAGE_CACHE_LIFE,
} from '@/lib/event-page-cache'

const cachedEventPages = [
  {
    functionName: 'CachedEventPageContent',
    path: 'src/app/[locale]/(platform)/event/[slug]/page.tsx',
  },
  {
    functionName: 'CachedEventMarketPageContent',
    path: 'src/app/[locale]/(platform)/event/[slug]/[market]/page.tsx',
  },
] as const

describe('event page cache tags', () => {
  it('uses a ten-minute shared cache with one day of stale revalidation', () => {
    expect(PUBLIC_EVENT_PAGE_CACHE_LIFE).toEqual({ stale: 60, revalidate: 600, expire: 86_400 })
  })

  it('keeps settled events cached for a day with a month of stale revalidation', () => {
    expect(SETTLED_EVENT_PAGE_CACHE_LIFE).toEqual({ stale: 3_600, revalidate: 86_400, expire: 2_592_000 })
  })

  it('picks the lifetime from the event status', () => {
    expect(resolveEventPageCacheLife('active')).toBe(PUBLIC_EVENT_PAGE_CACHE_LIFE)
    expect(resolveEventPageCacheLife('draft')).toBe(PUBLIC_EVENT_PAGE_CACHE_LIFE)
    expect(resolveEventPageCacheLife('resolved')).toBe(SETTLED_EVENT_PAGE_CACHE_LIFE)
    expect(resolveEventPageCacheLife('archived')).toBe(SETTLED_EVENT_PAGE_CACHE_LIFE)
  })

  it.each(cachedEventPages)('tags $functionName with its event slug', ({ functionName, path }) => {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8')
    const functionStart = source.indexOf(`async function ${functionName}`)
    const functionEnd = source.indexOf('\nexport default', functionStart)

    expect(functionStart).toBeGreaterThanOrEqual(0)
    expect(functionEnd).toBeGreaterThan(functionStart)

    const cachedFunction = source.slice(functionStart, functionEnd)

    expect(cachedFunction).toContain("'use cache'")
    expect(cachedFunction).toContain('cacheLife(resolveEventPageCacheLife(eventPageData.event.status))')
    expect(cachedFunction).not.toContain('cacheLife(PUBLIC_EVENT_PAGE_CACHE_LIFE)')
    expect(cachedFunction).toContain('cacheTag(cacheTags.event(slug))')
    expect(cachedFunction).toContain("eventPageData.event.series_slug?.trim() ?? ''")
    expect(cachedFunction).toContain('cacheTag(cacheTags.seriesEvents(')
  })

  it('uses the event page cache lifetime for cached public event data', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/event-page-data.ts'), 'utf8')
    const functionStart = source.indexOf('export async function loadEventPagePublicContentData(')
    const functionEnd = source.indexOf('\nexport async function loadEventPageShellData', functionStart)
    const cachedFunction = source.slice(functionStart, functionEnd)

    expect(functionStart).toBeGreaterThanOrEqual(0)
    expect(functionEnd).toBeGreaterThan(functionStart)
    expect(cachedFunction).toContain("'use cache'")
    expect(cachedFunction).toContain('cacheLife(resolveEventPageCacheLife(rawEvent.status))')
    expect(cachedFunction).not.toContain('cacheLife(PUBLIC_EVENT_PAGE_CACHE_LIFE)')
    expect(cachedFunction).toContain('cacheTag(cacheTags.event(eventSlug))')
    expect(cachedFunction).toContain('cacheTag(cacheTags.seriesEvents(seriesSlug))')
  })
})
