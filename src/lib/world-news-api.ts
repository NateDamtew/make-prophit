export interface WorldNewsArticle {
  id: number | null
  title: string
  summary: string | null
  url: string
  source: string
  faviconUrl: string | null
  imageUrl: string | null
  publishedAt: string | null
  language: string | null
  sourceCountry: string | null
  sentiment: number | null
}

export interface WorldNewsSearchOptions {
  text: string
  /** ISO 2-letter language code. Defaults to `en`. */
  language?: string | null
  /** Comma-separated ISO 2-letter country codes, e.g. `ke,us`. */
  sourceCountries?: string | null
  /** Only return articles published after this date. */
  earliestPublishDate?: Date | null
  /** Max results, 1–100. Defaults to 6. */
  number?: number
  sort?: 'publish-time' | 'relevance'
  timeoutMs?: number
  signal?: AbortSignal
}

interface WorldNewsSearchResponsePayload {
  offset?: number
  number?: number
  available?: number
  news?: Array<{
    id?: number
    title?: string
    text?: string
    summary?: string
    url?: string
    image?: string | null
    publish_date?: string | null
    authors?: string[]
    language?: string | null
    source_country?: string | null
    sentiment?: number | null
  }>
}

export class WorldNewsApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'WorldNewsApiError'
    this.status = status
  }
}

const WORLD_NEWS_API_BASE_URL = 'https://api.worldnewsapi.com'
const DEFAULT_RESULT_COUNT = 6
const MAX_RESULT_COUNT = 100
const DEFAULT_TIMEOUT_MS = 12_000
/** World News API only supports a subset of our locales; others fall back to English. */
const WORLD_NEWS_LANGUAGES = new Set(['en', 'de', 'es', 'pt', 'fr', 'zh', 'ja', 'ar', 'ru', 'it', 'pl', 'ko'])

function getWorldNewsApiKey() {
  return process.env.WORLD_NEWS_API_KEY?.trim() || null
}

export function isWorldNewsApiConfigured() {
  return getWorldNewsApiKey() !== null
}

export function resolveWorldNewsLanguage(locale: string | null | undefined) {
  const language = (locale ?? '').split('-')[0]?.toLowerCase() ?? ''
  return WORLD_NEWS_LANGUAGES.has(language) ? language : 'en'
}

/**
 * World News API returns `publish_date` as `YYYY-MM-DD HH:MM:SS` in UTC.
 * Convert it to an ISO string so it matches the rest of the codebase.
 */
export function parseWorldNewsPublishDate(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed) ? `${trimmed.replace(' ', 'T')}Z` : trimmed
  const date = new Date(normalized)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function resolveSourceFromUrl(url: URL) {
  return url.hostname.replace(/^www\./, '').toLowerCase()
}

export function normalizeWorldNewsArticle(
  item: NonNullable<WorldNewsSearchResponsePayload['news']>[number],
): WorldNewsArticle | null {
  const title = item.title?.replace(/\s+/g, ' ').trim()
  const rawUrl = item.url?.trim()
  if (!title || !rawUrl) {
    return null
  }

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null
  }

  const summary = item.summary?.trim() || item.text?.trim().slice(0, 280) || null

  return {
    id: typeof item.id === 'number' ? item.id : null,
    title,
    summary,
    url: url.toString(),
    source: resolveSourceFromUrl(url),
    faviconUrl: new URL('/favicon.ico', url.origin).toString(),
    imageUrl: item.image?.trim() || null,
    publishedAt: parseWorldNewsPublishDate(item.publish_date),
    language: item.language ?? null,
    sourceCountry: item.source_country ?? null,
    sentiment: typeof item.sentiment === 'number' && Number.isFinite(item.sentiment) ? item.sentiment : null,
  }
}

