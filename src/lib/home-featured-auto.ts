import type { SupportedLocale } from '@/i18n/locales'
import type { Event } from '@/types'

import { DEFAULT_LOCALE } from '@/i18n/locales'
import { EventRepository } from '@/lib/db/queries/event'
import { HomeFeaturedEventsRepository } from '@/lib/db/queries/home-featured-events'
import { SettingsRepository } from '@/lib/db/queries/settings'
import { isEventResolvedLike } from '@/lib/home-events'
import { pickHomeFeaturedAutoEvents, sumEventVolume24h } from '@/lib/home-featured-auto-mix'
import {
  getHomeFeaturedSettingsFromSettings,
  HOME_FEATURED_AUTO_DISMISSED_KEY,
  HOME_FEATURED_SETTINGS_GROUP,
  parseHomeFeaturedAutoDismissed,
} from '@/lib/home-featured-settings'

const AUTO_POOL_SIZE = 24
/**
 * Auto picks show market comments as their context. Ten cards each searching
 * the news every two hours used up the World News API's daily quota and
 * emptied the home News section; the admin can still pick news per card.
 */
const AUTO_PICK_CONTEXT_MODE = 'comments' as const

export interface HomeFeaturedAutoRefreshResult {
  skipped: string | null
  manual: number
  auto: number
  changed: boolean
}

async function loadCategoryPool(category: string, locale: SupportedLocale, minVolume24h: number): Promise<Event[]> {
  const { data, error } = await EventRepository.listEvents({
    tag: category,
    mainTag: category,
    search: '',
    userId: '',
    bookmarked: false,
    status: 'active',
    sortBy: 'volume_24h',
    excludeSportsAuxiliary: true,
    offset: 0,
    limit: AUTO_POOL_SIZE,
    locale,
  })
  if (error) {
    console.error(`Home featured auto-fill: could not load "${category}"`, error)
    return []
  }
  return (data ?? []).filter((event) => !isEventResolvedLike(event) && sumEventVolume24h(event) >= minVolume24h)
}

/**
 * Keeps the hero full: the admin's own picks (source 'manual') stay first and
 * untouched, and the remaining slots up to `maxCards` are refilled from the
 * configured category mix (source 'ai'). Auto picks the admin removed are
 * never re-added. Skipped when auto-fill is off or AI selection manages the list.
 */
export async function refreshHomeFeaturedAutoPicks(
  locale: SupportedLocale = DEFAULT_LOCALE,
): Promise<HomeFeaturedAutoRefreshResult> {
  const { data: allSettings, error: settingsError } = await SettingsRepository.getSettings()
  if (settingsError) {
    return { skipped: 'settings unavailable', manual: 0, auto: 0, changed: false }
  }
  const settings = getHomeFeaturedSettingsFromSettings(allSettings ?? undefined)
  if (!settings.autoFill) {
    return { skipped: 'auto-fill off', manual: 0, auto: 0, changed: false }
  }
  if (settings.useAi) {
    return { skipped: 'AI selection on', manual: 0, auto: 0, changed: false }
  }

  const { data: items, error: itemsError } = await HomeFeaturedEventsRepository.listAdminFeaturedEvents()
  if (itemsError || !items) {
    return { skipped: 'featured list unavailable', manual: 0, auto: 0, changed: false }
  }

  const manualItems = items.filter((item) => item.source === 'manual')
  const currentAutoIds = items.filter((item) => item.source === 'ai').map((item) => item.eventId)
  const dismissed = parseHomeFeaturedAutoDismissed(
    allSettings?.[HOME_FEATURED_SETTINGS_GROUP]?.[HOME_FEATURED_AUTO_DISMISSED_KEY]?.value,
  )
  const slots = Math.max(0, settings.maxCards - manualItems.length)

  const categories = Array.from(new Set(['trending', ...settings.autoMix.map((entry) => entry.category)]))
  const pools = new Map(
    await Promise.all(
      categories.map(
        async (category) => [category, await loadCategoryPool(category, locale, settings.minVolume24h)] as const,
      ),
    ),
  )
  const picked = pickHomeFeaturedAutoEvents(settings.autoMix, pools, {
    slots,
    excludeIds: new Set([
      ...dismissed,
      ...manualItems.map((item) => item.eventId).filter((id): id is string => Boolean(id)),
    ]),
    excludeSeriesSlugs: new Set(
      manualItems.map((item) => item.seriesSlug).filter((slug): slug is string => Boolean(slug)),
    ),
  })

  const nextAutoIds = picked.map((event) => event.id)
  const changed =
    nextAutoIds.length !== currentAutoIds.length ||
    nextAutoIds.some((id, index) => id !== currentAutoIds[index]) ||
    items.some((item) => item.source === 'ai' && item.contextMode !== AUTO_PICK_CONTEXT_MODE)
  if (!changed) {
    return { skipped: null, manual: manualItems.length, auto: nextAutoIds.length, changed: false }
  }

  const { error: saveError } = await HomeFeaturedEventsRepository.replaceFeaturedEvents([
    ...manualItems.map((item, index) => ({
      targetType: item.targetType,
      eventId: item.eventId,
      seriesSlug: item.seriesSlug,
      enabled: item.enabled,
      rank: index,
      source: item.source,
      startsAt: item.startsAt ? new Date(item.startsAt) : null,
      endsAt: item.endsAt ? new Date(item.endsAt) : null,
      contextMode: item.contextMode,
      autoRolloverEnabled: item.autoRolloverEnabled,
    })),
    // Auto picks point at the event itself (not its series), so a game never rolls over to the next one.
    ...picked.map((event, index) => ({
      targetType: 'event' as const,
      eventId: event.id,
      seriesSlug: null,
      enabled: true,
      rank: manualItems.length + index,
      source: 'ai' as const,
      startsAt: null,
      endsAt: null,
      // Comments cost nothing; news lookups spend the World News quota the home News section needs.
      contextMode: AUTO_PICK_CONTEXT_MODE,
      autoRolloverEnabled: false,
    })),
  ])
  if (saveError) {
    console.error('Home featured auto-fill: could not save', saveError)
    return { skipped: 'save failed', manual: manualItems.length, auto: 0, changed: false }
  }

  return { skipped: null, manual: manualItems.length, auto: nextAutoIds.length, changed: true }
}
