import type { SupportedLocale } from '@/i18n/locales'
import type { EventListSortBy, EventListStatusFilter } from '@/lib/event-list-filters'
import type { Event } from '@/types'

import { EventRepository } from '@/lib/db/queries/event'
import { filterHomeEvents, HOME_EVENTS_PAGE_SIZE, isSportsPrimaryHomeEvent } from '@/lib/home-events'

const HOME_EVENTS_QUERY_BATCH_SIZE = 128
// Recurring series can swap a listed instance for a later one, so a page may need more candidates
// than it shows, but scanning the whole category took the home page 20+ s. Stop once the page is
// full, after at most this many extra batches.
const HOME_EVENTS_MAX_EXTRA_BATCHES = 2

interface ListHomeEventsPageOptions {
  bookmarked: boolean
  cardPayload?: boolean
  currentTimestamp?: number | null
  includeUpdatedAt?: boolean
  /**
   * Return the first page's candidates without backfilling replaced series
   * instances from later batches. For callers that use the list as a pool of
   * a few events (the home feed) rather than a full grid page.
   */
  firstPageOnly?: boolean
  frequency?: 'all' | 'daily' | 'weekly' | 'monthly'
  hideCrypto?: boolean
  hideEarnings?: boolean
  hideSports?: boolean
  locale: SupportedLocale
  mainTag: string
  offset?: number
  search?: string
  sortBy?: EventListSortBy
  sportsSection?: 'games' | 'props' | ''
  sportsSportSlug?: string
  status?: EventListStatusFilter
  tag: string
  userId: string
}

interface LoadHomeEventCandidatesOptions extends Omit<ListHomeEventsPageOptions, 'cardPayload' | 'includeUpdatedAt'> {}

interface LoadHomeEventBatchesOptions extends Omit<LoadHomeEventCandidatesOptions, 'offset'> {
  initialEvents?: Event[]
  initialUpdatedAt?: number
  offset: number
  skipLivePricing?: boolean
  /** Stop loading once more than this many events survive home filtering. */
  visibleTarget: number
}

async function loadHomeEventBatches({
  bookmarked,
  currentTimestamp = null,
  frequency = 'all',
  hideCrypto = false,
  hideEarnings = false,
  hideSports = false,
  initialEvents = [],
  initialUpdatedAt = Number.POSITIVE_INFINITY,
  locale,
  mainTag,
  offset,
  search = '',
  skipLivePricing = false,
  sortBy,
  sportsSection = '',
  sportsSportSlug = '',
  status = 'active',
  tag,
  userId,
  visibleTarget,
}: LoadHomeEventBatchesOptions) {
  let rawOffset = Math.max(0, offset)
  const accumulatedEvents = [...initialEvents]
  let updatedAt = initialUpdatedAt

  const maxBatches =
    Math.ceil(Math.max(0, visibleTarget - initialEvents.length) / HOME_EVENTS_QUERY_BATCH_SIZE) +
    HOME_EVENTS_MAX_EXTRA_BATCHES
  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex++) {
    const {
      data: rawEvents,
      error,
      updatedAt: batchUpdatedAt,
    } = await EventRepository.listEvents({
      tag,
      mainTag,
      search,
      skipLivePricing,
      sortBy,
      userId,
      bookmarked,
      frequency,
      status,
      offset: rawOffset,
      limit: HOME_EVENTS_QUERY_BATCH_SIZE,
      locale,
      sportsSportSlug,
      sportsSection,
      hideSports,
      hideCrypto,
      hideEarnings,
      excludeSportsAuxiliary: true,
      cardPayload: true,
    })

    if (error) {
      return { data: [], error, updatedAt: 0 }
    }

    updatedAt = Math.min(updatedAt, batchUpdatedAt)

    const batch = rawEvents ?? []
    if (batch.length === 0) {
      break
    }

    accumulatedEvents.push(...batch)

    if (batch.length < HOME_EVENTS_QUERY_BATCH_SIZE) {
      break
    }

    // More than a page of visible events also covers the one-event lookahead that keeps hasMore accurate.
    const visibleCount = filterHomeEvents(accumulatedEvents, {
      currentTimestamp,
      hideSports,
      hideCrypto,
      hideEarnings,
      status,
    }).length
    if (visibleCount > visibleTarget) {
      break
    }

    rawOffset += batch.length
  }

  return {
    data: accumulatedEvents,
    error: null,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  }
}

