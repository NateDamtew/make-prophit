import type { Event, HomeFeaturedAutoMixEntry } from '@/types'

/**
 * Picks the hero's automatic markets from per-category pools (each already
 * sorted by 24h volume). Every mix entry takes up to its count, categories are
 * interleaved so the carousel alternates topics, and any slots a category
 * cannot fill go to the busiest remaining markets. Pure, so it is unit-tested.
 */

export function sumEventVolume24h(event: Pick<Event, 'markets'>) {
  return event.markets.reduce((total, market) => {
    const volume = Number(market.volume_24h)
    return total + (Number.isFinite(volume) && volume > 0 ? volume : 0)
  }, 0)
}

export function pickHomeFeaturedAutoEvents(
  mix: HomeFeaturedAutoMixEntry[],
  pools: ReadonlyMap<string, Event[]>,
  options: { slots: number; excludeIds: ReadonlySet<string>; excludeSeriesSlugs?: ReadonlySet<string> },
): Event[] {
  const slots = Math.max(0, options.slots)
  const usedIds = new Set<string>()

  function isAvailable(event: Event) {
    return (
      !usedIds.has(event.id) &&
      !options.excludeIds.has(event.id) &&
      !(event.series_slug && options.excludeSeriesSlugs?.has(event.series_slug))
    )
  }

  const groups: Event[][] = []
  for (const entry of mix) {
    const group: Event[] = []
    for (const event of pools.get(entry.category) ?? []) {
      if (group.length >= entry.count) {
        break
      }
      if (isAvailable(event)) {
        group.push(event)
        usedIds.add(event.id)
      }
    }
    groups.push(group)
  }

  const picked: Event[] = []
  for (let round = 0; picked.length < slots && groups.some((group) => round < group.length); round++) {
    for (const group of groups) {
      if (round < group.length && picked.length < slots) {
        picked.push(group[round]!)
      }
    }
  }

  if (picked.length < slots) {
    const remaining = Array.from(pools.values())
      .flat()
      .filter(isAvailable)
      .sort((left, right) => sumEventVolume24h(right) - sumEventVolume24h(left))
    for (const event of remaining) {
      if (picked.length >= slots) {
        break
      }
      if (isAvailable(event)) {
        picked.push(event)
        usedIds.add(event.id)
      }
    }
  }

  return picked
}
