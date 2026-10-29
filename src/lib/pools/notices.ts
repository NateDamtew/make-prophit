import { and, eq, inArray, isNull, lte, sql } from 'drizzle-orm'

import type { LedgerTx } from '@/lib/ledger/service'

import { closingSoonNotice, payoutReleasedNotice, youWonNotice } from '@/lib/communities/notification-templates'
import { communities, community_markets } from '@/lib/db/schema/communities/tables'
import { notifications } from '@/lib/db/schema/notifications/tables'
import { pool_stakes, pools } from '@/lib/db/schema/pools/tables'
import { db } from '@/lib/drizzle'

/**
 * In-app notices the pool lifecycle sends to stakers: closing soon, and
 * what happened to their money when the hold ends. Jury and appeal notices
 * live with their services. The notifications table only allows category
 * 'general' and link type 'custom' for these, with the kind in metadata.
 */

const CLOSING_SOON_WINDOW_MS = 60 * 60 * 1000

async function loadMarketRef(tx: LedgerTx | typeof db, communityMarketId: string) {
  const [row] = await tx
    .select({ title: community_markets.title, slug: communities.slug })
    .from(community_markets)
    .innerJoin(communities, eq(communities.id, community_markets.community_id))
    .where(eq(community_markets.id, communityMarketId))
    .limit(1)
  return row ?? null
}

/**
 * Pools closing within the hour that nobody has been told about yet: every
 * staker gets one notice, and the pool remembers it was sent.
 */
export async function notifyClosingSoon(now = new Date()): Promise<number> {
  const due = await db
    .select({ id: pools.id, community_market_id: pools.community_market_id, closes_at: pools.closes_at })
    .from(pools)
    .where(
      and(
        eq(pools.state, 'open'),
        isNull(pools.closing_notified_at),
        sql`${pools.closes_at} IS NOT NULL AND ${pools.closes_at} > ${now}`,
        lte(pools.closes_at, new Date(now.getTime() + CLOSING_SOON_WINDOW_MS)),
      ),
    )
    .limit(50)
  let sent = 0
  for (const pool of due) {
    const market = await loadMarketRef(db, pool.community_market_id)
    const stakers = await db
      .selectDistinct({ user_id: pool_stakes.user_id })
      .from(pool_stakes)
      .where(eq(pool_stakes.pool_id, pool.id))
    if (market && stakers.length > 0 && pool.closes_at) {
      const notice = closingSoonNotice({
        marketTitle: market.title,
        minutesLeft: (pool.closes_at.getTime() - now.getTime()) / 60_000,
      })
      await db.insert(notifications).values(
        stakers.map((staker) => ({
          user_id: staker.user_id,
          category: 'general',
          title: notice.title,
          description: notice.description,
          link_type: 'custom',
          link_url: `/community/${market.slug}/market/${pool.community_market_id}`,
          link_label: notice.linkLabel,
          metadata: { kind: notice.kind, market_id: pool.community_market_id, community_slug: market.slug },
        })),
      )
      sent += stakers.length
    }
    await db.update(pools).set({ closing_notified_at: now }).where(eq(pools.id, pool.id))
  }
  return sent
}

/**
 * After a release: winners hear how much landed, everyone else that the
 * hold is over. Refunds are announced by the jury and appeal services when
 * they decide them, so a cancelled pool sends nothing here. Runs in the
 * release transaction so a notice never outlives a rolled-back payout.
 */
export async function notifyPayoutsReleased(
  tx: LedgerTx,
  input: {
    communityMarketId: string
    currency: string
    outcome: 'yes' | 'no' | 'cancelled'
    /** Payout per user, minor units, winners only. */
    payouts: Map<string, bigint>
    stakerIds: string[]
  },
) {
  if (input.outcome === 'cancelled' || input.stakerIds.length === 0) {
    return
  }
  const market = await loadMarketRef(tx, input.communityMarketId)
  if (!market) {
    return
  }
  const url = `/community/${market.slug}/market/${input.communityMarketId}`
  const base = { market_id: input.communityMarketId, community_slug: market.slug }
  const rows: Array<typeof notifications.$inferInsert> = []
  {
    const released = payoutReleasedNotice({ marketTitle: market.title, outcome: input.outcome })
    for (const userId of input.stakerIds) {
      const payout = input.payouts.get(userId) ?? 0n
      if (payout > 0n) {
        const won = youWonNotice({ marketTitle: market.title, payoutMinor: payout, currency: input.currency })
        rows.push({
          user_id: userId,
          category: 'general',
          title: won.title,
          description: won.description,
          link_type: 'custom',
          link_url: `${url}?share=won`,
          link_label: won.linkLabel,
          metadata: { kind: won.kind, payout_minor: payout.toString(), currency: input.currency, ...base },
        })
      } else {
        rows.push({
          user_id: userId,
          category: 'general',
          title: released.title,
          description: released.description,
          link_type: 'custom',
          link_url: url,
          link_label: released.linkLabel,
          metadata: { kind: released.kind, ...base },
        })
      }
    }
  }
  if (rows.length > 0) {
    await tx.insert(notifications).values(rows)
  }
}

/** Markets whose pools are listed, for the overlay and embed read models. */
export function poolsForMarkets(marketIds: string[]) {
  return db
    .select({
      community_market_id: pools.community_market_id,
      state: pools.state,
      currency: pools.currency,
      total_yes: pools.total_yes,
      total_no: pools.total_no,
      stake_count: pools.stake_count,
      closes_at: pools.closes_at,
      settled_outcome: pools.settled_outcome,
      planned_outcome: pools.planned_outcome,
    })
    .from(pools)
    .where(inArray(pools.community_market_id, marketIds))
}