async function loadHomeEventCandidates({
  bookmarked,
  currentTimestamp = null,
  firstPageOnly = false,
  frequency = 'all',
  hideCrypto = false,
  hideEarnings = false,
  hideSports = false,
  locale,
  mainTag,
  offset = 0,
  search = '',
  sortBy,
  sportsSection = '',
  sportsSportSlug = '',
  status = 'active',
  tag,
  userId,
}: LoadHomeEventCandidatesOptions) {
  const targetOffset = Math.max(0, offset)
  const hasHomeVisibilityFilters = hideSports || hideCrypto || hideEarnings

  if (status === 'resolved' && !hasHomeVisibilityFilters) {
    const { data, error, updatedAt } = await EventRepository.listEvents({
      tag,
      mainTag,
      search,
      sortBy,
      userId,
      bookmarked,
      frequency,
      status,
      offset: targetOffset,
      limit: HOME_EVENTS_PAGE_SIZE + 1,
      locale,
      sportsSportSlug,
      sportsSection,
      hideSports,
      hideCrypto,
      hideEarnings,
      excludeSportsAuxiliary: true,
      preferResolvedDateOrder: true,
      skipLivePricing: true,
      cardPayload: true,
    })

    return {
      data: data ?? [],
      error,
      updatedAt: error ? 0 : updatedAt,
    }
  }

  if (status === 'resolved') {
    let rawOffset = 0
    const accumulatedEvents: Event[] = []
    let visibleEventsCount = 0
    let updatedAt = Number.POSITIVE_INFINITY

    while (true) {
      const {
        data: rawEvents,
        error,
        updatedAt: batchUpdatedAt,
      } = await EventRepository.listEvents({
        tag,
        mainTag,
        search,
        sortBy,
        userId,
        bookmarked,
        frequency,
        status,
        offset: rawOffset,
        limit: HOME_EVENTS_QUERY_BATCH_SIZE,
        locale,
        sportsSportSlug,
        sportsSection,
        hideSports,
        hideCrypto,
        hideEarnings,
        excludeSportsAuxiliary: true,
        preferResolvedDateOrder: true,
        skipLivePricing: true,
        cardPayload: true,
      })

      if (error) {
        return { data: [], error, updatedAt: 0 }
      }

      updatedAt = Math.min(updatedAt, batchUpdatedAt)

      const batch = rawEvents ?? []
      if (batch.length === 0) {
        break
      }

      accumulatedEvents.push(...batch)

      const visibleBatch = filterHomeEvents(batch, {
        hideSports,
        hideCrypto,
        hideEarnings,
        status,
      })
      visibleEventsCount += visibleBatch.length
      if (visibleEventsCount > targetOffset + HOME_EVENTS_PAGE_SIZE) {
        break
      }

      if (batch.length < HOME_EVENTS_QUERY_BATCH_SIZE) {
        break
      }

      rawOffset += HOME_EVENTS_QUERY_BATCH_SIZE
    }

    return {
      data: accumulatedEvents,
      error: null,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    }
  }

  if (status === 'active' && !hasHomeVisibilityFilters && targetOffset === 0) {
    // Only non-sports-primary recurring series can be replaced by later candidates during home filtering.
    // A page without one is already final, so avoid scanning the rest of the category.
    const {
      data: firstPage,
      error,
      updatedAt,
    } = await EventRepository.listEvents({
      tag,
      mainTag,
      search,
      sortBy,
      userId,
      bookmarked,
      frequency,
      status,
      offset: 0,
      limit: HOME_EVENTS_PAGE_SIZE + 1,
      locale,
      sportsSportSlug,
      sportsSection,
      excludeSportsAuxiliary: true,
      cardPayload: true,
    })

    if (error) {
      return { data: [], error, updatedAt: 0 }
    }

    const candidates = firstPage ?? []
    // The lookahead must also survive filtering before it can establish hasMore.
    const firstPageHasReplaceableSeries = candidates.some(
      (event) => Boolean(event.series_slug?.trim()) && !isSportsPrimaryHomeEvent(event),
    )

    if (firstPageOnly || candidates.length < HOME_EVENTS_PAGE_SIZE + 1 || !firstPageHasReplaceableSeries) {
      return {
        data: candidates,
        error: null,
        updatedAt,
      }
    }

    // Series selection uses event dates and resolution state, not live prices.
    // Price only the cards that survive the full scan on the public landing pages.
    const skipIntermediateLivePricing = !bookmarked && !userId && (tag === 'trending' || tag === 'crypto')
    const result = await loadHomeEventBatches({
      bookmarked,
      currentTimestamp,
      frequency,
      hideCrypto,
      hideEarnings,
      hideSports,
      initialEvents: candidates,
      initialUpdatedAt: updatedAt,
      locale,
      mainTag,
      offset: candidates.length,
      search,
      skipLivePricing: skipIntermediateLivePricing,
      sortBy,
      sportsSection,
      sportsSportSlug,
      status,
      tag,
      userId,
      visibleTarget: HOME_EVENTS_PAGE_SIZE,
    })
    return {
      ...result,
      initiallyPricedEventIds: skipIntermediateLivePricing ? new Set(candidates.map((event) => event.id)) : null,
    }
  }

  return loadHomeEventBatches({
    bookmarked,
    currentTimestamp,
    frequency,
    hideCrypto,
    hideEarnings,
    hideSports,
    locale,
    mainTag,
    offset: 0,
    search,
    sortBy,
    sportsSection,
    sportsSportSlug,
    status,
    tag,
    userId,
    visibleTarget: targetOffset + HOME_EVENTS_PAGE_SIZE,
  })
}