function formatPublishDate(date: Date) {
  // API expects `YYYY-MM-DD HH:MM:SS` (UTC).
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * Turn a prediction-market title into a keyword query World News API can match.
 * Strips the question framing ("Will … by December 31?") and keeps the named entities.
 */
export function buildWorldNewsQuery(input: {
  title: string
  teams?: Array<string | null | undefined> | null
  maxLength?: number
}) {
  const teams = (input.teams ?? []).map((team) => team?.trim() ?? '').filter(Boolean)
  const maxLength = input.maxLength ?? 120

  if (teams.length >= 2) {
    return teams.slice(0, 2).join(' ').slice(0, maxLength).trim()
  }

  let query = input.title
    .normalize('NFKC')
    .replace(/[“”"'‘’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  query = query
    .replace(/^(will|does|do|is|are|can|could|should|has|have|who|what|which|how many|how much)\s+/i, '')
    .replace(/\?+$/, '')
    .replace(
      /\s+(by|before|until|on|in)\s+(the\s+)?(end\s+of\s+)?((january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s*\d{0,2},?\s*(\d{4})?|\d{4}|q[1-4]\s*\d{4}|\d{1,2}\/\d{1,2}(\/\d{2,4})?)\s*$/i,
      '',
    )
    .replace(/\s+(yes|no)$/i, '')
    .replace(/[?!.,;:]+$/g, '')
    .trim()

  if (!query) {
    query = input.title.trim()
  }

  return query.slice(0, maxLength).trim()
}

export async function searchWorldNews(options: WorldNewsSearchOptions): Promise<WorldNewsArticle[]> {
  const apiKey = getWorldNewsApiKey()
  if (!apiKey) {
    throw new WorldNewsApiError('WORLD_NEWS_API_KEY is not configured.', 0)
  }

  const text = options.text.trim()
  if (!text) {
    return []
  }

  const url = new URL('/search-news', WORLD_NEWS_API_BASE_URL)
  url.searchParams.set('text', text)
  url.searchParams.set('language', resolveWorldNewsLanguage(options.language))
  url.searchParams.set(
    'number',
    String(Math.min(MAX_RESULT_COUNT, Math.max(1, Math.round(options.number ?? DEFAULT_RESULT_COUNT)))),
  )
  if (options.sourceCountries?.trim()) {
    url.searchParams.set('source-countries', options.sourceCountries.trim())
  }
  if (options.earliestPublishDate) {
    url.searchParams.set('earliest-publish-date', formatPublishDate(options.earliestPublishDate))
  }
  if (options.sort === 'publish-time') {
    url.searchParams.set('sort', 'publish-time')
    url.searchParams.set('sort-direction', 'DESC')
  }

  const response = await fetch(url.toString(), {
    headers: {
      'x-api-key': apiKey,
      Accept: 'application/json',
    },
    signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    cache: 'no-store',
  })

  if (!response.ok) {
    const message =
      response.status === 402
        ? 'World News API daily quota exhausted.'
        : response.status === 429
          ? 'World News API rate limit reached.'
          : response.status === 401
            ? 'World News API key rejected.'
            : `World News API request failed (${response.status}).`
    throw new WorldNewsApiError(message, response.status)
  }

  const payload = (await response.json().catch(() => null)) as WorldNewsSearchResponsePayload | null
  const seenUrls = new Set<string>()

  return (payload?.news ?? []).flatMap((item) => {
    const article = normalizeWorldNewsArticle(item)
    if (!article || seenUrls.has(article.url)) {
      return []
    }

    seenUrls.add(article.url)
    return [article]
  })
}

/**
 * Best-effort search that never throws: quota, rate-limit and network errors
 * are logged and yield an empty list so callers can fall back to other sources.
 */
export async function searchWorldNewsSafe(options: WorldNewsSearchOptions): Promise<WorldNewsArticle[]> {
  if (!isWorldNewsApiConfigured()) {
    return []
  }

  try {
    return await searchWorldNews(options)
  } catch (error) {
    console.error('World News API search failed', error instanceof Error ? error.message : error)
    return []
  }
}
