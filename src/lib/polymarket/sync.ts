import { and, eq, inArray, isNotNull, ne, notInArray, sql } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import type { CurationDecision, CurationRule } from '@/lib/polymarket/curation'
import type { GammaEvent } from '@/lib/polymarket/gamma'

import { ingestMarketsWithMetadata } from '@/app/api/sync/events/route'
import { SUPPORTED_LOCALES } from '@/i18n/locales'
import { cacheTags } from '@/lib/cache-tags'
import { listPolymarketCurationRules } from '@/lib/db/queries/polymarket-curation'
import { conditions, events, home_featured_events, markets } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { buildCurationIndex, decideEvent } from '@/lib/polymarket/curation'
import { getGammaEventsByIds, listGammaEvents, toGammaNumber } from '@/lib/polymarket/gamma'
import { buildExternalMarketEntries, collectSettledMarkets } from '@/lib/polymarket/metadata-adapter'
import { updateOutcomePayoutsFromResolutionPrice } from '@/lib/resolution-payout-sync'

/**
 * Polymarket import: reads the admin's curation rules, pulls matching events
 * from Gamma, imports the chosen markets through the shared market pipeline and
 * keeps visibility, pins and resolutions in step with Polymarket.
 */

const DEFAULT_MAX_EVENTS_PER_TAG = 40
const PIN_SOURCE = 'polymarket-curation'
const VOLUME_CHUNK_SIZE = 200

export interface PolymarketSyncSummary {
  candidates: number
  visible: number
  imported: number
  hidden: number
  shown: number
  resolved: number
  mirrorsHidden: number
  pinned: number
  errors: { ref: string; error: string }[]
  timeLimitReached: boolean
}

function toCurationRules(rows: Awaited<ReturnType<typeof listPolymarketCurationRules>>): CurationRule[] {
  return rows.map((row) => ({
    scope: row.scope,
    ref: row.ref,
    mode: row.mode,
    pinned: row.pinned,
    parent_ref: row.parent_ref,
    filters: row.filters ?? {},
  }))
}

async function collectCandidates(rules: CurationRule[], errors: PolymarketSyncSummary['errors']) {
  const candidates = new Map<string, GammaEvent>()
  const nowIso = new Date().toISOString()

  for (const rule of rules) {
    if (rule.scope !== 'tag' || rule.mode !== 'include') {
      continue
    }
    try {
      const windowEnd = rule.filters.windowDays
        ? new Date(Date.now() + rule.filters.windowDays * 86_400_000).toISOString()
        : undefined
      const found = await listGammaEvents({
        tagSlug: rule.ref,
        active: true,
        closed: false,
        order: 'volume24hr',
        ascending: false,
        limit: rule.filters.maxEvents ?? DEFAULT_MAX_EVENTS_PER_TAG,
        endDateMin: nowIso,
        endDateMax: windowEnd,
      })
      for (const event of found) {
        candidates.set(String(event.id), event)
      }
    } catch (error) {
      errors.push({ ref: `tag:${rule.ref}`, error: error instanceof Error ? error.message : String(error) })
    }
  }

  // Explicitly included events, events holding an included market (parent_ref
  // carries the Gamma event id), and everything already imported (so closed
  // events still receive their resolution).
  const explicitIds = rules
    .filter(
      (rule) => rule.mode === 'include' && (rule.scope === 'event' || (rule.scope === 'market' && rule.parent_ref)),
    )
    .map((rule) => (rule.scope === 'event' ? rule.ref : rule.parent_ref!))
  const importedRows = await db
    .select({ polymarket_event_id: events.polymarket_event_id })
    .from(events)
    .where(and(eq(events.venue, 'polymarket'), isNotNull(events.polymarket_event_id), ne(events.status, 'resolved')))
  const refreshIds = [...explicitIds, ...importedRows.map((row) => row.polymarket_event_id!)].filter(
    (id) => !candidates.has(id),
  )
  if (refreshIds.length > 0) {
    try {
      for (const event of await getGammaEventsByIds(refreshIds)) {
        candidates.set(String(event.id), event)
      }
    } catch (error) {
      errors.push({ ref: 'refresh', error: error instanceof Error ? error.message : String(error) })
    }
  }

  return candidates
}

function invalidateEventSlugs(slugs: string[]) {
  for (const slug of slugs) {
    revalidateTag(cacheTags.event(slug), { expire: 0 })
  }
  revalidateTag(cacheTags.eventsList, { expire: 0 })
  revalidateTag(cacheTags.homeFeaturedEvents, { expire: 0 })
  revalidateTag(cacheTags.sitemap, { expire: 0 })
  revalidateTag(cacheTags.sportsMenu, { expire: 0 })
  for (const locale of SUPPORTED_LOCALES) {
    revalidateTag(cacheTags.mainTags(locale), { expire: 0 })
  }
}

