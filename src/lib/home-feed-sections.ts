import type {
  HomeFeedCommunity,
  HomeFeedData,
  HomeFeedMarketCard,
  HomeFeedOutcomeRow,
  HomeFeedRankedMarket,
  HomeFeedSportsButton,
  HomeFeedSportsCard,
} from '@/lib/home-feed-types'
import type { HomeNewsFeed, HomeNewsStory } from '@/lib/home-news'
import type { Event, Market } from '@/types'

import { hasHomeCardMarketChance } from '@/app/[locale]/(platform)/(home)/_utils/homeCardMarketDisplay'
import { OUTCOME_INDEX } from '@/lib/constants'
import {
  resolveCryptoCadenceEventTitle,
  resolveCryptoEventAsset,
  resolveCryptoEventAssetName,
} from '@/lib/crypto-cadence-event'
import { resolveEventOutcomePath, resolveEventPagePath } from '@/lib/events-routing'
import { isEventResolvedLike } from '@/lib/home-events'
import {
  HOME_FEED_BREAKING_NEWS_LIMIT,
  HOME_FEED_CARDS_PER_SECTION,
  HOME_FEED_COMMUNITIES_LIMIT,
  HOME_FEED_LIVE_NOW_LIMIT,
  HOME_FEED_MOST_TRADED_LIMIT,
} from '@/lib/home-feed-types'
import { findHomeNewsRelatedMarketIndex } from '@/lib/home-news-match'
import { buildChanceByMarket } from '@/lib/market-chance'
import { buildHomeSportsMoneylineModel, resolveHomeSportsButtonChance } from '@/lib/sports-home-card'
import { resolveCompactSportsTeamNames } from '@/lib/sports-team-label'

/**
 * Pure builders for the section-led home feed. Everything here is
 * serialisable so the server can hand the result straight to the client.
 */

export interface HomeFeedCommunityRow {
  id: string
  slug: string
  name: string
  icon_url: string | null
  type: string
  member_count: number
  market_count: number
}

export interface BuildHomeFeedInput {
  trending: Event[]
  crypto: Event[]
  finance: Event[]
  politics: Event[]
  sports: Event[]
  communities: HomeFeedCommunityRow[]
  news: HomeNewsFeed
  locale: string
}

const UP_DOWN_TITLE_PATTERN = /\bup or down\b/i
const PARENTHESISED_TICKER_PATTERN = /\(([A-Z0-9.^]{2,8})\)/

/** Mirrors `isSportsEvent` from sports-event-group without importing the db layer. */
function isSportsEvent(event: Pick<Event, 'sports_sport_slug' | 'sports_event_slug' | 'sports_teams'>) {
  return Boolean(event.sports_sport_slug || event.sports_event_slug || event.sports_teams?.length)
}

function isMarketResolved(market: Market) {
  return Boolean(market.is_resolved || market.condition?.resolved)
}

function resolveDisplayMarkets(event: Event) {
  const activeMarkets = event.markets.filter((market) => !isMarketResolved(market))
  return activeMarkets.length > 0 ? activeMarkets : event.markets
}

function resolveOutcomeLabel(market: Market, outcomeIndex: number, fallback: string) {
  const outcome =
    market.outcomes.find((candidate) => candidate.outcome_index === outcomeIndex) ?? market.outcomes[outcomeIndex]
  return outcome?.outcome_text?.trim() || fallback
}

function resolveMarketChance(market: Market, chanceByMarket: Record<string, number>) {
  if (!hasHomeCardMarketChance(market)) {
    return null
  }

  const chance = chanceByMarket[market.condition_id]
  return typeof chance === 'number' && Number.isFinite(chance) ? Math.round(chance) : null
}

export function isUpDownMarket(market: Market | null | undefined, title: string) {
  if (market) {
    const yesLabel = resolveOutcomeLabel(market, OUTCOME_INDEX.YES, '').toLowerCase()
    const noLabel = resolveOutcomeLabel(market, OUTCOME_INDEX.NO, '').toLowerCase()
    if (yesLabel === 'up' && noLabel === 'down') {
      return true
    }
  }

  return UP_DOWN_TITLE_PATTERN.test(title)
}

