'use server'

import { UserRepository } from '@/lib/db/queries/user'
import { isHouseTradingConfigured } from '@/lib/house/config'
import { HouseOrderError, listUserOrders, listUserPositions, placeHouseBuy, quoteHouseBuy } from '@/lib/house/orders'
import { parseAmountToMinorUnits } from '@/lib/pawapay/amounts'

/**
 * Order-book trading for ledger users through the house account. The order
 * panel calls `quote` as the user types and `place` on confirm; the quote
 * carries the fixed local payout the user will see.
 */

const NOT_SIGNED_IN = 'You must be signed in.'

function serializeQuote(quote: Awaited<ReturnType<typeof quoteHouseBuy>>) {
  return {
    conditionId: quote.conditionId,
    tokenId: quote.tokenId,
    outcomeIndex: quote.outcomeIndex,
    currency: quote.currency,
    localStake: quote.localStake.toString(),
    sharesMicro: quote.sharesMicro.toString(),
    fixedLocalPayout: quote.fixedLocalPayout.toString(),
    priceCents: quote.priceCents,
  }
}

export async function isHouseTradingAvailableAction() {
  return { data: { available: isHouseTradingConfigured() }, error: null }
}

export async function quoteLedgerBuyAction(input: {
  conditionId: string
  outcomeIndex: number
  amountInput: string
  priceCents: number
}) {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  try {
    const localStake = parseAmountToMinorUnits(input.amountInput)
    const quote = await quoteHouseBuy({
      userId: user.id,
      conditionId: input.conditionId,
      outcomeIndex: input.outcomeIndex,
      localStake,
      priceCents: input.priceCents,
    })
    return { data: serializeQuote(quote), error: null }
  } catch (error) {
    if (error instanceof HouseOrderError) {
      return { data: null, error: error.message }
    }
    return { data: null, error: 'Please enter a valid amount.' }
  }
}

export async function placeLedgerBuyAction(input: {
  conditionId: string
  outcomeIndex: number
  amountInput: string
  priceCents: number
}) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  try {
    const localStake = parseAmountToMinorUnits(input.amountInput)
    const result = await placeHouseBuy({
      userId: user.id,
      conditionId: input.conditionId,
      outcomeIndex: input.outcomeIndex,
      localStake,
      priceCents: input.priceCents,
    })
    return {
      data: { userOrderId: result.userOrderId, clobOrderId: result.clobOrderId, quote: serializeQuote(result.quote) },
      error: null,
    }
  } catch (error) {
    if (error instanceof HouseOrderError) {
      return { data: null, error: error.message }
    }
    console.error('[house] place order failed', error)
    return { data: null, error: 'Could not place your order right now. Please try again.' }
  }
}

export async function getLedgerPortfolioAction() {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  try {
    const [positionsRows, orders] = await Promise.all([listUserPositions(user.id), listUserOrders(user.id)])
    return {
      data: {
        positions: positionsRows.map((row) => ({
          id: row.position.id,
          conditionId: row.position.condition_id,
          slug: row.slug,
          outcome: row.outcomeText,
          currency: row.position.currency,
          sharesMicro: row.position.shares_micro.toString(),
          localStake: row.position.local_stake.toString(),
          fixedLocalPayout: row.position.fixed_local_payout.toString(),
          settledPayout: row.position.settled_payout?.toString() ?? null,
          settledAt: row.position.settled_at?.toISOString() ?? null,
          isResolved: row.isResolved,
        })),
        orders: orders.map((order) => ({
          id: order.id,
          conditionId: order.condition_id,
          side: order.side,
          state: order.state,
          currency: order.currency,
          localStake: order.local_stake.toString(),
          fixedLocalPayout: order.fixed_local_payout.toString(),
          priceCents: order.price_cents,
          failureMessage: order.failure_message,
          createdAt: order.created_at.toISOString(),
        })),
      },
      error: null,
    }
  } catch (error) {
    console.error('[house] portfolio failed', error)
    return { data: null, error: 'Could not load your positions right now.' }
  }
}
