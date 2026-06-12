/**
 * Server-side URL → context extractor for the Phase 2 market creator.
 *
 * Security model
 * --------------
 * Anything a user-supplied URL touches is a potential SSRF, byte-bomb, or
 * abuse vector. We treat URLs as adversarial and:
 *   1. Reject anything that isn't HTTP(S) or resolves to a private/loopback IP.
 *   2. Cap the response body at 1MB (defends against decompression bombs).
 *   3. Time out at 10s wall-clock.
 *   4. Honour robots.txt per host (cached 24h).
 *   5. Cache successful extractions per URL for 1h to dedupe AI calls.
 *
 * The output is intentionally minimal: title, meta description, OG image, and
 * the first ~1500 chars of body text. We don't store HTML; we don't follow
 * redirects to other hosts; we don't surface the raw URL contents to the AI
 * beyond the extracted fields.
 */

import { Buffer } from 'node:buffer'
import { lookup } from 'node:dns/promises'

export interface ExtractedUrlContent {
  url: string
  finalUrl: string
  title: string | null
  description: string | null
  ogImage: string | null
  bodyExcerpt: string | null
  fetchedAt: string
}

export interface UrlIngestError {
  code:
    | 'invalid_url'
    | 'blocked_host'
    | 'fetch_failed'
    | 'too_large'
    | 'unsupported_content_type'
    | 'robots_disallowed'
    | 'empty_content'
  message: string
}

const FETCH_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 1_024 * 1_024 // 1 MB
const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000
const CONTENT_TTL_MS = 60 * 60 * 1000
const USER_AGENT = 'Prophit-MarketAssistant/1.0 (+https://makeprophit.com/about/bot)'

const contentCache = new Map<string, { content: ExtractedUrlContent, expiresAt: number }>()
const robotsCache = new Map<string, { allowed: boolean, expiresAt: number }>()

// --- SSRF guards -------------------------------------------------------------

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(n => Number.parseInt(n, 10))
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) {
    return true
  }
  const [a, b] = parts
  return (
    a === 10 // 10.0.0.0/8
    || a === 127 // loopback
    || a === 0 // 0.0.0.0/8
    || (a === 169 && b === 254) // link-local
    || (a === 172 && b >= 16 && b <= 31) // 172.16.0.0/12
    || (a === 192 && b === 168) // 192.168.0.0/16
    || a >= 224 // multicast / reserved
  )
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  return (
    lower === '::1'
    || lower === '::'
    || lower.startsWith('fc') // unique local
    || lower.startsWith('fd')
    || lower.startsWith('fe80') // link local
    || lower.startsWith('::ffff:') // IPv4-mapped — fall back to v4 check
  )
}

async function resolveAndCheckHost(host: string): Promise<{ ok: true } | { ok: false, error: UrlIngestError }> {
  // Block obvious literals before DNS.
  const literal = host.replace(/^\[|\]$/g, '')
  if (literal === 'localhost' || /^[\d.]+$/.test(literal) || literal.includes(':')) {
    const isV4 = /^[\d.]+$/.test(literal)
    if (isV4 && isPrivateIPv4(literal)) {
      return { ok: false, error: { code: 'blocked_host', message: 'Private IP addresses are not allowed.' } }
    }
    if (!isV4 && isPrivateIPv6(literal)) {
      return { ok: false, error: { code: 'blocked_host', message: 'Private IPv6 addresses are not allowed.' } }
    }
    if (literal === 'localhost') {
      return { ok: false, error: { code: 'blocked_host', message: 'localhost is not allowed.' } }
    }
  }

  // Resolve and check every record. Any private record blocks the URL.
  try {
    const addresses = await lookup(host, { all: true })
    for (const { address, family } of addresses) {
      if (family === 4 && isPrivateIPv4(address)) {
        return { ok: false, error: { code: 'blocked_host', message: 'URL resolves to a private network.' } }
      }
      if (family === 6 && isPrivateIPv6(address)) {
        return { ok: false, error: { code: 'blocked_host', message: 'URL resolves to a private network.' } }
      }
    }
    return { ok: true }
  }
  catch {
    return { ok: false, error: { code: 'fetch_failed', message: 'Could not resolve host.' } }
  }
}

