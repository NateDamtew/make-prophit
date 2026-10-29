/**
 * Pure checks for the suggestion pool: whether a drafted market is dated,
 * names a public source, and closes before the thing it measures, plus a
 * confidence score from those checks. No database imports.
 */

export interface SuggestionChecks {
  dated: boolean
  publicSource: boolean
  closesBeforeEvent: boolean
}

export interface SuggestionAssessment {
  checks: SuggestionChecks
  /** 0–1: how ready the draft is to open as written. */
  confidence: number
}

const PRIVATE_HOSTS = /^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0)/i
const SOCIAL_HOSTS = /(^|\.)(facebook|instagram|tiktok|x|twitter|t)\.(com|me)$/i

/** A source people can open: an http(s) URL on a public, non-social host. */
export function isPublicSourceUrl(value: string | null | undefined): boolean {
  if (!value) {
    return false
  }
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return false
  }
  if (PRIVATE_HOSTS.test(url.hostname) || !url.hostname.includes('.')) {
    return false
  }
  return !SOCIAL_HOSTS.test(url.hostname)
}

/** A title or rule that names a day, month or year, so the market has a date in it. */
export function mentionsADate(text: string | null | undefined): boolean {
  if (!text) {
    return false
  }
  const value = text.toLowerCase()
  return (
    /\b(20\d\d)\b/.test(value) ||
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b\.?\s*\d{0,2}/.test(value) ||
    /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*/.test(value) ||
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|this weekend|next week)\b/.test(value)
  )
}

export function assessSuggestion(input: {
  title: string
  resolutionRules: string | null | undefined
  resolutionSource: string | null | undefined
  sourceUrl: string | null | undefined
  closesAt: Date | null
  eventAt: Date | null
  now?: Date
}): SuggestionAssessment {
  const now = input.now ?? new Date()
  const dated = input.closesAt !== null || mentionsADate(input.title) || mentionsADate(input.resolutionRules)
  const publicSource = isPublicSourceUrl(input.sourceUrl) || isPublicSourceUrl(input.resolutionSource)
  const closesBeforeEvent =
    input.closesAt !== null &&
    input.closesAt.getTime() > now.getTime() &&
    (input.eventAt === null || input.closesAt.getTime() <= input.eventAt.getTime())
  const passed = [dated, publicSource, closesBeforeEvent].filter(Boolean).length
  const rules = (input.resolutionRules ?? '').trim().length
  const rulesScore = rules >= 80 ? 0.25 : rules >= 40 ? 0.15 : 0
  const confidence = Math.round(Math.min(1, (passed / 3) * 0.75 + rulesScore) * 100) / 100
  return { checks: { dated, publicSource, closesBeforeEvent }, confidence }
}
