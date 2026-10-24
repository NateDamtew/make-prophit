/**
 * Home page News section data source.
 *
 * The section is built against a typed provider interface so an aggregator
 * (World News API or NewsData.io were the candidates in the design handoff)
 * can be plugged in later without touching the UI. Until one is configured,
 * `placeholderHomeNewsProvider` returns clearly bracketed fixture stories and
 * the feed is flagged with `isPlaceholder: true` so the cards render as
 * placeholders.
 *
 * Rules for a real provider (from the handoff): show the headline, a short
 * snippet, the outlet and a link back; never republish full text or host the
 * outlets' images. `relatedMarket` has to be matched on our side (keyword or
 * entity matching); leave it `null` when nothing matches.
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

function getHomeNewsProvider(): HomeNewsProvider {
  // Swap this for the aggregator adapter once an API key and its terms are
  // cleared for commercial use (see the design handoff, "News aggregation").
  return placeholderHomeNewsProvider
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
    console.error('Failed to load home news feed', error)
    return buildHomeNewsFeed([], provider.id === 'placeholder')
  }
}