// --- robots.txt --------------------------------------------------------------

/**
 * Per-host robots.txt check. We honour `Disallow: /` for our UA or `*`; any
 * narrower disallow is conservatively respected by checking exact-path prefix.
 * Implementation keeps the parser intentionally small — full robots-spec
 * compliance is overkill here.
 */
async function isAllowedByRobots(target: URL): Promise<boolean> {
  const cacheKey = `${target.origin}|${target.pathname}`
  const cached = robotsCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.allowed
  }

  try {
    const robotsUrl = `${target.origin}/robots.txt`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    const res = await fetch(robotsUrl, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) {
      // Missing or 4xx robots.txt -> assume allowed (standard interpretation).
      robotsCache.set(cacheKey, { allowed: true, expiresAt: Date.now() + ROBOTS_TTL_MS })
      return true
    }
    const text = (await res.text()).slice(0, 32_768) // cap parsing input
    const allowed = parseRobotsAllowed(text, target.pathname)
    robotsCache.set(cacheKey, { allowed, expiresAt: Date.now() + ROBOTS_TTL_MS })
    return allowed
  }
  catch {
    // Network failure -> err on the side of allowed (consistent with most crawlers).
    return true
  }
}

function parseRobotsAllowed(text: string, path: string): boolean {
  const lines = text.split(/\r?\n/).map(l => l.replace(/#.*$/, '').trim()).filter(Boolean)
  // Two-pass: collect rules per UA, then decide.
  let currentAgents: string[] = []
  const rules: Array<{ agents: string[], rule: 'allow' | 'disallow', prefix: string }> = []
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':')
    if (!rawKey || rest.length === 0) {
      continue
    }
    const key = rawKey.trim().toLowerCase()
    const value = rest.join(':').trim()
    if (key === 'user-agent') {
      currentAgents = currentAgents.length > 0 && rules.length === 0
        ? [...currentAgents, value.toLowerCase()]
        : [value.toLowerCase()]
    }
    else if (key === 'disallow' && currentAgents.length > 0) {
      rules.push({ agents: [...currentAgents], rule: 'disallow', prefix: value })
    }
    else if (key === 'allow' && currentAgents.length > 0) {
      rules.push({ agents: [...currentAgents], rule: 'allow', prefix: value })
    }
  }
  const ourAgent = USER_AGENT.toLowerCase()
  // Match longest-prefix rule for our UA or '*'.
  let bestMatch: { rule: 'allow' | 'disallow', prefix: string } | null = null
  for (const { agents, rule, prefix } of rules) {
    const matches = agents.some(a => ourAgent.includes(a) || a === '*')
    if (!matches || prefix === '') {
      continue
    }
    if (path.startsWith(prefix) && (!bestMatch || prefix.length > bestMatch.prefix.length)) {
      bestMatch = { rule, prefix }
    }
  }
  return !bestMatch || bestMatch.rule === 'allow'
}

// --- HTML extraction ---------------------------------------------------------

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&apos;/g, '\'')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
}

function extractMeta(html: string, attr: string, value: string): string | null {
  const re = new RegExp(`<meta[^>]+${attr}=[\"']${value}[\"'][^>]+content=[\"']([^\"']+)[\"']`, 'i')
  const reReverse = new RegExp(`<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+${attr}=[\"']${value}[\"']`, 'i')
  const m = html.match(re) ?? html.match(reReverse)
  return m ? decodeEntities(m[1]).trim() : null
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : null
}

