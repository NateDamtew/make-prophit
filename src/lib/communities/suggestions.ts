import { and, desc, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'

import type { MarketSuggestionRow, SuggestionStatus } from '@/lib/db/schema/communities/suggestions'

import { analyzeMarketQuestion } from '@/lib/ai/gemini'
import { assessSuggestion } from '@/lib/communities/suggestion-rules'
import { ingestUrl, urlContentToAiContext } from '@/lib/communities/url-ingest'
import { CommunityRepository } from '@/lib/db/queries/community'
import { market_suggestion_targets, market_suggestions } from '@/lib/db/schema/communities/suggestions'
import { communities } from '@/lib/db/schema/communities/tables'
import { db } from '@/lib/drizzle'

/**
 * The suggestion pool: Prophit drafts markets (from a link or a question
 * through the AI drafter, or by hand), checks and approves them, and offers
 * them to communities. An owner adds one as drafted or edits it first, and
 * it becomes an ordinary market that goes through the usual review.
 */

const EXPIRES_DAYS = 7

export class SuggestionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not_found'
      | 'not_available'
      | 'invalid'
      | 'ai_unavailable'
      | 'ingest_failed'
      | 'already_added',
  ) {
    super(message)
    this.name = 'SuggestionError'
  }
}

export interface SuggestionDraftInput {
  title: string
  description?: string | null
  marketMode?: 'binary' | 'list'
  outcomes?: string[]
  resolutionRules?: string | null
  resolutionSource?: string | null
  sourceUrl?: string | null
  sourceName?: string | null
  sourcePublishedAt?: Date | null
  closesAt?: Date | null
  eventAt?: Date | null
  mainCategorySlug?: string | null
  categorySlugs?: string[]
}

