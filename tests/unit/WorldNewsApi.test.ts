import { afterEach, describe, expect, it } from 'bun:test'

import {
  buildWorldNewsQuery,
  normalizeWorldNewsArticle,
  parseWorldNewsPublishDate,
  resolveWorldNewsLanguage,
  searchWorldNews,
  WorldNewsApiError,
} from '@/lib/world-news-api'

const originalFetch = globalThis.fetch
const originalKey = process.env.WORLD_NEWS_API_KEY

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalKey === undefined) {
    delete process.env.WORLD_NEWS_API_KEY
  } else {
    process.env.WORLD_NEWS_API_KEY = originalKey
  }
})

describe('buildWorldNewsQuery', () => {
  it('strips the yes/no question framing and deadline from a market title', () => {
    expect(buildWorldNewsQuery({ title: 'Will Bitcoin hit $150k by December 31?' })).toBe('Bitcoin hit $150k')
    expect(buildWorldNewsQuery({ title: 'Will Kenya win AFCON 2027 in 2027?' })).toBe('Kenya win AFCON 2027')
    expect(buildWorldNewsQuery({ title: 'Who will win the 2027 Kenyan presidential election?' })).toBe(
      'will win the 2027 Kenyan presidential election',
    )
  })

  it('prefers team names for sports matchups', () => {
    expect(buildWorldNewsQuery({ title: 'Arsenal vs Chelsea: Match winner', teams: ['Arsenal', 'Chelsea'] })).toBe(
      'Arsenal Chelsea',
    )
  })

  it('falls back to the raw title when stripping empties the query', () => {
    expect(buildWorldNewsQuery({ title: '???' })).toBe('???')
  })
})

describe('parseWorldNewsPublishDate', () => {
  it('converts the API UTC timestamp format to ISO', () => {
    expect(parseWorldNewsPublishDate('2026-10-24 10:32:00')).toBe('2026-10-24T10:32:00.000Z')
    expect(parseWorldNewsPublishDate('')).toBeNull()
    expect(parseWorldNewsPublishDate('not a date')).toBeNull()
  })
})

describe('resolveWorldNewsLanguage', () => {
  it('maps supported locales and defaults to English', () => {
    expect(resolveWorldNewsLanguage('pt')).toBe('pt')
    expect(resolveWorldNewsLanguage('pt-BR')).toBe('pt')
    expect(resolveWorldNewsLanguage('sw')).toBe('en')
    expect(resolveWorldNewsLanguage(null)).toBe('en')
  })
})

describe('normalizeWorldNewsArticle', () => {
  it('derives source and favicon from the article URL', () => {
    const article = normalizeWorldNewsArticle({
      id: 1,
      title: '  Bitcoin   slides  ',
      summary: 'Short summary.',
      url: 'https://www.fool.com/investing/2026/10/24/bitcoin',
      publish_date: '2026-10-24 10:32:00',
      source_country: 'us',
      sentiment: -0.26,
    })

    expect(article).toEqual({
      id: 1,
      title: 'Bitcoin slides',
      summary: 'Short summary.',
      url: 'https://www.fool.com/investing/2026/10/24/bitcoin',
      source: 'fool.com',
      faviconUrl: 'https://www.fool.com/favicon.ico',
      imageUrl: null,
      publishedAt: '2026-10-24T10:32:00.000Z',
      language: null,
      sourceCountry: 'us',
      sentiment: -0.26,
    })
  })

  it('rejects items without a title or with a non-http URL', () => {
    expect(normalizeWorldNewsArticle({ title: '', url: 'https://example.com' })).toBeNull()
    expect(normalizeWorldNewsArticle({ title: 'x', url: 'javascript:alert(1)' })).toBeNull()
  })
})

describe('searchWorldNews', () => {
  it('sends the key in the x-api-key header and dedupes results by URL', async () => {
    process.env.WORLD_NEWS_API_KEY = 'test-key'
    let capturedUrl = ''
    let capturedHeaders: Record<string, string> = {}
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>
      return new Response(
        JSON.stringify({
          news: [
            { title: 'A', url: 'https://a.com/1', publish_date: '2026-10-24 10:32:00' },
            { title: 'A again', url: 'https://a.com/1' },
            { title: 'B', url: 'https://b.com/2' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const results = await searchWorldNews({
      text: 'Bitcoin',
      language: 'pt',
      number: 3,
      sort: 'publish-time',
      earliestPublishDate: new Date('2026-10-17T00:00:00Z'),
    })

    const url = new URL(capturedUrl)
    expect(url.origin + url.pathname).toBe('https://api.worldnewsapi.com/search-news')
    expect(url.searchParams.get('text')).toBe('Bitcoin')
    expect(url.searchParams.get('language')).toBe('pt')
    expect(url.searchParams.get('number')).toBe('3')
    expect(url.searchParams.get('sort')).toBe('publish-time')
    expect(url.searchParams.get('earliest-publish-date')).toBe('2026-10-17 00:00:00')
    expect(url.searchParams.has('api-key')).toBe(false)
    expect(capturedHeaders['x-api-key']).toBe('test-key')
    expect(results.map((item) => item.url)).toEqual(['https://a.com/1', 'https://b.com/2'])
  })

  it('throws a typed error on quota exhaustion', async () => {
    process.env.WORLD_NEWS_API_KEY = 'test-key'
    globalThis.fetch = (async () => new Response('{}', { status: 402 })) as typeof fetch

    await expect(searchWorldNews({ text: 'Bitcoin' })).rejects.toBeInstanceOf(WorldNewsApiError)
  })

  it('throws when the key is missing', async () => {
    delete process.env.WORLD_NEWS_API_KEY
    await expect(searchWorldNews({ text: 'Bitcoin' })).rejects.toThrow('WORLD_NEWS_API_KEY')
  })
})