function toHomeEventCard(event: Event): Event {
  // Detail text is not rendered by cards. Copy before trimming so repository/cache
  // objects remain complete for event pages and other consumers.
  const cardEvent = { ...event }
  delete cardEvent.rules
  delete cardEvent.additional_context
  delete cardEvent.additional_context_updated_at

  if (cardEvent.markets) {
    cardEvent.markets = cardEvent.markets.map((market) => {
      const cardMarket = { ...market }
      delete cardMarket.market_rules
      return cardMarket
    })
  }

  return cardEvent
}

export async function listHomeEventsPage({
  bookmarked,
  cardPayload = false,
  currentTimestamp,
  includeUpdatedAt = false,
  firstPageOnly = false,
  frequency = 'all',
  hideCrypto = false,
  hideEarnings = false,
  hideSports = false,
  locale,
  mainTag,
  offset = 0,
  search = '',
  sortBy,
  sportsSection = '',
  sportsSportSlug = '',
  status = 'active',
  tag,
  userId,
}: ListHomeEventsPageOptions): Promise<{
  data: Event[]
  error: string | null
  currentTimestamp: number | null
  hasMore: boolean
  updatedAt?: number
}> {
  const targetOffset = Math.max(0, offset)
  const resolvedCurrentTimestamp = currentTimestamp ?? null
  const hasHomeVisibilityFilters = hideSports || hideCrypto || hideEarnings

  const candidatesResult = await loadHomeEventCandidates({
    bookmarked,
    currentTimestamp: resolvedCurrentTimestamp,
    firstPageOnly,
    frequency,
    hideCrypto,
    hideEarnings,
    hideSports,
    locale,
    mainTag,
    offset,
    search,
    sortBy,
    sportsSection,
    sportsSportSlug,
    status,
    tag,
    userId,
  })
  const { data: rawEvents, error } = candidatesResult

  if (error) {
    return {
      data: [],
      error,
      currentTimestamp: resolvedCurrentTimestamp ?? null,
      hasMore: false,
      ...(includeUpdatedAt && { updatedAt: 0 }),
    }
  }

  let visibleEvents: Event[] = rawEvents ?? []

  if (status !== 'resolved' || hasHomeVisibilityFilters) {
    visibleEvents =
      visibleEvents.length > 0
        ? filterHomeEvents(visibleEvents, {
            currentTimestamp: resolvedCurrentTimestamp,
            hideSports,
            hideCrypto,
            hideEarnings,
            status,
          })
        : []
  }
  const pageStart = status === 'resolved' && !hasHomeVisibilityFilters ? 0 : targetOffset
  const pageEnd = pageStart + HOME_EVENTS_PAGE_SIZE

  let pageEvents = visibleEvents.slice(pageStart, pageEnd)
  const initiallyPricedEventIds =
    'initiallyPricedEventIds' in candidatesResult ? candidatesResult.initiallyPricedEventIds : null
  const eventsNeedingPrices = initiallyPricedEventIds
    ? pageEvents.filter((event) => !initiallyPricedEventIds.has(event.id))
    : []
  if (eventsNeedingPrices.length > 0) {
    const { data: refreshedEvents, error: refreshError } = await EventRepository.getEventsBySlugs(
      eventsNeedingPrices.map((event) => event.slug),
      userId,
      locale,
      {
        bookmarked,
        excludeSportsAuxiliary: true,
        frequency,
        hideCrypto,
        hideEarnings,
        hideSports,
        mainTag,
        search,
        sortBy,
        sportsSection,
        sportsSportSlug,
        status,
        tag,
      },
      { cardPayload: true },
    )
    const refreshedById = new Map((refreshError ? [] : (refreshedEvents ?? [])).map((event) => [event.id, event]))
    // A selected event may have become a draft or hidden since the cached scan.
    // Never restore an ineligible event from that scan if the fresh query omits it.
    pageEvents = pageEvents
      .filter((event) => initiallyPricedEventIds?.has(event.id) || refreshedById.has(event.id))
      .map((event) => refreshedById.get(event.id) ?? event)
  }

  return {
    data: cardPayload ? pageEvents.map(toHomeEventCard) : pageEvents,
    error: null,
    currentTimestamp: resolvedCurrentTimestamp ?? null,
    hasMore: visibleEvents.length > pageEnd,
    ...(includeUpdatedAt && { updatedAt: candidatesResult.updatedAt }),
  }
}
