import { describe, expect, it } from 'bun:test'

import { buildHomeNewsFeed, HOME_NEWS_STORY_LIMIT, loadHomeNewsFeed } from '@/lib/home-news'

describe('home-news', () => {
  it('serves clearly marked placeholder stories until a provider is configured', async () => {
    const feed = await loadHomeNewsFeed('en')

    expect(feed.isPlaceholder).toBe(true)
    expect(feed.stories).toHaveLength(HOME_NEWS_STORY_LIMIT)
    expect(feed.stories[0]?.headline).toMatch(/^\[.*\]$/)
    expect(feed.stories[0]?.relatedMarket?.title).toBe('[Market question]')
    expect(feed.stories.every((story) => story.url === null && story.imageUrl === null)).toBe(true)
    expect(feed.outlets).toEqual(['[Outlet A]', '[Outlet B]', '[Outlet C]'])
  })

  it('collects distinct outlets in first-seen order', () => {
    const story = {
      id: '1',
      headline: 'A',
      summary: null,
      category: null,
      outlet: { name: 'BBC', logoUrl: null },
      publishedAt: null,
      url: null,
      imageUrl: null,
      relatedMarket: null,
    }
    const feed = buildHomeNewsFeed(
      [story, { ...story, id: '2', outlet: { name: 'CNN', logoUrl: null } }, { ...story, id: '3' }],
      false,
    )

    expect(feed.outlets).toEqual(['BBC', 'CNN'])
    expect(feed.isPlaceholder).toBe(false)
  })
})
