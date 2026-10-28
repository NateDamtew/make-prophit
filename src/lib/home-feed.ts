import type { SupportedLocale } from '@/i18n/locales'
import type { HomeFeedCommunityRow } from '@/lib/home-feed-sections'
import type { HomeNewsFeed } from '@/lib/home-news'
import type { Event } from '@/types'

import { CommunityRepository } from '@/lib/db/queries/community'
import { EventRepository } from '@/lib/db/queries/event'
import { filterHomeEvents } from '@/lib/home-events'
import { HOME_FEED_COMMUNITIES_LIMIT } from '@/lib/home-feed-types'
import { loadHomeNewsFeed } from '@/lib/home-news'

const HOME_FEED_POOL_SIZE = 12

export interface HomeFeedPools {
  crypto: Event[]
  finance: Event[]
  politics: Event[]
  sports: Event[]
  communities: HomeFeedCommunityRow[]
  news: HomeNewsFeed
}

interface LoadHomeFeedPoolsOptions {
  currentTimestamp: number | null
  locale: SupportedLocale
}

interface LoadHomeFeedPoolOptions extends LoadHomeFeedPoolsOptions {
  tag: string
  sportsSection?: 'games' | 'props' | ''
}

async function loadHomeFeedPool({ currentTimestamp, locale, tag, sportsSection = '' }: LoadHomeFeedPoolOptions) {
  try {
    const { data, error } = await EventRepository.listEvents({
      tag,
      mainTag: tag,
      search: '',
      sortBy: 'volume_24h',
      userId: '',
      bookmarked: false,
      status: 'active',
      excludeSportsAuxiliary: true,
      sportsSection,
      offset: 0,
      limit: HOME_FEED_POOL_SIZE,
      locale,
      cardPayload: true,
    })

    if (error) {
      console.error(`Failed to load home feed pool "${tag}"`, error)
      return []
    }

    return filterHomeEvents(data ?? [], { currentTimestamp })
  } catch (error) {
    console.error(`Failed to load home feed pool "${tag}"`, error)
    return []
  }
}

async function loadHomeFeedCommunities(): Promise<HomeFeedCommunityRow[]> {
  try {
    const { data, error } = await CommunityRepository.listPublic({
      limit: HOME_FEED_COMMUNITIES_LIMIT,
      sort: 'popular',
    })
    if (error) {
      console.error('Failed to load home feed communities', error)
      return []
    }

    return data ?? []
  } catch (error) {
    console.error('Failed to load home feed communities', error)
    return []
  }
}

/**
 * Loads the per-section market pools, communities and news for the home feed.
 * The Top stories pool reuses the page's trending events, so it is not loaded here.
 */
export async function loadHomeFeedPools({
  currentTimestamp,
  locale,
}: LoadHomeFeedPoolsOptions): Promise<HomeFeedPools> {
  const [crypto, finance, politics, sports, communities, news] = await Promise.all([
    loadHomeFeedPool({ currentTimestamp, locale, tag: 'crypto' }),
    loadHomeFeedPool({ currentTimestamp, locale, tag: 'finance' }),
    loadHomeFeedPool({ currentTimestamp, locale, tag: 'politics' }),
    loadHomeFeedPool({ currentTimestamp, locale, tag: 'sports', sportsSection: 'games' }),
    loadHomeFeedCommunities(),
    loadHomeNewsFeed(locale),
  ])

  return { crypto, finance, politics, sports, communities, news }
}
