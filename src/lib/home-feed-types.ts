import type { HomeNewsFeed } from '@/lib/home-news'

/**
 * Client-safe types, constants and helpers for the section-led home feed.
 * Keep this module free of server-only imports: it is bundled into the browser.
 */

export const HOME_FEED_CARDS_PER_SECTION = 3
export const HOME_FEED_LIVE_NOW_LIMIT = 10
export const HOME_FEED_MOST_TRADED_LIMIT = 5
export const HOME_FEED_BREAKING_NEWS_LIMIT = 3
export const HOME_FEED_COMMUNITIES_LIMIT = 10

export interface HomeFeedOutcomeRow {
  key: string
  label: string
  chance: number | null
  marketHref: string
  yesHref: string
  noHref: string
}

export interface HomeFeedSportsButton {
  key: string
  label: string
  href: string
  tone: 'team1' | 'team2' | 'draw'
}

export interface HomeFeedSportsCard {
  team1: { name: string; chance: number | null }
  team2: { name: string; chance: number | null }
  buttons: HomeFeedSportsButton[]
  startLabel: string | null
}

export interface HomeFeedMarketCard {
  id: string
  slug: string
  title: string
  href: string
  category: string | null
  iconUrl: string | null
  /** Short asset label for the ticker tile (BTC, XAU, SPX…). */
  ticker: string | null
  /** Long asset name shown next to the LIVE flag on crypto cards. */
  assetName: string | null
  volume: number
  isLive: boolean
  /** True when the primary market is an Up/Down market rather than Yes/No. */
  isUpDown: boolean
  /** Chance (0–100) of the Yes/Up outcome on the primary market, when priced. */
  chance: number | null
  yesLabel: string
  noLabel: string
  yesHref: string
  noHref: string
  /** Top outcome rows for multi-market events (empty for single-market events). */
  outcomes: HomeFeedOutcomeRow[]
  sports: HomeFeedSportsCard | null
}

export interface HomeFeedLiveItem {
  id: string
  title: string
  href: string
  chance: number | null
  isUpDown: boolean
}

export interface HomeFeedRankedMarket {
  id: string
  title: string
  href: string
  volume: number
  chance: number | null
  /** Probability change over the ranking window, in points. Null until a price-change feed exists. */
  change: number | null
}

export interface HomeFeedCommunity {
  id: string
  slug: string
  name: string
  href: string
  iconUrl: string | null
  isOpen: boolean
  marketCount: number
  memberCount: number
}

export interface HomeFeedData {
  liveNow: HomeFeedLiveItem[]
  topStories: HomeFeedMarketCard[]
  cryptoUpDown: HomeFeedMarketCard[]
  communities: HomeFeedCommunity[]
  finance: HomeFeedMarketCard[]
  news: HomeNewsFeed
  politics: HomeFeedMarketCard[]
  sports: HomeFeedMarketCard[]
  mostTraded: HomeFeedRankedMarket[]
  breakingNews: HomeFeedRankedMarket[]
}

export interface HomeFeedDirection {
  direction: 'up' | 'down'
  chance: number
}

/**
 * Up/Down markets quote the probability of the Up outcome. Cards show the
 * leading direction with its own probability, so "47% Down" means Down is
 * priced at 47%, never the Up price relabelled.
 */
export function resolveLeadingDirection(upChance: number | null): HomeFeedDirection | null {
  if (upChance == null || !Number.isFinite(upChance)) {
    return null
  }

  const rounded = Math.round(Math.max(0, Math.min(100, upChance)))
  return rounded >= 50 ? { direction: 'up', chance: rounded } : { direction: 'down', chance: 100 - rounded }
}
