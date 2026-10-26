'use server'

import { createPublicClient } from '@polymarket/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { PolymarketCurationFilters } from '@/lib/db/schema/polymarket/tables'
import type { CurationRule } from '@/lib/polymarket/curation'
import type { GammaEvent } from '@/lib/polymarket/gamma'

import {
  deletePolymarketCurationRule,
  listPolymarketCurationRules,
  upsertPolymarketCurationRule,
} from '@/lib/db/queries/polymarket-curation'
import { UserRepository } from '@/lib/db/queries/user'
import { buildCurationIndex, decideEvent } from '@/lib/polymarket/curation'
import {
  getGammaTagById,
  getGammaTagBySlug,
  listGammaEvents,
  listGammaSports,
  searchGammaEvents,
  toGammaNumber,
} from '@/lib/polymarket/gamma'
import { runPolymarketSync } from '@/lib/polymarket/sync'
import { getPolymarketBuilderCode } from '@/lib/polymarket/trading-access'

const ADMIN_PATH = '/[locale]/admin/polymarket'

const FiltersSchema = z
  .object({
    maxEvents: z.number().int().min(1).max(100).optional(),
    minVolume: z.number().min(0).optional(),
    minLiquidity: z.number().min(0).optional(),
    windowDays: z.number().int().min(1).max(3650).optional(),
    marketTypes: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  })
  .strict()

const RuleSchema = z.object({
  scope: z.enum(['tag', 'event', 'market']),
  ref: z.string().trim().min(1).max(200),
  label: z.string().trim().max(200).optional(),
  parentRef: z.string().trim().max(200).nullable().optional(),
  mode: z.enum(['include', 'exclude']).optional(),
  pinned: z.boolean().optional(),
  filters: FiltersSchema.optional(),
  sortOrder: z.number().int().optional(),
})

export type CurationRuleInput = z.infer<typeof RuleSchema>

async function requireAdmin() {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user?.is_admin) {
    throw new Error('Unauthorized. Admin access required.')
  }
  return user
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export async function listCurationRulesAction() {
  try {
    await requireAdmin()
    return { success: true as const, rules: await listPolymarketCurationRules() }
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error) }
  }
}

export async function saveCurationRuleAction(input: CurationRuleInput) {
  try {
    const admin = await requireAdmin()
    const parsed = RuleSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid rule.' }
    }
    const rule = await upsertPolymarketCurationRule({
      ...parsed.data,
      filters: parsed.data.filters as PolymarketCurationFilters | undefined,
      updatedBy: admin.id,
    })
    revalidatePath(ADMIN_PATH, 'page')
    return { success: true as const, rule }
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error) }
  }
}

export async function deleteCurationRuleAction(scope: 'tag' | 'event' | 'market', ref: string) {
  try {
    await requireAdmin()
    await deletePolymarketCurationRule(scope, ref)
    revalidatePath(ADMIN_PATH, 'page')
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error) }
  }
}

/** Adds a category or league by Gamma tag slug or tag id, checking it exists on Polymarket. */
export async function addTagRuleAction(input: { slug?: string; tagId?: number; parentRef?: string | null }) {
  try {
    const admin = await requireAdmin()
    const tag = input.tagId
      ? await getGammaTagById(input.tagId)
      : input.slug
        ? await getGammaTagBySlug(input.slug.trim().toLowerCase())
        : null
    if (!tag) {
      return { success: false as const, error: 'That category was not found on Polymarket.' }
    }
    const rule = await upsertPolymarketCurationRule({
      scope: 'tag',
      ref: tag.slug,
      label: tag.label,
      parentRef: input.parentRef ?? null,
      filters: { maxEvents: 30 },
      updatedBy: admin.id,
    })
    revalidatePath(ADMIN_PATH, 'page')
    return { success: true as const, rule }
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error) }
  }
}

export interface PolymarketLeagueOption {
  sport: string
  name: string
  image: string | null
  primaryTagId: number | null
}

