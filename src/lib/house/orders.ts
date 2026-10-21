import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import type { EntryInput } from '@/lib/ledger/invariants'

import { CLOB_ORDER_TYPE, getExchangeEip712Domain, ORDER_SIDE, ORDER_TYPE } from '@/lib/constants'
import { markets, outcomes } from '@/lib/db/schema/events/tables'
import { house_orders, positions, user_orders } from '@/lib/db/schema/ledger/house'
import { ledger_user_profiles } from '@/lib/db/schema/ledger/tables'
import { db } from '@/lib/drizzle'
import { getReferenceRate } from '@/lib/fx/rates'
import { buildClobHmacSignature } from '@/lib/hmac'
import { getHouseAccount, getHouseSignerKey, isHouseTradingConfigured } from '@/lib/house/config'
import { quoteBuy, settledPayout } from '@/lib/house/quote'
import { signOrderWithHouseKey } from '@/lib/house/signing'
import { LedgerError, LedgerService } from '@/lib/ledger/service'
import { getMobileMoneySettings } from '@/lib/mobile-money/settings'
import { buildOrderPayload } from '@/lib/orders'
import { resolvePublicRuntimeEnv } from '@/lib/public-runtime-config.shared'
import { getUserTradingAuthSecrets } from '@/lib/trading-auth/server'

/**
 * House-signed order-book trading for ledger users (design §6.1).
 *
 * Phase-one rules that keep this safe without a fill feed:
 * - buys only, FOK market orders: the CLOB either fills the whole order in the
 *   same response or kills it, so the fill is known synchronously
 * - one user order ↔ one house order, no netting
 * - the user's local stake is reserved before the CLOB call and either consumed
 *   (filled) or released (killed / error) in the same transaction as the record
 *
 * Settlement credits are driven by market resolution in the database (markets
 * sync marks is_resolved and outcomes.payout_value); the house wallet's USDC
 * redemption on-chain is handled by Kuest's auto-redeem for the house account.
 */

export class HouseOrderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not_configured'
      | 'disabled'
      | 'paused'
      | 'no_profile'
      | 'frozen'
      | 'currency'
      | 'market_not_found'
      | 'market_closed'
      | 'invalid_amount'
      | 'rate_unavailable'
      | 'exposure_cap'
      | 'insufficient_funds'
      | 'clob_rejected'
      | 'clob_error',
  ) {
    super(message)
    this.name = 'HouseOrderError'
  }
}

const CLOB_REQUEST_TIMEOUT_MS = 20_000

export interface HouseBuyQuote {
  conditionId: string
  tokenId: string
  outcomeIndex: number
  currency: string
  localStake: bigint
  usdCents: bigint
  sharesMicro: bigint
  fixedLocalPayout: bigint
  priceCents: number
  ratePerUsd: number
  marginBps: number
}

async function loadMarketOutcome(conditionId: string, outcomeIndex: number) {
  const [market] = await db
    .select({
      condition_id: markets.condition_id,
      slug: markets.slug,
      is_active: markets.is_active,
      is_resolved: markets.is_resolved,
    })
    .from(markets)
    .where(sql`LOWER(${markets.condition_id}) = LOWER(${conditionId})`)
    .limit(1)
  if (!market) {
    throw new HouseOrderError('Market not found.', 'market_not_found')
  }
  if (!market.is_active || market.is_resolved) {
    throw new HouseOrderError('This market is closed for trading.', 'market_closed')
  }
  const [outcome] = await db
    .select({ token_id: outcomes.token_id, outcome_index: outcomes.outcome_index })
    .from(outcomes)
    .where(and(eq(outcomes.condition_id, market.condition_id), eq(outcomes.outcome_index, outcomeIndex)))
    .limit(1)
  if (!outcome) {
    throw new HouseOrderError('Outcome not found.', 'market_not_found')
  }
  return { market, outcome }
}

