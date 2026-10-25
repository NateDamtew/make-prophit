import { and, asc, eq } from 'drizzle-orm'

import type {
  PolymarketCurationFilters,
  PolymarketCurationMode,
  PolymarketCurationScope,
} from '@/lib/db/schema/polymarket/tables'

import { polymarket_curation_rules } from '@/lib/db/schema/polymarket/tables'
import { db } from '@/lib/drizzle'

export type PolymarketCurationRuleRow = typeof polymarket_curation_rules.$inferSelect

export interface UpsertPolymarketCurationRuleInput {
  scope: PolymarketCurationScope
  ref: string
  label?: string
  parentRef?: string | null
  mode?: PolymarketCurationMode
  pinned?: boolean
  filters?: PolymarketCurationFilters
  sortOrder?: number
  updatedBy?: string | null
}

export async function listPolymarketCurationRules(): Promise<PolymarketCurationRuleRow[]> {
  return await db
    .select()
    .from(polymarket_curation_rules)
    .orderBy(
      asc(polymarket_curation_rules.scope),
      asc(polymarket_curation_rules.sort_order),
      asc(polymarket_curation_rules.label),
    )
}

export async function upsertPolymarketCurationRule(input: UpsertPolymarketCurationRuleInput) {
  const ref = input.scope === 'tag' ? input.ref.trim().toLowerCase() : input.ref.trim()
  const values = {
    scope: input.scope,
    ref,
    label: input.label?.trim() ?? '',
    parent_ref: input.parentRef ?? null,
    mode: input.mode ?? 'include',
    pinned: input.pinned ?? false,
    filters: input.filters ?? {},
    sort_order: input.sortOrder ?? 0,
    updated_by: input.updatedBy ?? null,
  }
  const [row] = await db
    .insert(polymarket_curation_rules)
    .values(values)
    .onConflictDoUpdate({
      target: [polymarket_curation_rules.scope, polymarket_curation_rules.ref],
      set: {
        label: values.label || undefined,
        parent_ref: values.parent_ref,
        mode: values.mode,
        pinned: values.pinned,
        filters: values.filters,
        sort_order: values.sort_order,
        updated_by: values.updated_by,
      },
    })
    .returning()
  return row
}

export async function deletePolymarketCurationRule(scope: PolymarketCurationScope, ref: string) {
  await db
    .delete(polymarket_curation_rules)
    .where(and(eq(polymarket_curation_rules.scope, scope), eq(polymarket_curation_rules.ref, ref)))
}