function resolveEventCategoryLabel(event: Pick<Event, 'tags' | 'main_tag'>) {
  const mainCategoryTag = event.tags?.find((tag) => tag.isMainCategory && tag.name?.trim())
  if (mainCategoryTag) {
    return mainCategoryTag.name.trim()
  }

  const mainTag = event.main_tag?.trim()
  if (!mainTag) {
    return null
  }

  return mainTag.charAt(0).toUpperCase() + mainTag.slice(1)
}

export function resolveTickerLabel(event: Event) {
  const cryptoAsset = resolveCryptoEventAsset(event)
  if (cryptoAsset) {
    return cryptoAsset.symbol
  }

  const parenthesised = event.title.match(PARENTHESISED_TICKER_PATTERN)?.[1]
  if (parenthesised) {
    return parenthesised.replace(/[^A-Z0-9]/g, '').slice(0, 4)
  }

  const firstWord = event.title.trim().split(/\s+/)[0] ?? ''
  const letters = firstWord.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return letters ? letters.slice(0, 3) : null
}

function sumMarketVolume24h(event: Event) {
  return event.markets.reduce((total, market) => {
    const volume = Number(market.volume_24h)
    return total + (Number.isFinite(volume) && volume > 0 ? volume : 0)
  }, 0)
}

function resolveSportsStartLabel(event: Event, locale: string) {
  const startTime = event.sports_start_time ?? event.start_date
  if (!startTime) {
    return null
  }

  const date = new Date(startTime)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    }).format(date)
  } catch {
    return null
  }
}

function buildSportsCard(
  event: Event,
  chanceByMarket: Record<string, number>,
  locale: string,
): HomeFeedSportsCard | null {
  const model = buildHomeSportsMoneylineModel(event)
  if (!model) {
    return null
  }

  function resolveButtonChance(button: { conditionId: string; outcomeIndex: number }) {
    const market = event.markets.find((candidate) => candidate.condition_id === button.conditionId)
    if (!market || !hasHomeCardMarketChance(market)) {
      return null
    }

    return Math.round(resolveHomeSportsButtonChance(chanceByMarket[button.conditionId], button.outcomeIndex))
  }

  function buildButton(button: {
    conditionId: string
    outcomeIndex: number
    label: string
    tone: 'team1' | 'team2' | 'draw'
  }): HomeFeedSportsButton {
    return {
      key: `${button.conditionId}:${button.outcomeIndex}`,
      label: button.label,
      tone: button.tone,
      href: resolveEventOutcomePath(event, { conditionId: button.conditionId, outcomeIndex: button.outcomeIndex }),
    }
  }

  const [team1Label, team2Label] = resolveCompactSportsTeamNames(
    { name: model.team1.name, fallback: model.team1.abbreviation },
    { name: model.team2.name, fallback: model.team2.abbreviation },
  )
  const buttons = [
    buildButton({ ...model.team1Button, label: team1Label }),
    ...(model.drawButton ? [buildButton(model.drawButton)] : []),
    buildButton({ ...model.team2Button, label: team2Label }),
  ]

  return {
    team1: { name: model.team1.name, chance: resolveButtonChance(model.team1Button) },
    team2: { name: model.team2.name, chance: resolveButtonChance(model.team2Button) },
    buttons,
    startLabel: resolveSportsStartLabel(event, locale),
  }
}

