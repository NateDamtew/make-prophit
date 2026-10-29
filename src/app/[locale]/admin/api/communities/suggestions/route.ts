import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import {
  createSuggestion,
  createSuggestionFromQuestion,
  createSuggestionFromUrl,
  listSuggestionsForAdmin,
  SuggestionError,
} from '@/lib/communities/suggestions'
import { SUGGESTION_STATUSES } from '@/lib/db/schema/communities/suggestions'

/** The suggestion pool for the admin desk, by status (`?status=pending|approved|rejected|expired|all`). */
export async function GET(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const status = new URL(request.url).searchParams.get('status') ?? 'pending'
  if (status !== 'all' && !(SUGGESTION_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Unknown status.' }, { status: 400 })
  }
  try {
    const data = await listSuggestionsForAdmin(status as (typeof SUGGESTION_STATUSES)[number] | 'all')
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Admin suggestions list error', error)
    return NextResponse.json({ error: 'Failed to load suggestions.' }, { status: 500 })
  }
}

const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Invalid date')
  .transform((value) => new Date(value))

const createSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('url'), url: z.string().trim().url() }),
  z.object({ source: z.literal('question'), question: z.string().trim().min(10).max(300) }),
  z.object({
    source: z.literal('manual'),
    title: z.string().trim().min(10).max(300),
    description: z.string().trim().max(2_000).optional().nullable(),
    marketMode: z.enum(['binary', 'list']).optional(),
    outcomes: z.array(z.string().trim().min(1).max(80)).max(5).optional(),
    resolutionRules: z.string().trim().max(4_000).optional().nullable(),
    resolutionSource: z.string().trim().max(500).optional().nullable(),
    sourceUrl: z.string().trim().url().optional().nullable(),
    closesAt: isoDate.optional().nullable(),
    eventAt: isoDate.optional().nullable(),
    mainCategorySlug: z.string().trim().max(100).optional().nullable(),
    categorySlugs: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  }),
])

/** Draft a new suggestion: from a link, from a question, or written by hand. */
export async function POST(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }
  try {
    const input = parsed.data
    const suggestion =
      input.source === 'url'
        ? await createSuggestionFromUrl({ url: input.url, adminId: actor.id })
        : input.source === 'question'
          ? await createSuggestionFromQuestion({ question: input.question, adminId: actor.id })
          : await createSuggestion(
              {
                title: input.title,
                description: input.description,
                marketMode: input.marketMode,
                outcomes: input.outcomes,
                resolutionRules: input.resolutionRules,
                resolutionSource: input.resolutionSource,
                sourceUrl: input.sourceUrl,
                closesAt: input.closesAt,
                eventAt: input.eventAt,
                mainCategorySlug: input.mainCategorySlug,
                categorySlugs: input.categorySlugs,
              },
              { adminId: actor.id, origin: 'admin' },
            )
    await recordAuditEvent({
      actor,
      action: 'community.suggestion_drafted',
      targetType: 'market_suggestion',
      targetId: suggestion.id,
      summary: `Drafted "${suggestion.title}" (${suggestion.origin})`,
    })
    return NextResponse.json({ data: suggestion })
  } catch (error) {
    if (error instanceof SuggestionError) {
      return NextResponse.json({ error: error.message }, { status: error.code === 'invalid' ? 400 : 422 })
    }
    console.error('Admin suggestion create error', error)
    return NextResponse.json({ error: 'Could not draft the suggestion.' }, { status: 500 })
  }
}
