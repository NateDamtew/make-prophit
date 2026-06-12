/**
 * Simple in-memory token-bucket rate limiter for comment/reaction posting.
 *
 * In-memory is good enough for v1 because: (a) Vercel serverless functions
 * reuse instances long enough to enforce most abuse cases, (b) the eventual
 * upgrade to Vercel KV / Redis is API-compatible. When that day comes, swap
 * the implementation behind `consume()` without touching callers.
 *
 * Buckets are keyed by `${scope}:${subject}` so the same user can have
 * independent limits for different actions (comments vs reactions).
 */

interface Bucket {
  tokens: number
  refillAt: number
}

const BUCKETS = new Map<string, Bucket>()

export interface RateLimitConfig {
  /** Window in milliseconds. */
  windowMs: number
  /** Max actions per window. */
  max: number
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  /** Seconds until the bucket refills if ok=false. */
  retryAfter: number
}

/**
 * Attempt to consume one token from the bucket for `key`. Returns ok=false
 * when the limit is exhausted.
 */
export function consumeRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const existing = BUCKETS.get(key)

  if (!existing || existing.refillAt <= now) {
    BUCKETS.set(key, { tokens: config.max - 1, refillAt: now + config.windowMs })
    return { ok: true, remaining: config.max - 1, retryAfter: 0 }
  }

  if (existing.tokens > 0) {
    existing.tokens -= 1
    return { ok: true, remaining: existing.tokens, retryAfter: 0 }
  }

  return {
    ok: false,
    remaining: 0,
    retryAfter: Math.ceil((existing.refillAt - now) / 1000),
  }
}

// Tuned limits per action. Generous enough for normal use, strict enough to
// stop a single client from spamming the API.
export const RATE_LIMITS = {
  comments: { windowMs: 60_000, max: 5 }, // 5 comments per minute per user
  reactions: { windowMs: 60_000, max: 30 }, // 30 reaction toggles per minute per user
} as const satisfies Record<string, RateLimitConfig>