function assess(input: SuggestionDraftInput, now: Date) {
  return assessSuggestion({
    title: input.title,
    resolutionRules: input.resolutionRules,
    resolutionSource: input.resolutionSource,
    sourceUrl: input.sourceUrl,
    closesAt: input.closesAt ?? null,
    eventAt: input.eventAt ?? null,
    now,
  })
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Draft a suggestion from a public page: scrape it, then let the drafter write the market. */
export async function createSuggestionFromUrl(params: { url: string; adminId: string; now?: Date }) {
  const now = params.now ?? new Date()
  const ingested = await ingestUrl(params.url)
  if (!ingested.ok) {
    throw new SuggestionError(ingested.error.message, 'ingest_failed')
  }
  const question = ingested.data.title ?? params.url
  let drafted
  try {
    drafted = await analyzeMarketQuestion({
      question: `Turn this story into one prediction market question: ${question}`,
      context: urlContentToAiContext(ingested.data),
    })
  } catch (error) {
    throw new SuggestionError(
      error instanceof Error && /api key/i.test(error.message)
        ? 'The AI drafter is not configured on this deployment.'
        : 'The AI drafter could not read that page. Write the suggestion by hand.',
      'ai_unavailable',
    )
  }
  const sourceName = (() => {
    try {
      return new URL(ingested.data.finalUrl).hostname.replace(/^www\./, '')
    } catch {
      return null
    }
  })()
  return createSuggestion(
    {
      title: drafted.refined_title || question,
      description: ingested.data.description,
      resolutionRules: drafted.resolution_rules,
      resolutionSource: drafted.resolution_source || ingested.data.finalUrl,
      sourceUrl: ingested.data.finalUrl,
      sourceName,
      sourcePublishedAt: null,
      closesAt: parseDate(drafted.suggested_resolution_date),
      eventAt: null,
    },
    { adminId: params.adminId, origin: 'ai', now },
  )
}

/** Draft a suggestion from a question alone. */
export async function createSuggestionFromQuestion(params: { question: string; adminId: string; now?: Date }) {
  const now = params.now ?? new Date()
  let drafted
  try {
    drafted = await analyzeMarketQuestion({ question: params.question })
  } catch (error) {
    throw new SuggestionError(
      error instanceof Error && /api key/i.test(error.message)
        ? 'The AI drafter is not configured on this deployment.'
        : 'The AI drafter could not draft that. Write the suggestion by hand.',
      'ai_unavailable',
    )
  }
  return createSuggestion(
    {
      title: drafted.refined_title || params.question,
      resolutionRules: drafted.resolution_rules,
      resolutionSource: drafted.resolution_source,
      closesAt: parseDate(drafted.suggested_resolution_date),
    },
    { adminId: params.adminId, origin: 'ai', now },
  )
}

/** Insert a pending suggestion as drafted (by hand or by the drafter). */
export async function createSuggestion(
  input: SuggestionDraftInput,
  options: { adminId: string; origin: 'ai' | 'admin'; now?: Date },
): Promise<MarketSuggestionRow> {
  const now = options.now ?? new Date()
  const title = input.title.trim()
  if (title.length < 10) {
    throw new SuggestionError('The question needs at least 10 characters.', 'invalid')
  }
  const assessment = assess(input, now)
  const [row] = await db
    .insert(market_suggestions)
    .values({
      title,
      description: input.description?.trim() || null,
      market_mode: input.marketMode ?? 'binary',
      outcomes: input.marketMode === 'list' ? (input.outcomes ?? []).map((item) => item.trim()).filter(Boolean) : [],
      resolution_rules: input.resolutionRules?.trim() || null,
      resolution_source: input.resolutionSource?.trim() || null,
      source_url: input.sourceUrl?.trim() || null,
      source_name: input.sourceName?.trim() || null,
      source_published_at: input.sourcePublishedAt ?? null,
      closes_at: input.closesAt ?? null,
      event_at: input.eventAt ?? null,
      main_category_slug: input.mainCategorySlug?.trim() || null,
      category_slugs: input.categorySlugs ?? [],
      checks: assessment.checks,
      confidence: assessment.confidence.toFixed(2),
      status: 'pending',
      origin: options.origin,
      expires_at: new Date(now.getTime() + EXPIRES_DAYS * 86_400_000),
      created_by: options.adminId,
      created_at: now,
      updated_at: now,
    })
    .returning()
  return row!
}

export interface AdminSuggestion extends MarketSuggestionRow {
  addedBy: number
  targets: Array<{ communityId: string; name: string; slug: string; status: string }>
}

/** The pool for the admin desk, by status. */
export async function listSuggestionsForAdmin(status: SuggestionStatus | 'all'): Promise<AdminSuggestion[]> {
  const rows = await db
    .select()
    .from(market_suggestions)
    .where(status === 'all' ? undefined : eq(market_suggestions.status, status))
    .orderBy(desc(market_suggestions.created_at))
    .limit(200)
  if (rows.length === 0) {
    return []
  }
  const targets = await db
    .select({
      suggestion_id: market_suggestion_targets.suggestion_id,
      community_id: market_suggestion_targets.community_id,
      status: market_suggestion_targets.status,
      name: communities.name,
      slug: communities.slug,
    })
    .from(market_suggestion_targets)
    .innerJoin(communities, eq(communities.id, market_suggestion_targets.community_id))
    .where(
      inArray(
        market_suggestion_targets.suggestion_id,
        rows.map((row) => row.id),
      ),
    )
  return rows.map((row) => {
    const own = targets.filter((target) => target.suggestion_id === row.id)
    return {
      ...row,
      addedBy: own.filter((target) => target.status === 'added').length,
      targets: own.map((target) => ({
        communityId: target.community_id,
        name: target.name,
        slug: target.slug,
        status: target.status,
      })),
    }
  })
}

/**
 * Approve (with edits and the communities it is offered to) or reject a
 * suggestion. Approving re-runs the checks on the final wording.
 */
export async function reviewSuggestion(params: {
  id: string
  adminId: string
  action: 'approve' | 'reject'
  edits?: SuggestionDraftInput
  targetCommunityIds?: string[]
  note?: string | null
  now?: Date
}): Promise<MarketSuggestionRow> {
  const now = params.now ?? new Date()
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(market_suggestions)
      .where(eq(market_suggestions.id, params.id))
      .for('update')
      .limit(1)
    if (!current) {
      throw new SuggestionError('Suggestion not found.', 'not_found')
    }
    const merged: SuggestionDraftInput = {
      title: params.edits?.title ?? current.title,
      description: params.edits?.description ?? current.description,
      marketMode: params.edits?.marketMode ?? current.market_mode,
      outcomes: params.edits?.outcomes ?? current.outcomes,
      resolutionRules: params.edits?.resolutionRules ?? current.resolution_rules,
      resolutionSource: params.edits?.resolutionSource ?? current.resolution_source,
      sourceUrl: params.edits?.sourceUrl ?? current.source_url,
      sourceName: params.edits?.sourceName ?? current.source_name,
      closesAt: params.edits?.closesAt === undefined ? current.closes_at : params.edits.closesAt,
      eventAt: params.edits?.eventAt === undefined ? current.event_at : params.edits.eventAt,
      mainCategorySlug: params.edits?.mainCategorySlug ?? current.main_category_slug,
      categorySlugs: params.edits?.categorySlugs ?? current.category_slugs,
    }
    if (merged.title.trim().length < 10) {
      throw new SuggestionError('The question needs at least 10 characters.', 'invalid')
    }
    const assessment = assess(merged, now)
    const [updated] = await tx
      .update(market_suggestions)
      .set({
        title: merged.title.trim(),
        description: merged.description?.trim() || null,
        market_mode: merged.marketMode ?? 'binary',
        outcomes:
          merged.marketMode === 'list' ? (merged.outcomes ?? []).map((item) => item.trim()).filter(Boolean) : [],
        resolution_rules: merged.resolutionRules?.trim() || null,
        resolution_source: merged.resolutionSource?.trim() || null,
        source_url: merged.sourceUrl?.trim() || null,
        source_name: merged.sourceName?.trim() || null,
        closes_at: merged.closesAt ?? null,
        event_at: merged.eventAt ?? null,
        main_category_slug: merged.mainCategorySlug?.trim() || null,
        category_slugs: merged.categorySlugs ?? [],
        checks: assessment.checks,
        confidence: assessment.confidence.toFixed(2),
        status: params.action === 'approve' ? 'approved' : 'rejected',
        expires_at:
          params.action === 'approve'
            ? current.expires_at && current.expires_at.getTime() > now.getTime()
              ? current.expires_at
              : new Date(now.getTime() + EXPIRES_DAYS * 86_400_000)
            : current.expires_at,
        reviewed_by: params.adminId,
        reviewed_at: now,
        review_note: params.note?.trim() || null,
        updated_at: now,
      })
      .where(eq(market_suggestions.id, params.id))
      .returning()
    if (params.action === 'approve' && params.targetCommunityIds && params.targetCommunityIds.length > 0) {
      await tx
        .insert(market_suggestion_targets)
        .values(
          Array.from(new Set(params.targetCommunityIds)).map((communityId) => ({
            suggestion_id: params.id,
            community_id: communityId,
            created_at: now,
            updated_at: now,
          })),
        )
        .onConflictDoNothing()
    }
    return updated!
  })
}