export async function listLeaguesAction() {
  try {
    await requireAdmin()
    const sports = await listGammaSports()
    const leagues: PolymarketLeagueOption[] = sports
      .filter((entry) => entry.primaryTagId)
      .map((entry) => ({
        sport: entry.sport,
        name: entry.name?.trim() || entry.sport.toUpperCase(),
        image: entry.image ?? null,
        primaryTagId: entry.primaryTagId ?? null,
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
    return { success: true as const, leagues }
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error) }
  }
}

export interface BrowsedMarket {
  conditionId: string
  title: string
  marketType: string | null
  volume: number
  shown: boolean
}

export interface BrowsedEvent {
  id: string
  slug: string
  title: string
  icon: string | null
  endDate: string | null
  volume: number
  volume24hr: number
  tags: string[]
  shown: boolean
  pinned: boolean
  reason: string
  markets: BrowsedMarket[]
}

function toBrowsedEvent(event: GammaEvent, rules: CurationRule[]): BrowsedEvent {
  const decision = decideEvent(event, buildCurationIndex(rules))
  const shownIds = new Set(decision.markets.map((market) => market.conditionId))
  return {
    id: String(event.id),
    slug: event.slug,
    title: event.title,
    icon: event.icon ?? event.image ?? null,
    endDate: event.endDate ?? null,
    volume: toGammaNumber(event.volume),
    volume24hr: toGammaNumber(event.volume24hr),
    tags: (event.tags ?? []).map((tag) => tag.label),
    shown: decision.visible,
    pinned: decision.pinned,
    reason: decision.reason,
    markets: (event.markets ?? [])
      .filter((market) => !market.archived && !market.closed)
      .map((market) => ({
        conditionId: market.conditionId,
        title: market.groupItemTitle?.trim() || market.question,
        marketType: market.sportsMarketType ?? null,
        volume: toGammaNumber(market.volume),
        shown: shownIds.has(market.conditionId),
      })),
  }
}

/** Live Polymarket listing for the admin, annotated with what the current rules show. */
export async function browsePolymarketAction(input: { query?: string; tagSlug?: string }) {
  try {
    await requireAdmin()
    const rows = await listPolymarketCurationRules()
    const rules: CurationRule[] = rows.map((row) => ({
      scope: row.scope,
      ref: row.ref,
      mode: row.mode,
      pinned: row.pinned,
      parent_ref: row.parent_ref,
      filters: row.filters ?? {},
    }))
    const query = input.query?.trim()
    const events = query
      ? await searchGammaEvents(query, 25)
      : await listGammaEvents({
          tagSlug: input.tagSlug?.trim() || undefined,
          active: true,
          closed: false,
          order: 'volume24hr',
          ascending: false,
          limit: 40,
          endDateMin: new Date().toISOString(),
        })
    return { success: true as const, events: events.map((event) => toBrowsedEvent(event, rules)) }
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error) }
  }
}

export async function runPolymarketSyncAction() {
  try {
    await requireAdmin()
    const summary = await runPolymarketSync({ deadlineMs: Date.now() + 50_000 })
    return { success: true as const, summary }
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error) }
  }
}

export interface BuilderTradeRow {
  id: string
  side: string
  outcome: string
  sizeUsd: number
  feeUsd: number
  price: number
  status: string
  matchedAt: string | null
}

/** Trades Polymarket has attributed to Prophit's builder code (newest page). */
export async function fetchBuilderActivityAction() {
  try {
    await requireAdmin()
    const builderCode = getPolymarketBuilderCode()
    if (!builderCode) {
      return { success: false as const, error: 'POLYMARKET_BUILDER_CODE is not set.' }
    }
    const page = await createPublicClient().listBuilderTrades({ builderCode }).firstPage()
    const trades: BuilderTradeRow[] = page.items.map((trade: Record<string, any>) => ({
      id: String(trade.id ?? ''),
      side: String(trade.side ?? ''),
      outcome: String(trade.outcome ?? ''),
      sizeUsd: Number(trade.sizeUsdc ?? 0),
      feeUsd: Number(trade.feeUsdc ?? 0),
      price: Number(trade.price ?? 0),
      status: String(trade.status ?? ''),
      matchedAt: trade.matchTime ? String(trade.matchTime) : trade.createdAt ? String(trade.createdAt) : null,
    }))
    return {
      success: true as const,
      builderCode,
      trades,
      totalVolumeUsd: trades.reduce((sum, trade) => sum + trade.sizeUsd, 0),
      totalFeesUsd: trades.reduce((sum, trade) => sum + trade.feeUsd, 0),
    }
  } catch (error) {
    return { success: false as const, error: toErrorMessage(error) }
  }
}
