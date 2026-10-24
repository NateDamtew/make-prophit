import { cacheLife } from 'next/cache'

import { fetchWorldNewsTopNews, isWorldNewsApiConfigured, resolveWorldNewsLanguage } from '@/lib/world-news-api'

/**
 * Home page News section data source.
 *
 * The section is built against a typed provider interface. When
 * `WORLD_NEWS_API_KEY` is set, `worldNewsHomeNewsProvider` serves the lead
 * story of each top-news cluster for `WORLD_NEWS_TOP_NEWS_COUNTRY` (default
 * `us`). Otherwise `placeholderHomeNewsProvider` returns clearly bracketed
 * fixture stories and the feed is flagged with `isPlaceholder: true` so the
 * cards render as placeholders.
 *
 * Rules for a real provider (from the handoff): show the headline, a short
 * snippet, the outlet and a link back; never republish full text or host the
 * outlets' images (we only hotlink the outlet's own image and favicon).
 * `relatedMarket` is matched on our side (see `attachHomeNewsRelatedMarkets`
 * in home-feed-sections); it stays `null` when nothing matches.
 */

export interface HomeNewsOutlet {
  name: string
  logoUrl: string | null
}

export interface HomeNewsRelatedMarket {
  title: string
  href: string
  chance: number | null
}

export interface HomeNewsStory {
  id: string
  headline: string
  summary: string | null
  category: string | null
  outlet: HomeNewsOutlet
  /** ISO timestamp, or null when the provider does not supply one. */
  publishedAt: string | null
  url: string | null
  imageUrl: string | null
  relatedMarket: HomeNewsRelatedMarket | null
}

export interface HomeNewsFeed {
  stories: HomeNewsStory[]
  /** Distinct outlet names, in first-seen order, for the outlet filter chips. */
  outlets: string[]
  /** True while the stories come from the fixture provider. */
  isPlaceholder: boolean
}

interface HomeNewsProviderInput {
  locale: string
  limit: number
}

interface HomeNewsProvider {
  readonly id: 'placeholder' | 'world-news-api' | 'newsdata'
  listStories(input: HomeNewsProviderInput): Promise<HomeNewsStory[]>
}

export const HOME_NEWS_STORY_LIMIT = 7
const DEFAULT_TOP_NEWS_COUNTRY = 'us'
const SUMMARY_MAX_LENGTH = 220

const PLACEHOLDER_OUTLETS = ['[Outlet A]', '[Outlet B]', '[Outlet C]'] as const

const placeholderHomeNewsProvider: HomeNewsProvider = {
  id: 'placeholder',
  async listStories({ limit }) {
    return Array.from({ length: limit }, (_, index) => ({
      id: `placeholder-${index + 1}`,
      headline: index === 0 ? '[Lead headline from one of your outlets]' : '[Headline]',
      summary: index === 0 ? '[One or two sentence summary of the story, written or excerpted from the outlet.]' : null,
      category: '[Category]',
      outlet: {
        name: PLACEHOLDER_OUTLETS[index % PLACEHOLDER_OUTLETS.length],
        logoUrl: null,
      },
      publishedAt: null,
      url: null,
      imageUrl: null,
      relatedMarket: index === 0 ? { title: '[Market question]', href: '/', chance: null } : null,
    }))
  },
}

export function resolveHomeNewsCountry() {
  const configured = process.env.WORLD_NEWS_TOP_NEWS_COUNTRY?.trim().toLowerCase()
  return configured && /^[a-z]{2}$/.test(configured) ? configured : DEFAULT_TOP_NEWS_COUNTRY
}

/**
 * One language for every locale on purpose: a per-locale language would mean
 * one top-news call per locale per hour (12×), which the quota cannot absorb.
 */
function resolveHomeNewsLanguage() {
  return resolveWorldNewsLanguage(process.env.WORLD_NEWS_TOP_NEWS_LANGUAGE)
}

function truncateSummary(value: string | null) {
  const summary = value?.replace(/\s+/g, ' ').trim()
  if (!summary) {
    return null
  }
  if (summary.length <= SUMMARY_MAX_LENGTH) {
    return summary
  }

  const cut = summary.slice(0, SUMMARY_MAX_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > SUMMARY_MAX_LENGTH / 2 ? lastSpace : SUMMARY_MAX_LENGTH).trimEnd()}…`
}

/**
 * One World News call per country/language/limit, shared by every home page
 * render. The home page itself revalidates every 5 minutes for 12 locales, so
 * without this cache the section would burn through the daily quota.
 */
async function loadCachedTopStories(country: string, language: string, limit: number): Promise<HomeNewsStory[]> {
  'use cache'
  cacheLife({ stale: 900, revalidate: 3_600, expire: 14_400 })

  const articles = await fetchWorldNewsTopNews({ sourceCountry: country, language, limit })

  return articles.map((article) => ({
    id: `world-news:${article.id ?? article.url}`,
    headline: article.title,
    summary: truncateSummary(article.summary),
    category: null,
    outlet: {
      name: article.source,
      logoUrl: article.faviconUrl,
    },
    publishedAt: article.publishedAt,
    url: article.url,
    imageUrl: article.imageUrl,
    relatedMarket: null,
  }))
}

const worldNewsHomeNewsProvider: HomeNewsProvider = {
  id: 'world-news-api',
  listStories({ limit }) {
    return loadCachedTopStories(resolveHomeNewsCountry(), resolveHomeNewsLanguage(), limit)
  },
}

function getHomeNewsProvider(): HomeNewsProvider {
  return isWorldNewsApiConfigured() ? worldNewsHomeNewsProvider : placeholderHomeNewsProvider
}

export function buildHomeNewsFeed(stories: HomeNewsStory[], isPlaceholder: boolean): HomeNewsFeed {
  const outlets: string[] = []
  for (const story of stories) {
    const name = story.outlet.name.trim()
    if (name && !outlets.includes(name)) {
      outlets.push(name)
    }
  }

  return { stories, outlets, isPlaceholder }
}

export async function loadHomeNewsFeed(locale: string): Promise<HomeNewsFeed> {
  const provider = getHomeNewsProvider()

  try {
    const stories = await provider.listStories({ locale, limit: HOME_NEWS_STORY_LIMIT })
    return buildHomeNewsFeed(stories, provider.id === 'placeholder')
  } catch (error) {
    // Quota exhausted, key rejected or network failure: an empty live feed hides the section
    // (HomeFeedNews renders nothing without a lead story) rather than showing sample stories.
    console.error('Failed to load home news feed', error)
    return buildHomeNewsFeed([], provider.id === 'placeholder')
  }
}
