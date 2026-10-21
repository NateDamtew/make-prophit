import { eq } from 'drizzle-orm'

import type { LedgerTx } from '@/lib/ledger/service'

import { ledger_user_profiles } from '@/lib/db/schema/ledger/tables'
import { db } from '@/lib/drizzle'
import { CURRENT_TERMS_VERSION } from '@/lib/mobile-money/rules'

/**
 * Age + Terms consent for the local-currency rail. The acceptance is stored on
 * the ledger profile (one row per user, created when the currency is locked),
 * so every money entry point — deposit, stake, withdrawal — can check it with
 * the profile it already loads. The pure check lives in `rules.ts`.
 */
export async function recordConsent(userId: string, tx?: LedgerTx): Promise<void> {
  const now = new Date()
  await (tx ?? db)
    .update(ledger_user_profiles)
    .set({
      terms_accepted_at: now,
      age_confirmed_at: now,
      terms_version: CURRENT_TERMS_VERSION,
      updated_at: now,
    })
    .where(eq(ledger_user_profiles.user_id, userId))
}