/** Approved suggestions past their date stop being offered. */
export async function expireSuggestions(now = new Date()): Promise<number> {
  const rows = await db
    .update(market_suggestions)
    .set({ status: 'expired', updated_at: now })
    .where(
      and(
        inArray(market_suggestions.status, ['pending', 'approved']),
        or(lte(market_suggestions.expires_at, now), lte(market_suggestions.closes_at, now)),
      ),
    )
    .returning({ id: market_suggestions.id })
  return rows.length
}

export interface CommunitySuggestion {
  id: string
  title: string
  description: string | null
  marketMode: 'binary' | 'list'
  outcomes: string[]
  resolutionRules: string | null
  resolutionSource: string | null
  sourceUrl: string | null
  sourceName: string | null
  sourcePublishedAt: string | null
  closesAt: string | null
  eventAt: string | null
  mainCategorySlug: string | null
  categorySlugs: string[]
  expiresAt: string | null
  /** Offered to this community in particular, rather than to everyone. */
  matched: boolean
}

function toCommunitySuggestion(row: MarketSuggestionRow, matched: boolean): CommunitySuggestion {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    marketMode: row.market_mode,
    outcomes: row.outcomes,
    resolutionRules: row.resolution_rules,
    resolutionSource: row.resolution_source,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
    sourcePublishedAt: row.source_published_at?.toISOString() ?? null,
    closesAt: row.closes_at?.toISOString() ?? null,
    eventAt: row.event_at?.toISOString() ?? null,
    mainCategorySlug: row.main_category_slug,
    categorySlugs: row.category_slugs,
    expiresAt: row.expires_at?.toISOString() ?? null,
    matched,
  }
}