/** Quote a buy for the user: validates every gate and returns the fixed payout the user will see. */
export async function quoteHouseBuy(params: {
  userId: string
  conditionId: string
  outcomeIndex: number
  localStake: bigint
  priceCents: number
}): Promise<HouseBuyQuote> {
  if (!isHouseTradingConfigured()) {
    throw new HouseOrderError('Order-book trading is not available yet.', 'not_configured')
  }
  const settings = await getMobileMoneySettings()
  if (!settings.enabled) {
    throw new HouseOrderError('Trading is not available right now.', 'disabled')
  }
  const profile = await LedgerService.getUserProfile(params.userId)
  if (!profile) {
    throw new HouseOrderError('Make a deposit first to start trading.', 'no_profile')
  }
  if (profile.trading_frozen) {
    throw new HouseOrderError('Trading is temporarily unavailable on your account.', 'frozen')
  }
  const config = settings.currencies[profile.currency]
  if (!config) {
    throw new HouseOrderError('Your currency is not enabled for trading.', 'currency')
  }
  if (config.tradingPaused) {
    throw new HouseOrderError('Trading is paused for maintenance. Please try again soon.', 'paused')
  }
  const rate = await getReferenceRate(profile.currency, settings)
  if (!rate || rate.paused) {
    throw new HouseOrderError('Prices are being refreshed. Please try again in a few minutes.', 'rate_unavailable')
  }
  const { market, outcome } = await loadMarketOutcome(params.conditionId, params.outcomeIndex)
  const quote = quoteBuy({
    localStake: params.localStake,
    ratePerUsd: rate.ratePerUsd,
    marginBps: rate.effectiveMarginBps,
    priceCents: params.priceCents,
  })
  if (!quote) {
    throw new HouseOrderError('Please enter a valid amount.', 'invalid_amount')
  }
  if (config.exposureCapMinor > 0n) {
    const [open] = await db
      .select({ total: sql<string>`COALESCE(SUM(${positions.fixed_local_payout}), 0)` })
      .from(positions)
      .where(and(eq(positions.currency, profile.currency), isNull(positions.settled_at)))
    if (BigInt(open?.total ?? '0') + quote.fixedLocalPayout > config.exposureCapMinor) {
      throw new HouseOrderError(
        'This market has reached its limit for now. Please try a smaller amount or another market.',
        'exposure_cap',
      )
    }
  }
  return {
    conditionId: market.condition_id,
    tokenId: outcome.token_id,
    outcomeIndex: outcome.outcome_index,
    currency: profile.currency,
    localStake: params.localStake,
    usdCents: quote.usdCents,
    sharesMicro: quote.sharesMicro,
    fixedLocalPayout: quote.fixedLocalPayout,
    priceCents: params.priceCents,
    ratePerUsd: rate.ratePerUsd,
    marginBps: rate.effectiveMarginBps,
  }
}

interface ClobSubmitResult {
  ok: boolean
  orderId: string | null
  error: string | null
  raw: Record<string, unknown> | null
}

