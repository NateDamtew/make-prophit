import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { consumeRateLimit } from '@/lib/communities/rate-limit'
import { ingestUrl, urlContentToAiContext } from '@/lib/communities/url-ingest'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'
import { analyzeMarketQuestion } from '@/lib/ai/gemini'

/**
 * POST /api/communities/markets/ingest-url
 *
 * Takes a public URL, scrapes the page (SSRF-safe), then runs the existing
 * Gemini market analyser with the scraped content as context. Returns both
 * the extracted source data (for previewing inside the canvas) and the AI
 * suggestion (refined title, source, rules, date, warnings).
 *
 * Gated to community admins to keep paid Gemini calls scoped to a known
 * audience. Rate-limited per user.
 */

const requestSchema = z.object({
  community_id: z.string().length(26),
  url: z.string().trim().min(8).max(2048),
})

const INGEST_LIMIT = { windowMs: 60_000, max: 10 } // 10 per minute per admin

export async function POST(request: NextRequest) {
  const viewer = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!viewer) {
    return NextResponse.json({ error: 'Sign in to use this feature.' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  }
  catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }

  const { data: role } = await CommunityRepository.getMemberRole(parsed.data.community_id, viewer.id)
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Only community admins can draft markets.' }, { status: 403 })
  }

  const rl = consumeRateLimit(`url-ingest:${viewer.id}`, INGEST_LIMIT)
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Slow down — try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const scraped = await ingestUrl(parsed.data.url)
  if (!scraped.ok) {
    return NextResponse.json({ error: scraped.error.message, code: scraped.error.code }, { status: 422 })
  }

  // We need *something* the AI can build a market on. Title is the minimum.
  if (!scraped.data.title) {
    return NextResponse.json(
      { data: { source: scraped.data, suggestion: null }, warning: 'Could not extract a headline. You can still write the market manually.' },
    )
  }

  try {
    const suggestion = await analyzeMarketQuestion({
      question: scraped.data.title,
      context: urlContentToAiContext(scraped.data),
    })
    return NextResponse.json({ data: { source: scraped.data, suggestion } })
  }
  catch (error) {
    console.error('Gemini analysis failed during URL ingest', error)
    // Hard-fail the AI call, but still return the scraped source so the
    // canvas can populate manual fields.
    return NextResponse.json({
      data: { source: scraped.data, suggestion: null },
      warning: 'Couldn\'t reach the AI assistant. Source extracted; please draft manually.',
    })
  }
}
