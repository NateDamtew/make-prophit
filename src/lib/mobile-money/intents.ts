import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'

import type { PaymentIntentKind, PaymentIntentState } from '@/lib/db/schema/ledger/tables'
import type { LedgerTx } from '@/lib/ledger/service'

import { mobile_money_accounts, payment_callback_events, payment_intents } from '@/lib/db/schema/ledger/tables'
import { db } from '@/lib/drizzle'

export type PaymentIntentRow = typeof payment_intents.$inferSelect

const DAY_MS = 24 * 60 * 60 * 1000

export const PaymentIntentRepository = {
  async getById(id: string, tx?: LedgerTx): Promise<PaymentIntentRow | null> {
    const t = tx ?? db
    const [row] = await t.select().from(payment_intents).where(eq(payment_intents.id, id)).limit(1)
    return row ?? null
  },

  async getByProviderRef(providerRef: string, tx?: LedgerTx): Promise<PaymentIntentRow | null> {
    const t = tx ?? db
    const [row] = await t.select().from(payment_intents).where(eq(payment_intents.provider_ref, providerRef)).limit(1)
    return row ?? null
  },

  /** Lock an intent row for a state transition. */
  async lockById(id: string, tx: LedgerTx): Promise<PaymentIntentRow | null> {
    const [row] = await tx.select().from(payment_intents).where(eq(payment_intents.id, id)).for('update').limit(1)
    return row ?? null
  },

  async listForUser(
    userId: string,
    params: { limit?: number; kind?: PaymentIntentKind } = {},
  ): Promise<PaymentIntentRow[]> {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100)
    const where = params.kind
      ? and(eq(payment_intents.user_id, userId), eq(payment_intents.kind, params.kind))
      : eq(payment_intents.user_id, userId)
    return db.select().from(payment_intents).where(where).orderBy(desc(payment_intents.created_at)).limit(limit)
  },

  /** Sum of completed + in-flight amounts for a user over the trailing 24h (daily caps). */
  async getDailyUsage(userId: string, kind: PaymentIntentKind, currency: string): Promise<bigint> {
    const since = new Date(Date.now() - DAY_MS)
    const [row] = await db
      .select({ total: sql<string>`COALESCE(SUM(${payment_intents.amount}), 0)` })
      .from(payment_intents)
      .where(
        and(
          eq(payment_intents.user_id, userId),
          eq(payment_intents.kind, kind),
          eq(payment_intents.currency, currency),
          inArray(payment_intents.state, ['initiated', 'pending', 'completed']),
          gte(payment_intents.created_at, since),
        ),
      )
    return BigInt(row?.total ?? '0')
  },

  /** Intents still pending whose last check is older than `olderThanMs` (or never checked). */
  async listStalePending(params: {
    kind: PaymentIntentKind
    olderThanMs: number
    limit?: number
  }): Promise<PaymentIntentRow[]> {
    const cutoff = new Date(Date.now() - params.olderThanMs)
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200)
    return db
      .select()
      .from(payment_intents)
      .where(
        and(
          eq(payment_intents.kind, params.kind),
          inArray(payment_intents.state, ['initiated', 'pending'] satisfies PaymentIntentState[]),
          lt(payment_intents.created_at, cutoff),
          sql`(${payment_intents.last_status_check_at} IS NULL OR ${payment_intents.last_status_check_at} < ${cutoff})`,
        ),
      )
      .orderBy(payment_intents.created_at)
      .limit(limit)
  },

  async recordCallbackEvent(
    event: {
      fingerprint: string
      intentId: string | null
      providerRef: string | null
      kind: string | null
      status: string | null
      signatureKeyId: string | null
      signatureVerified: boolean
      payload: Record<string, unknown>
    },
    tx?: LedgerTx,
  ): Promise<boolean> {
    const t = tx ?? db
    const inserted = await t
      .insert(payment_callback_events)
      .values({
        fingerprint: event.fingerprint,
        intent_id: event.intentId,
        provider_ref: event.providerRef,
        kind: event.kind,
        status: event.status,
        signature_key_id: event.signatureKeyId,
        signature_verified: event.signatureVerified,
        payload: event.payload,
      })
      .onConflictDoNothing()
      .returning({ fingerprint: payment_callback_events.fingerprint })
    return inserted.length > 0
  },

  async listCallbackEvents(intentId: string) {
    return db
      .select()
      .from(payment_callback_events)
      .where(eq(payment_callback_events.intent_id, intentId))
      .orderBy(desc(payment_callback_events.received_at))
      .limit(50)
  },
}

export const MobileMoneyAccountRepository = {
  async upsertUsed(
    params: { userId: string; msisdn: string; provider: string; country: string; currency: string; verified?: boolean },
    tx?: LedgerTx,
  ) {
    const t = tx ?? db
    const now = new Date()
    await t
      .insert(mobile_money_accounts)
      .values({
        user_id: params.userId,
        msisdn: params.msisdn,
        provider: params.provider,
        country: params.country,
        currency: params.currency,
        verified_at: params.verified ? now : null,
        last_used_at: now,
      })
      .onConflictDoUpdate({
        target: [mobile_money_accounts.user_id, mobile_money_accounts.msisdn, mobile_money_accounts.provider],
        set: {
          last_used_at: now,
          ...(params.verified ? { verified_at: sql`COALESCE(${mobile_money_accounts.verified_at}, NOW())` } : {}),
        },
      })
  },

  async listForUser(userId: string) {
    return db
      .select()
      .from(mobile_money_accounts)
      .where(eq(mobile_money_accounts.user_id, userId))
      .orderBy(desc(mobile_money_accounts.last_used_at))
      .limit(10)
  },
}