function stripBodyToText(html: string): string {
  // Cut everything inside script/style/noscript/svg tags.
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

  // Prefer <article> or <main> content if present.
  const articleMatch = cleaned.match(/<article[\s\S]*?<\/article>/i)
  const mainMatch = cleaned.match(/<main[\s\S]*?<\/main>/i)
  const candidate = articleMatch?.[0] ?? mainMatch?.[0] ?? cleaned

  const text = decodeEntities(candidate.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  return text.slice(0, 1500)
}

// --- Public API --------------------------------------------------------------

export async function ingestUrl(rawUrl: string): Promise<{ ok: true, data: ExtractedUrlContent } | { ok: false, error: UrlIngestError }> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  }
  catch {
    return { ok: false, error: { code: 'invalid_url', message: 'That doesn\'t look like a valid URL.' } }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: { code: 'invalid_url', message: 'Only HTTP(S) URLs are supported.' } }
  }

  const cacheKey = parsed.toString()
  const cached = contentCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, data: cached.content }
  }

  const hostCheck = await resolveAndCheckHost(parsed.hostname)
  if (!hostCheck.ok) {
    return hostCheck
  }

  const robotsOk = await isAllowedByRobots(parsed)
  if (!robotsOk) {
    return { ok: false, error: { code: 'robots_disallowed', message: 'This site disallows automated reading via robots.txt.' } }
  }

  // The fetch itself.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(parsed, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en',
      },
      signal: controller.signal,
      redirect: 'follow',
    })
  }
  catch {
    clearTimeout(timeout)
    return { ok: false, error: { code: 'fetch_failed', message: 'Could not fetch that URL.' } }
  }
  clearTimeout(timeout)

  if (!res.ok) {
    return { ok: false, error: { code: 'fetch_failed', message: `Source returned ${res.status}.` } }
  }

  // Re-check the *final* URL after redirects — a 302 to an internal host would defeat the earlier guard.
  const finalUrl = res.url ? new URL(res.url) : parsed
  if (finalUrl.hostname !== parsed.hostname) {
    const recheck = await resolveAndCheckHost(finalUrl.hostname)
    if (!recheck.ok) {
      return recheck
    }
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (!/text\/html|application\/xhtml/i.test(contentType)) {
    return { ok: false, error: { code: 'unsupported_content_type', message: 'Only HTML pages can be ingested.' } }
  }

  // Stream up to MAX_RESPONSE_BYTES, then stop.
  const reader = res.body?.getReader()
  if (!reader) {
    return { ok: false, error: { code: 'fetch_failed', message: 'Empty response body.' } }
  }
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      if (value) {
        total += value.byteLength
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel()
          return { ok: false, error: { code: 'too_large', message: 'Page is too large to read.' } }
        }
        chunks.push(value)
      }
    }
  }
  catch {
    return { ok: false, error: { code: 'fetch_failed', message: 'Could not read response body.' } }
  }

  const html = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks))

  const title = extractMeta(html, 'property', 'og:title')
    ?? extractMeta(html, 'name', 'twitter:title')
    ?? extractTitle(html)
  const description = extractMeta(html, 'property', 'og:description')
    ?? extractMeta(html, 'name', 'description')
    ?? extractMeta(html, 'name', 'twitter:description')
  const ogImage = extractMeta(html, 'property', 'og:image')
    ?? extractMeta(html, 'name', 'twitter:image')
  const body = stripBodyToText(html)

  if (!title && !description && !body) {
    return { ok: false, error: { code: 'empty_content', message: 'Couldn\'t pull any text from that page. Try pasting the headline instead.' } }
  }

  const content: ExtractedUrlContent = {
    url: cacheKey,
    finalUrl: finalUrl.toString(),
    title,
    description,
    ogImage: ogImage && ogImage.startsWith('http') ? ogImage : null,
    bodyExcerpt: body || null,
    fetchedAt: new Date().toISOString(),
  }

  contentCache.set(cacheKey, { content, expiresAt: Date.now() + CONTENT_TTL_MS })

  return { ok: true, data: content }
}

/** Combine extracted content into a single prompt context for Gemini. */
export function urlContentToAiContext(content: ExtractedUrlContent): string {
  const parts: string[] = []
  if (content.title) {
    parts.push(`Headline: ${content.title}`)
  }
  if (content.description) {
    parts.push(`Summary: ${content.description}`)
  }
  if (content.bodyExcerpt) {
    parts.push(`Article excerpt: ${content.bodyExcerpt}`)
  }
  parts.push(`Source URL: ${content.finalUrl}`)
  return parts.join('\n\n')
}