export function buildHomeFeedMarketCard(event: Event, locale: string): HomeFeedMarketCard {
  const displayMarkets = resolveDisplayMarkets(event)
  const primaryMarket = displayMarkets[0] ?? null
  const chanceByMarket = buildChanceByMarket(event.markets)
  const isSingleMarket = displayMarkets.length === 1
  const cryptoTitle = resolveCryptoCadenceEventTitle(event, locale)
  const title = cryptoTitle ?? event.title
  const isUpDown = isUpDownMarket(primaryMarket, title)
  const yesLabel = primaryMarket ? resolveOutcomeLabel(primaryMarket, OUTCOME_INDEX.YES, 'Yes') : 'Yes'
  const noLabel = primaryMarket ? resolveOutcomeLabel(primaryMarket, OUTCOME_INDEX.NO, 'No') : 'No'
  const sports = isSportsEvent(event) ? buildSportsCard(event, chanceByMarket, locale) : null

  const outcomes: HomeFeedOutcomeRow[] = isSingleMarket
    ? []
    : displayMarkets
        .map((market, index) => ({
          market,
          index,
          chance: resolveMarketChance(market, chanceByMarket),
        }))
        .sort((left, right) => (right.chance ?? -1) - (left.chance ?? -1) || left.index - right.index)
        .slice(0, 2)
        .map(({ market, chance }) => ({
          key: market.condition_id,
          label: market.short_title || market.title,
          chance,
          marketHref: resolveEventOutcomePath(event, { marketSlug: market.slug, outcomeIndex: OUTCOME_INDEX.YES }),
          yesHref: resolveEventOutcomePath(event, { marketSlug: market.slug, outcomeIndex: OUTCOME_INDEX.YES }),
          noHref: resolveEventOutcomePath(event, { marketSlug: market.slug, outcomeIndex: OUTCOME_INDEX.NO }),
        }))

  return {
    id: event.id,
    slug: event.slug,
    title,
    href: resolveEventPagePath(event),
    category: resolveEventCategoryLabel(event),
    iconUrl: event.icon_url?.trim() || null,
    ticker: resolveTickerLabel(event),
    assetName: resolveCryptoEventAssetName(event),
    volume: Number.isFinite(event.volume) ? event.volume : 0,
    isLive: Boolean(event.has_live_chart) || Boolean(event.sports_live),
    isUpDown,
    chance: isSingleMarket && primaryMarket ? resolveMarketChance(primaryMarket, chanceByMarket) : null,
    yesLabel,
    noLabel,
    yesHref: resolveEventOutcomePath(event, { outcomeIndex: OUTCOME_INDEX.YES }),
    noHref: resolveEventOutcomePath(event, { outcomeIndex: OUTCOME_INDEX.NO }),
    outcomes,
    sports,
  }
}

function isActiveEvent(event: Event) {
  return !isEventResolvedLike(event)
}

function isCadenceEvent(event: Event) {
  return Boolean(event.has_live_chart) || isUpDownMarket(resolveDisplayMarkets(event)[0] ?? null, event.title)
}

function uniqueEvents(events: Event[]) {
  const seen = new Set<string>()
  return events.filter((event) => {
    if (seen.has(event.id)) {
      return false
    }
    seen.add(event.id)
    return true
  })
}

function takeCards(
  events: Event[],
  options: { exclude: Set<string>; locale: string; prefer?: (event: Event) => boolean; limit?: number },
) {
  const limit = options.limit ?? HOME_FEED_CARDS_PER_SECTION
  const candidates = events.filter((event) => isActiveEvent(event) && !options.exclude.has(event.id))
  const ordered = options.prefer
    ? [...candidates.filter(options.prefer), ...candidates.filter((event) => !options.prefer!(event))]
    : candidates
  const selected = ordered.slice(0, limit)

  for (const event of selected) {
    options.exclude.add(event.id)
  }

  return selected.map((event) => buildHomeFeedMarketCard(event, options.locale))
}

function buildRankedMarket(event: Event, locale: string): HomeFeedRankedMarket {
  const card = buildHomeFeedMarketCard(event, locale)
  return {
    id: card.id,
    title: card.title,
    href: card.href,
    volume: card.volume,
    chance: card.chance ?? card.outcomes[0]?.chance ?? null,
    change: null,
  }
}