/** Volumes come from Gamma; Kuest's volume job skips venue = 'polymarket'. One statement per chunk. */
async function applyVolumes(decisions: Map<string, CurationDecision>) {
  const rows = Array.from(decisions.values()).flatMap((decision) =>
    decision.markets.map((market) => ({
      conditionId: market.conditionId,
      volume: String(toGammaNumber(market.volume)),
      volume24h: String(toGammaNumber(market.volume24hr)),
    })),
  )
  for (let start = 0; start < rows.length; start += VOLUME_CHUNK_SIZE) {
    const values = sql.join(
      rows
        .slice(start, start + VOLUME_CHUNK_SIZE)
        .map((row) => sql`(${row.conditionId}, ${row.volume}::numeric, ${row.volume24h}::numeric)`),
      sql`, `,
    )
    await db.execute(sql`
      UPDATE ${markets} AS m
      SET volume = v.volume, volume_24h = v.volume_24h
      FROM (VALUES ${values}) AS v(condition_id, volume, volume_24h)
      WHERE m.condition_id = v.condition_id
        AND (m.volume IS DISTINCT FROM v.volume OR m.volume_24h IS DISTINCT FROM v.volume_24h)
    `)
  }
}

/**
 * Results for every imported event Gamma returned this run, hidden ones included:
 * hidden events are not re-imported, yet picks and positions on them still need
 * to settle. Updates are no-ops for markets that were never imported.
 */
async function applyResolutions(candidates: Map<string, GammaEvent>, deadlineMs: number) {
  const { settled, fullySettledEventIds } = collectSettledMarkets(candidates.values())
  let resolved = 0
  for (const market of settled) {
    // Settled markets are picked up again on the next run.
    if (Date.now() >= deadlineMs) {
      return { resolved, slugs: [] }
    }
    await db
      .update(conditions)
      .set({ resolved: true, resolution_status: 'resolved', resolution_price: String(market.price) })
      .where(eq(conditions.id, market.conditionId))
    await db
      .update(markets)
      .set({ is_resolved: true, is_active: false })
      .where(and(eq(markets.condition_id, market.conditionId), eq(markets.is_resolved, false)))
    if (await updateOutcomePayoutsFromResolutionPrice(market.conditionId, market.price)) {
      resolved++
    }
  }

  // Resolved events leave the refresh set, so a fully settled event is checked one last time.
  const resolvedEvents =
    fullySettledEventIds.length === 0
      ? []
      : await db
          .update(events)
          .set({ status: 'resolved', resolved_at: new Date() })
          .where(
            and(
              eq(events.venue, 'polymarket'),
              inArray(events.polymarket_event_id, fullySettledEventIds),
              ne(events.status, 'resolved'),
            ),
          )
          .returning({ slug: events.slug })
  return { resolved, slugs: resolvedEvents.map((row) => row.slug) }
}

/** Hide Kuest mirrors whose every market now has a direct Polymarket counterpart on show. */
async function hideCoveredMirrors(visibleConditionIds: Set<string>) {
  if (visibleConditionIds.size === 0) {
    return []
  }
  const rows = await db
    .select({ event_id: markets.event_id, slug: events.slug, polymarket_condition_id: markets.polymarket_condition_id })
    .from(markets)
    .innerJoin(events, eq(events.id, markets.event_id))
    .where(and(eq(events.venue, 'kuest'), eq(events.is_polymarket_mirror, true), eq(events.is_hidden, false)))
  const byEvent = new Map<string, { slug: string; covered: boolean }>()
  for (const row of rows) {
    const entry = byEvent.get(row.event_id) ?? { slug: row.slug, covered: true }
    entry.covered &&= Boolean(row.polymarket_condition_id && visibleConditionIds.has(row.polymarket_condition_id))
    byEvent.set(row.event_id, entry)
  }
  const covered = Array.from(byEvent.entries()).filter(([, entry]) => entry.covered)
  if (covered.length === 0) {
    return []
  }
  await db
    .update(events)
    .set({ is_hidden: true })
    .where(
      inArray(
        events.id,
        covered.map(([eventId]) => eventId),
      ),
    )
  return covered.map(([, entry]) => entry.slug)
}

async function syncPins(pinnedEventIds: string[], options: { removeStale: boolean }) {
  if (options.removeStale) {
    await db
      .delete(home_featured_events)
      .where(
        and(
          eq(home_featured_events.source, PIN_SOURCE),
          pinnedEventIds.length > 0 ? notInArray(home_featured_events.event_id, pinnedEventIds) : undefined,
        ),
      )
  }
  if (pinnedEventIds.length === 0) {
    return 0
  }
  const existing = await db
    .select({ event_id: home_featured_events.event_id })
    .from(home_featured_events)
    .where(inArray(home_featured_events.event_id, pinnedEventIds))
  const existingIds = new Set(existing.map((row) => row.event_id))
  const toInsert = pinnedEventIds.filter((id) => !existingIds.has(id))
  if (toInsert.length > 0) {
    await db.insert(home_featured_events).values(
      toInsert.map((eventId, index) => ({
        target_type: 'event',
        event_id: eventId,
        enabled: true,
        rank: index,
        source: PIN_SOURCE,
      })),
    )
  }
  return pinnedEventIds.length
}

