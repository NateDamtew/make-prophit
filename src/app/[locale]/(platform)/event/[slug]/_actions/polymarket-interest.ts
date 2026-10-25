'use server'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { UserRepository } from '@/lib/db/queries/user'
import { events, polymarket_trading_interest } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { UNAUTHENTICATED_ERROR } from '@/lib/trading-auth/errors'

const InterestSchema = z.object({ eventId: z.string().length(26) })

/** Records "notify me when trading opens" for a Polymarket event (idempotent). */
export async function registerPolymarketTradingInterestAction(rawEventId: string) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { error: UNAUTHENTICATED_ERROR }
  }

  const parsed = InterestSchema.safeParse({ eventId: rawEventId })
  if (!parsed.success) {
    return { error: 'Invalid event.' }
  }

  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, parsed.data.eventId), eq(events.venue, 'polymarket')))
    .limit(1)
  if (!event) {
    return { error: 'Invalid event.' }
  }

  await db.insert(polymarket_trading_interest).values({ user_id: user.id, event_id: event.id }).onConflictDoNothing()

  return { ok: true as const }
}