async function submitToClob(params: {
  house: NonNullable<Awaited<ReturnType<typeof getHouseAccount>>>
  order: ReturnType<typeof buildOrderPayload>
  signature: string
  conditionId: string
}): Promise<ClobSubmitResult> {
  const auth = await getUserTradingAuthSecrets(params.house.userId)
  const clobAuth = auth?.clob
  if (!clobAuth) {
    throw new HouseOrderError('House trading credentials are missing.', 'not_configured')
  }
  const payload = {
    order: {
      salt: params.order.salt.toString(),
      maker: params.order.maker,
      signer: params.order.signer,
      conditionId: params.conditionId,
      tokenId: params.order.token_id.toString(),
      makerAmount: params.order.maker_amount.toString(),
      takerAmount: params.order.taker_amount.toString(),
      expiration: params.order.expiration.toString(),
      side: params.order.side === ORDER_SIDE.BUY ? 'BUY' : 'SELL',
      signatureType: params.order.signature_type,
      timestamp: params.order.timestamp.toString(),
      metadata: params.order.metadata,
      builder: params.order.builder,
      signature: params.signature,
    },
    orderType: CLOB_ORDER_TYPE.FOK,
    postOnly: false,
    owner: clobAuth.key,
  }
  const method = 'POST'
  const path = '/order'
  const { clobUrl } = resolvePublicRuntimeEnv(process.env)
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = buildClobHmacSignature(clobAuth.secret, timestamp, method, path, body)
  const response = await fetch(`${clobUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      KUEST_ADDRESS: params.house.address,
      KUEST_API_KEY: clobAuth.key,
      KUEST_PASSPHRASE: clobAuth.passphrase,
      KUEST_TIMESTAMP: timestamp.toString(),
      KUEST_SIGNATURE: signature,
    },
    body,
    signal: AbortSignal.timeout(CLOB_REQUEST_TIMEOUT_MS),
  })
  const text = await response.text()
  let raw: Record<string, unknown> | null = null
  try {
    raw = text ? (JSON.parse(text) as Record<string, unknown>) : null
  } catch {
    raw = null
  }
  const error = (raw?.errorMsg ?? raw?.error ?? raw?.message ?? raw?.code) as string | undefined
  if (!response.ok || raw?.success === false) {
    return { ok: false, orderId: null, error: error ?? `CLOB ${response.status}`, raw }
  }
  const orderId = (raw?.orderID ?? raw?.orderId) as string | undefined
  return { ok: Boolean(orderId), orderId: orderId ?? null, error: orderId ? null : 'CLOB returned no order id', raw }
}

/**
 * Place a FOK buy for the user through the house account. Reserves the local
 * stake, signs and submits, then records the outcome atomically:
 * filled → consume the hold, debit user, credit fx_clearing, upsert position
 * killed/error → release the hold, record failure.
 */
export async function placeHouseBuy(params: {
  userId: string
  conditionId: string
  outcomeIndex: number
  localStake: bigint
  priceCents: number
}) {
  const quote = await quoteHouseBuy(params)
  const house = await getHouseAccount()
  const privateKey = getHouseSignerKey()
  if (!house || !privateKey) {
    throw new HouseOrderError('Order-book trading is not available yet.', 'not_configured')
  }

  // 1. Reserve the stake and write the pending user order.
  const { userOrder, reservation } = await db.transaction(async (tx) => {
    const cash = await LedgerService.getOrCreateUserCashAccount(params.userId, quote.currency, tx)
    const [created] = await tx
      .insert(user_orders)
      .values({
        user_id: params.userId,
        condition_id: quote.conditionId,
        token_id: quote.tokenId,
        outcome_index: quote.outcomeIndex,
        side: 'buy',
        currency: quote.currency,
        local_stake: quote.localStake,
        usd_cents: quote.usdCents,
        rate_per_usd: quote.ratePerUsd.toFixed(6),
        margin_bps: quote.marginBps,
        price_cents: quote.priceCents,
        shares_micro: quote.sharesMicro,
        fixed_local_payout: quote.fixedLocalPayout,
        state: 'pending',
      })
      .returning()
    let hold
    try {
      hold = await LedgerService.reserve(
        { accountId: cash.id, amount: quote.localStake, referenceType: 'user_order', referenceId: created!.id },
        tx,
      )
    } catch (error) {
      if (error instanceof LedgerError && error.code === 'insufficient_funds') {
        throw new HouseOrderError('You do not have enough available balance for that stake.', 'insufficient_funds')
      }
      throw error
    }
    await tx.update(user_orders).set({ reservation_id: hold.id }).where(eq(user_orders.id, created!.id))
    return { userOrder: created!, reservation: hold }
  })

  // 2. Build, sign and submit the house order.
  const [outcomeRow] = await db.select().from(outcomes).where(eq(outcomes.token_id, quote.tokenId)).limit(1)
  const order = buildOrderPayload({
    outcome: outcomeRow as never,
    makerAddress: house.depositWalletAddress,
    orderType: ORDER_TYPE.MARKET,
    side: ORDER_SIDE.BUY,
    amount: (Number(quote.usdCents) / 100).toFixed(2),
    limitPrice: '',
    limitShares: '',
    marketPriceCents: quote.priceCents,
  })
  let submit: ClobSubmitResult
  try {
    const [marketRow] = await db
      .select({ negRisk: markets.neg_risk })
      .from(markets)
      .where(eq(markets.condition_id, quote.conditionId))
      .limit(1)
    const signature = await signOrderWithHouseKey({
      payload: order,
      domain: getExchangeEip712Domain(Boolean(marketRow?.negRisk)),
      privateKey,
    })
    submit = await submitToClob({ house, order, signature, conditionId: quote.conditionId })
  } catch (error) {
    submit = { ok: false, orderId: null, error: error instanceof Error ? error.message : String(error), raw: null }
  }

  // 3. Record the result and settle the hold.
  return db.transaction(async (tx) => {
    await tx.insert(house_orders).values({
      user_order_id: userOrder.id,
      clob_order_id: submit.orderId,
      maker: house.depositWalletAddress,
      token_id: quote.tokenId,
      side: ORDER_SIDE.BUY,
      maker_amount: order.maker_amount,
      taker_amount: order.taker_amount,
      order_type: CLOB_ORDER_TYPE.FOK,
      state: submit.ok ? 'filled' : 'rejected',
      clob_response: submit.raw,
    })
    if (!submit.ok) {
      await LedgerService.releaseReservation(reservation.id, tx)
      await tx
        .update(user_orders)
        .set({ state: 'rejected', failure_message: submit.error })
        .where(eq(user_orders.id, userOrder.id))
      throw new HouseOrderError(
        'Your order could not be filled right now. Nothing was taken from your balance.',
        'clob_rejected',
      )
    }
    const cash = await LedgerService.getOrCreateUserCashAccount(params.userId, quote.currency, tx)
    const clearing = await LedgerService.getOrCreateHouseAccount('fx_clearing', quote.currency, tx)
    const posted = await LedgerService.postTransaction(
      {
        kind: 'orderbook_buy',
        referenceType: 'user_order',
        referenceId: userOrder.id,
        idempotencyKey: `user_order:${userOrder.id}`,
        description: `Buy ${quote.outcomeIndex === 0 ? 'YES' : 'NO'} on Kuest via house account`,
        metadata: {
          conditionId: quote.conditionId,
          tokenId: quote.tokenId,
          clobOrderId: submit.orderId,
          usdCents: quote.usdCents.toString(),
          ratePerUsd: quote.ratePerUsd,
        },
        entries: [
          { accountId: cash.id, side: 'debit', amount: quote.localStake, currency: quote.currency },
          { accountId: clearing.id, side: 'credit', amount: quote.localStake, currency: quote.currency },
        ],
        consumeReservations: [{ reservationId: reservation.id }],
      },
      tx,
    )
    await tx
      .update(user_orders)
      .set({ state: 'filled', ledger_transaction_id: posted.transactionId })
      .where(eq(user_orders.id, userOrder.id))
    await tx
      .insert(positions)
      .values({
        user_id: params.userId,
        condition_id: quote.conditionId,
        token_id: quote.tokenId,
        outcome_index: quote.outcomeIndex,
        currency: quote.currency,
        shares_micro: quote.sharesMicro,
        local_stake: quote.localStake,
        fixed_local_payout: quote.fixedLocalPayout,
      })
      .onConflictDoUpdate({
        target: [positions.user_id, positions.token_id],
        set: {
          shares_micro: sql`${positions.shares_micro} + ${quote.sharesMicro}`,
          local_stake: sql`${positions.local_stake} + ${quote.localStake}`,
          fixed_local_payout: sql`${positions.fixed_local_payout} + ${quote.fixedLocalPayout}`,
        },
      })
    return { userOrderId: userOrder.id, clobOrderId: submit.orderId, quote }
  })
}

/**
 * Credit settled positions for resolved markets. Idempotent per position (the
 * settlement tx has a unique idempotency key). Payout fraction comes from
 * outcomes.payout_value (1 = won, 0 = lost); the cash leg posts against the
 * fx_clearing account so the local books stay balanced while the house's USD
 * redemption is tracked separately in treasury.
 */
export async function creditResolvedPositions(limit = 200) {
  const rows = await db
    .select({ position: positions, payoutValue: outcomes.payout_value, isResolved: markets.is_resolved })
    .from(positions)
    .innerJoin(outcomes, eq(positions.token_id, outcomes.token_id))
    .innerJoin(markets, eq(positions.condition_id, markets.condition_id))
    .where(and(isNull(positions.settled_at), eq(markets.is_resolved, true)))
    .limit(limit)
  let credited = 0
  let zero = 0
  for (const row of rows) {
    const fraction = row.payoutValue === null ? null : Number(row.payoutValue)
    if (fraction === null || !Number.isFinite(fraction)) {
      continue // resolved but payouts not synced yet
    }
    const payout = settledPayout(row.position.fixed_local_payout, fraction)
    await db.transaction(async (tx) => {
      let transactionId: string | null = null
      if (payout > 0n) {
        const cash = await LedgerService.getOrCreateUserCashAccount(row.position.user_id, row.position.currency, tx)
        const clearing = await LedgerService.getOrCreateHouseAccount('fx_clearing', row.position.currency, tx)
        const entries: EntryInput[] = [
          { accountId: clearing.id, side: 'debit', amount: payout, currency: row.position.currency },
          { accountId: cash.id, side: 'credit', amount: payout, currency: row.position.currency },
        ]
        const posted = await LedgerService.postTransaction(
          {
            kind: 'orderbook_settlement',
            referenceType: 'position',
            referenceId: row.position.id,
            idempotencyKey: `position_settlement:${row.position.id}`,
            description: 'Market resolved: fixed payout credited',
            metadata: {
              conditionId: row.position.condition_id,
              tokenId: row.position.token_id,
              payoutFraction: fraction,
            },
            entries,
          },
          tx,
        )
        transactionId = posted.transactionId
        credited++
      } else {
        zero++
      }
      await tx
        .update(positions)
        .set({ settled_payout: payout, settled_at: new Date(), settlement_tx_id: transactionId })
        .where(eq(positions.id, row.position.id))
    })
  }
  return { scanned: rows.length, credited, zero }
}

export async function listUserPositions(userId: string) {
  return db
    .select({
      position: positions,
      slug: markets.slug,
      isResolved: markets.is_resolved,
      outcomeText: outcomes.outcome_text,
    })
    .from(positions)
    .innerJoin(markets, eq(positions.condition_id, markets.condition_id))
    .innerJoin(outcomes, eq(positions.token_id, outcomes.token_id))
    .where(eq(positions.user_id, userId))
    .orderBy(sql`${positions.updated_at} DESC`)
    .limit(100)
}

export async function listUserOrders(
  userId: string,
  states?: Array<'pending' | 'filled' | 'rejected' | 'failed' | 'cancelled'>,
) {
  const where = states
    ? and(eq(user_orders.user_id, userId), inArray(user_orders.state, states))
    : eq(user_orders.user_id, userId)
  return db
    .select()
    .from(user_orders)
    .where(where)
    .orderBy(sql`${user_orders.created_at} DESC`)
    .limit(100)
}

export async function userHasLedgerProfile(userId: string) {
  const [row] = await db
    .select({ user_id: ledger_user_profiles.user_id })
    .from(ledger_user_profiles)
    .where(eq(ledger_user_profiles.user_id, userId))
    .limit(1)
  return Boolean(row)
}