export async function runPolymarketSync(options: { deadlineMs: number }): Promise<PolymarketSyncSummary> {
  const errors: PolymarketSyncSummary['errors'] = []
  const rules = toCurationRules(await listPolymarketCurationRules())
  const index = buildCurationIndex(rules)
  const candidates = await collectCandidates(rules, errors)

  const decisions = new Map<string, CurationDecision>()
  for (const [id, event] of candidates) {
    decisions.set(id, decideEvent(event, index))
  }
  const visibleIds = Array.from(decisions.entries())
    .filter(([, decision]) => decision.visible)
    .map(([id]) => id)

  const entries = visibleIds.flatMap((id) =>
    buildExternalMarketEntries(candidates.get(id)!, decisions.get(id)!.markets),
  )
  // Tag each event as Polymarket the moment its first market lands, so a run cut
  // short (serverless time limit) never leaves Polymarket events looking like Kuest ones.
  const gammaEventIdByConditionId = new Map(
    visibleIds.flatMap((id) => decisions.get(id)!.markets.map((market) => [market.conditionId, id] as const)),
  )
  const taggedEventIds = new Set<string>()
  const changedSlugs = new Set<string>()
  let shown = 0
  async function tagEvent(conditionId: string, eventId: string) {
    const gammaId = gammaEventIdByConditionId.get(conditionId)
    if (!gammaId || taggedEventIds.has(eventId)) {
      return
    }
    taggedEventIds.add(eventId)
    const updated = await db
      .update(events)
      .set({ venue: 'polymarket', polymarket_event_id: gammaId, is_hidden: false })
      .where(
        and(
          eq(events.id, eventId),
          sql`(${events.venue} <> 'polymarket' OR ${events.polymarket_event_id} IS DISTINCT FROM ${gammaId} OR ${events.is_hidden})`,
        ),
      )
      .returning({ slug: events.slug })
    for (const row of updated) {
      changedSlugs.add(row.slug)
      shown++
    }
  }

  const ingest = await ingestMarketsWithMetadata(entries, {
    autoDeployNewEvents: true,
    deadlineMs: options.deadlineMs,
    onMarketStored: tagEvent,
  })
  for (const error of ingest.errors) {
    errors.push({ ref: `market:${error.conditionId}`, error: error.error })
  }

  // Map Gamma event id -> Prophit event id through the ingested markets.
  const prophitEventIdByGammaId = new Map<string, string>()
  for (const id of visibleIds) {
    for (const market of decisions.get(id)!.markets) {
      const eventId = ingest.eventIdByConditionId.get(market.conditionId)
      if (eventId) {
        prophitEventIdByGammaId.set(id, eventId)
        break
      }
    }
  }

  // Anything imported earlier that the rules no longer show goes hidden (not deleted:
  // holders keep their positions and history).
  // Events Gamma did not return this run (or that failed to import) keep their state.
  const keepIds = Array.from(prophitEventIdByGammaId.keys())
  const refreshedIds = Array.from(candidates.keys()).filter((id) => !prophitEventIdByGammaId.has(id))
  const hiddenRows =
    refreshedIds.length === 0 || ingest.timeLimitReached
      ? []
      : await db
          .update(events)
          .set({ is_hidden: true })
          .where(
            and(
              eq(events.venue, 'polymarket'),
              eq(events.is_hidden, false),
              inArray(events.polymarket_event_id, refreshedIds),
              keepIds.length > 0 ? notInArray(events.polymarket_event_id, keepIds) : undefined,
            ),
          )
          .returning({ slug: events.slug })
  for (const row of hiddenRows) {
    changedSlugs.add(row.slug)
  }

  const visibleDecisions = new Map(visibleIds.map((id) => [id, decisions.get(id)!]))
  await applyVolumes(visibleDecisions)
  const resolution = await applyResolutions(candidates, options.deadlineMs)
  const resolved = resolution.resolved
  for (const slug of resolution.slugs) {
    changedSlugs.add(slug)
  }

  const visibleConditionIds = new Set(
    visibleIds.flatMap((id) => decisions.get(id)!.markets.map((market) => market.conditionId)),
  )
  const mirrorSlugs = await hideCoveredMirrors(visibleConditionIds)
  for (const slug of mirrorSlugs) {
    changedSlugs.add(slug)
  }

  const pinnedEventIds = visibleIds
    .filter((id) => decisions.get(id)!.pinned)
    .map((id) => prophitEventIdByGammaId.get(id))
    .filter((id): id is string => Boolean(id))
  // A run cut short has not mapped every pinned event yet, so it only adds pins.
  const pinned = await syncPins(pinnedEventIds, { removeStale: !ingest.timeLimitReached })

  if (changedSlugs.size > 0 || resolved > 0 || pinned > 0) {
    invalidateEventSlugs(Array.from(changedSlugs))
  }

  return {
    candidates: candidates.size,
    visible: visibleIds.length,
    imported: ingest.processedCount,
    hidden: hiddenRows.length,
    shown,
    resolved,
    mirrorsHidden: mirrorSlugs.length,
    pinned,
    errors,
    timeLimitReached: ingest.timeLimitReached,
  }
}
