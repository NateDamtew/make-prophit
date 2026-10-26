import { describe, expect, it } from 'bun:test'

import type { Event } from '@/types'

import { pickHomeFeaturedAutoEvents } from '@/lib/home-featured-auto-mix'
import { DEFAULT_HOME_FEATURED_AUTO_MIX, parseHomeFeaturedAutoMix } from '@/lib/home-featured-settings'

function buildEvent(id: string, volume24h: number, seriesSlug: string | null = null) {
  return { id, series_slug: seriesSlug, markets: [{ volume_24h: volume24h }] } as unknown as Event
}

function pool(prefix: string, count: number, topVolume: number) {
  return Array.from({ length: count }, (_, index) => buildEvent(`${prefix}${index + 1}`, topVolume - index))
}

describe('home featured auto mix', () => {
  it('takes each category count and interleaves the categories', () => {
    const pools = new Map([
      ['trending', pool('t', 6, 1000)],
      ['sports', pool('s', 4, 500)],
      ['politics', pool('p', 4, 400)],
    ])
    const picked = pickHomeFeaturedAutoEvents(
      [
        { category: 'trending', count: 2 },
        { category: 'sports', count: 2 },
        { category: 'politics', count: 1 },
      ],
      pools,
      { slots: 5, excludeIds: new Set() },
    )
    expect(picked.map((event) => event.id)).toEqual(['t1', 's1', 'p1', 't2', 's2'])
  })

  it('never repeats an event that sits in two pools', () => {
    const shared = buildEvent('shared', 900)
    const pools = new Map([
      ['trending', [shared, buildEvent('t2', 800)]],
      ['sports', [shared, buildEvent('s2', 300)]],
    ])
    const picked = pickHomeFeaturedAutoEvents(
      [
        { category: 'trending', count: 1 },
        { category: 'sports', count: 1 },
      ],
      pools,
      { slots: 2, excludeIds: new Set() },
    )
    expect(picked.map((event) => event.id)).toEqual(['shared', 's2'])
  })

  it('skips removed picks and the admin’s own, and tops a short category up from the busiest', () => {
    const pools = new Map([
      ['trending', pool('t', 5, 1000)],
      ['politics', [buildEvent('p1', 50)]],
    ])
    const picked = pickHomeFeaturedAutoEvents(
      [
        { category: 'trending', count: 1 },
        { category: 'politics', count: 3 },
      ],
      pools,
      { slots: 4, excludeIds: new Set(['t1', 't3']) },
    )
    expect(picked.map((event) => event.id)).toEqual(['t2', 'p1', 't4', 't5'])
  })

  it('leaves out series the admin already features', () => {
    const pools = new Map([['trending', [buildEvent('a', 10, 'nba-2026'), buildEvent('b', 5)]]])
    const picked = pickHomeFeaturedAutoEvents([{ category: 'trending', count: 2 }], pools, {
      slots: 2,
      excludeIds: new Set(),
      excludeSeriesSlugs: new Set(['nba-2026']),
    })
    expect(picked.map((event) => event.id)).toEqual(['b'])
  })

  it('returns nothing when the admin’s own picks fill every slot', () => {
    expect(
      pickHomeFeaturedAutoEvents(DEFAULT_HOME_FEATURED_AUTO_MIX, new Map(), { slots: 0, excludeIds: new Set() }),
    ).toEqual([])
  })

  it('parses the stored mix defensively', () => {
    expect(
      parseHomeFeaturedAutoMix(
        JSON.stringify([
          { category: 'Sports', count: 2 },
          { category: 'sports', count: 5 },
          { category: 'unknown', count: 1 },
          { category: 'crypto', count: 0 },
          { category: 'politics', count: 40 },
        ]),
      ),
    ).toEqual([
      { category: 'sports', count: 2 },
      { category: 'politics', count: 10 },
    ])
    expect(parseHomeFeaturedAutoMix('not json')).toBeNull()
  })
})