/**
 * What an owner sees: approved suggestions offered to this community
 * ("matched"), then every approved one nobody was singled out for
 * ("trending"), minus the ones this community already added or dismissed.
 */
export async function listSuggestionsForCommunity(
  communityId: string,
  now = new Date(),
): Promise<{ matched: CommunitySuggestion[]; trending: CommunitySuggestion[] }> {
  const rows = await db
    .select({
      suggestion: market_suggestions,
      targetStatus: market_suggestion_targets.status,
      targeted: sql<boolean>`EXISTS (SELECT 1 FROM ${market_suggestion_targets} t WHERE t.suggestion_id = ${market_suggestions.id})`,
    })
    .from(market_suggestions)
    .leftJoin(
      market_suggestion_targets,
      and(
        eq(market_suggestion_targets.suggestion_id, market_suggestions.id),
        eq(market_suggestion_targets.community_id, communityId),
      ),
    )
    .where(
      and(
        eq(market_suggestions.status, 'approved'),
        or(isNull(market_suggestions.expires_at), sql`${market_suggestions.expires_at} > ${now}`),
        or(isNull(market_suggestions.closes_at), sql`${market_suggestions.closes_at} > ${now}`),
        or(isNull(market_suggestion_targets.status), ne(market_suggestion_targets.status, 'added')),
        or(isNull(market_suggestion_targets.status), ne(market_suggestion_targets.status, 'dismissed')),
      ),
    )
    .orderBy(desc(market_suggestions.confidence), desc(market_suggestions.created_at))
    .limit(60)
  const matched: CommunitySuggestion[] = []
  const trending: CommunitySuggestion[] = []
  for (const row of rows) {
    if (row.targetStatus === 'suggested') {
      matched.push(toCommunitySuggestion(row.suggestion, true))
    } else if (!row.targeted) {
      trending.push(toCommunitySuggestion(row.suggestion, false))
    }
  }
  return { matched, trending }
}

/**
 * Add a suggestion to a community as a market: a draft from the (edited)
 * suggestion, submitted for the usual review. The target is marked added.
 */