function buildHomeFeedCommunities(rows: HomeFeedCommunityRow[]): HomeFeedCommunity[] {
  return rows.slice(0, HOME_FEED_COMMUNITIES_LIMIT).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    href: `/community/${row.slug}`,
    iconUrl: row.icon_url?.trim() || null,
    isOpen: row.type === 'public',
    marketCount: Number.isFinite(row.market_count) ? row.market_count : 0,
    memberCount: Number.isFinite(row.member_count) ? row.member_count : 0,
  }))
}

function buildNewsMatchTerms(event: Event) {
  return [
    event.main_tag ?? '',
    ...(event.tags ?? []).map((tag) => tag.name ?? ''),
    ...event.markets.map((market) => `${market.title} ${market.short_title ?? ''} ${market.question ?? ''}`),
    ...(event.sports_teams ?? []).map((team) => team.name ?? ''),
  ].filter(Boolean)
}

/**
 * Links each live news story to the best keyword-matching active market, if
 * any. Placeholder feeds are returned untouched so the fixture link survives.
 */
function attachHomeNewsRelatedMarkets(feed: HomeNewsFeed, events: Event[], locale: string): HomeNewsFeed {
  if (feed.isPlaceholder || feed.stories.length === 0 || events.length === 0) {
    return feed
  }

  const candidates = events.map((event) => ({ title: event.title, terms: buildNewsMatchTerms(event) }))
  const stories: HomeNewsStory[] = feed.stories.map((story) => {
    if (story.relatedMarket) {
      return story
    }

    const index = findHomeNewsRelatedMarketIndex(`${story.headline} ${story.summary ?? ''}`, candidates)
    if (index === -1) {
      return story
    }

    const event = events[index]!
    const market = buildRankedMarket(event, locale)
    return {
      ...story,
      category: story.category ?? resolveEventCategoryLabel(event),
      relatedMarket: { title: market.title, href: market.href, chance: market.chance },
    }
  })

  return { ...feed, stories }
}

export function buildHomeFeed(input: BuildHomeFeedInput): HomeFeedData {
  const { locale } = input
  const used = new Set<string>()
  const everyEvent = uniqueEvents([
    ...input.trending,
    ...input.crypto,
    ...input.finance,
    ...input.politics,
    ...input.sports,
  ]).filter(isActiveEvent)

  const liveNow = everyEvent
    .filter((event) => Boolean(event.has_live_chart))
    .slice(0, HOME_FEED_LIVE_NOW_LIMIT)
    .map((event) => {
      const card = buildHomeFeedMarketCard(event, locale)
      return { id: card.id, title: card.title, href: card.href, chance: card.chance, isUpDown: card.isUpDown }
    })

  const topStories = takeCards(
    input.trending.filter((event) => !isSportsEvent(event) && !isCadenceEvent(event)),
    { exclude: used, locale },
  )
  const cryptoUpDown = takeCards(input.crypto, { exclude: used, locale, prefer: isCadenceEvent })
  const finance = takeCards(input.finance, { exclude: used, locale, prefer: isCadenceEvent })
  const politics = takeCards(input.politics, { exclude: used, locale })
  const sports = takeCards(input.sports, { exclude: used, locale, prefer: isSportsEvent })

  const mostTraded = [...everyEvent]
    .sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0))
    .slice(0, HOME_FEED_MOST_TRADED_LIMIT)
    .map((event) => buildRankedMarket(event, locale))

  const breakingNews = everyEvent
    .map((event) => ({ event, volume24h: sumMarketVolume24h(event) }))
    .filter(({ volume24h }) => volume24h > 0)
    .sort((left, right) => right.volume24h - left.volume24h)
    .slice(0, HOME_FEED_BREAKING_NEWS_LIMIT)
    .map(({ event }) => buildRankedMarket(event, locale))

  return {
    liveNow,
    topStories,
    cryptoUpDown,
    communities: buildHomeFeedCommunities(input.communities),
    finance,
    news: attachHomeNewsRelatedMarkets(input.news, everyEvent, locale),
    politics,
    sports,
    mostTraded,
    breakingNews,
  }
}
