import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

void mock.module('next/cache', () => ({
  cacheLife: () => {},
  cacheTag: () => {},
}))

const { buildHomeNewsFeed, HOME_NEWS_STORY_LIMIT, loadHomeNewsFeed, resolveHomeNewsCountry } =
  await import('@/lib/home-news')

const originalFetch = globalThis.fetch
const originalKey = process.env.WORLD_NEWS_API_KEY
const originalCountry = process.env.WORLD_NEWS_TOP_NEWS_COUNTRY

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

beforeEach(() => {
  delete process.env.WORLD_NEWS_API_KEY
  delete process.env.WORLD_NEWS_TOP_NEWS_COUNTRY
})

afterEach(() => {
  globalThis.fetch = originalFetch
  restoreEnv('WORLD_NEWS_API_KEY', originalKey)
  restoreEnv('WORLD_NEWS_TOP_NEWS_COUNTRY', originalCountry)
})

function mockTopNews(payload: unknown, status = 200) {
  const calls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input))
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return calls
}

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

  it('serves the lead story of each World News top-news cluster when the key is set', async () => {
    process.env.WORLD_NEWS_API_KEY = 'test-key'
    process.env.WORLD_NEWS_TOP_NEWS_COUNTRY = 'gb'
    const calls = mockTopNews({
      top_news: [
        {
          news: [
            {
              id: 1,
              title: 'Bank of England holds rates',
              summary: 'The Bank kept rates unchanged on Thursday.',
              url: 'https://www.bbc.co.uk/news/business-1',
              image: 'https://ichef.bbci.co.uk/news/1.jpg',
              publish_date: '2026-10-24 09:00:00',
            },
            { id: 2, title: 'Duplicate angle', url: 'https://www.ft.com/content/1' },
          ],
        },
        { news: [{ id: 3, title: 'Second cluster', url: 'https://www.theguardian.com/uk/2' }] },
      ],
    })

    const feed = await loadHomeNewsFeed('en')

    expect(calls).toHaveLength(1)
    const url = new URL(calls[0]!)
    expect(url.pathname).toBe('/top-news')
    expect(url.searchParams.get('source-country')).toBe('gb')
    expect(url.searchParams.get('language')).toBe('en')
    expect(feed.isPlaceholder).toBe(false)
    expect(feed.stories.map((story) => story.headline)).toEqual(['Bank of England holds rates', 'Second cluster'])
    expect(feed.stories[0]).toMatchObject({
      summary: 'The Bank kept rates unchanged on Thursday.',
      outlet: { name: 'bbc.co.uk', logoUrl: 'https://www.bbc.co.uk/favicon.ico' },
      publishedAt: '2026-10-24T09:00:00.000Z',
      url: 'https://www.bbc.co.uk/news/business-1',
      imageUrl: 'https://ichef.bbci.co.uk/news/1.jpg',
      relatedMarket: null,
    })
    expect(feed.outlets).toEqual(['bbc.co.uk', 'theguardian.com'])
  })

  it('returns an empty live feed (section hidden) when the provider fails, e.g. quota exhausted', async () => {
    process.env.WORLD_NEWS_API_KEY = 'test-key'
    mockTopNews({}, 402)

    const feed = await loadHomeNewsFeed('en')

    expect(feed.isPlaceholder).toBe(false)
    expect(feed.stories).toHaveLength(0)
  })

  it('pins one language for every locale so the quota is not multiplied by locale count', async () => {
    process.env.WORLD_NEWS_API_KEY = 'test-key'
    const calls = mockTopNews({ top_news: [] })

    await loadHomeNewsFeed('pt')

    expect(new URL(calls[0]!).searchParams.get('language')).toBe('en')
  })

  it('defaults the top-news country to us and validates the override', () => {
    expect(resolveHomeNewsCountry()).toBe('us')
    process.env.WORLD_NEWS_TOP_NEWS_COUNTRY = 'KE'
    expect(resolveHomeNewsCountry()).toBe('ke')
    process.env.WORLD_NEWS_TOP_NEWS_COUNTRY = 'kenya'
    expect(resolveHomeNewsCountry()).toBe('us')
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