export async function addSuggestionToCommunity(params: {
  suggestionId: string
  communityId: string
  communitySlug: string
  userId: string
  edits?: {
    title?: string
    resolutionRules?: string
    resolutionSource?: string | null
    closesAt?: Date | null
    mainCategorySlug?: string | null
    categorySlugs?: string[]
  }
  now?: Date
}): Promise<{ marketId: string; reviewStatus: string | null }> {
  const now = params.now ?? new Date()
  const [suggestion] = await db
    .select()
    .from(market_suggestions)
    .where(eq(market_suggestions.id, params.suggestionId))
    .limit(1)
  if (!suggestion) {
    throw new SuggestionError('Suggestion not found.', 'not_found')
  }
  if (suggestion.status !== 'approved' || (suggestion.expires_at && suggestion.expires_at.getTime() <= now.getTime())) {
    throw new SuggestionError('This suggestion is no longer available.', 'not_available')
  }
  const [existing] = await db
    .select({ status: market_suggestion_targets.status, marketId: market_suggestion_targets.community_market_id })
    .from(market_suggestion_targets)
    .where(
      and(
        eq(market_suggestion_targets.suggestion_id, params.suggestionId),
        eq(market_suggestion_targets.community_id, params.communityId),
      ),
    )
    .limit(1)
  if (existing?.status === 'added' && existing.marketId) {
    throw new SuggestionError('This suggestion is already a market in your community.', 'already_added')
  }
  const title = (params.edits?.title ?? suggestion.title).trim()
  const rules = (params.edits?.resolutionRules ?? suggestion.resolution_rules ?? '').trim()
  if (title.length < 10 || rules.length < 20) {
    throw new SuggestionError(
      'A question of at least 10 characters and resolution rules of at least 20 are needed.',
      'invalid',
    )
  }
  const closesAt = params.edits?.closesAt === undefined ? suggestion.closes_at : params.edits.closesAt
  if (!closesAt) {
    throw new SuggestionError('Pick when the market closes.', 'invalid')
  }
  const mainCategory = params.edits?.mainCategorySlug ?? suggestion.main_category_slug ?? null
  const categorySlugs = params.edits?.categorySlugs ?? suggestion.category_slugs
  const options =
    suggestion.market_mode === 'list'
      ? suggestion.outcomes.map((outcome, index) => {
          const slug = outcome
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
          return {
            id: `o${index + 1}`,
            question: outcome,
            title: outcome,
            shortName: outcome,
            slug: slug || `o${index + 1}`,
          }
        })
      : undefined
  const created = await CommunityRepository.addMarket({
    community_id: params.communityId,
    title,
    description: suggestion.description ?? undefined,
    resolution_source: (params.edits?.resolutionSource ?? suggestion.resolution_source) || undefined,
    resolution_rules: rules,
    resolution_date: closesAt,
    market_mode: suggestion.market_mode === 'list' ? 'multi_unique' : 'binary',
    options,
    main_category_slug: mainCategory ?? undefined,
    category_slugs: categorySlugs,
    created_by: params.userId,
    status: 'draft',
  })
  if (created.error || !created.data) {
    throw new SuggestionError(created.error ?? 'Could not create the market.', 'invalid')
  }
  const marketId = created.data.id
  let reviewStatus: string | null = null
  if (mainCategory && categorySlugs.length > 0) {
    const submitted = await CommunityRepository.submitForReview({
      marketId,
      mainCategorySlug: mainCategory,
      categorySlugs,
    })
    reviewStatus = submitted.data ? (submitted.data.review_status ?? 'pending') : null
  }
  await db
    .insert(market_suggestion_targets)
    .values({
      suggestion_id: params.suggestionId,
      community_id: params.communityId,
      status: 'added',
      community_market_id: marketId,
      added_by: params.userId,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [market_suggestion_targets.suggestion_id, market_suggestion_targets.community_id],
      set: { status: 'added', community_market_id: marketId, added_by: params.userId, updated_at: now },
    })
  return { marketId, reviewStatus }
}

/** Hide a suggestion from this community's list. */
export async function dismissSuggestionForCommunity(params: { suggestionId: string; communityId: string; now?: Date }) {
  const now = params.now ?? new Date()
  await db
    .insert(market_suggestion_targets)
    .values({
      suggestion_id: params.suggestionId,
      community_id: params.communityId,
      status: 'dismissed',
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [market_suggestion_targets.suggestion_id, market_suggestion_targets.community_id],
      set: { status: 'dismissed', updated_at: now },
    })
}
