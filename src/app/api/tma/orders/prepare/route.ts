import type { Outcome } from '@/types'
import { NextResponse } from 'next/server'
import { getExchangeEip712Domain, ORDER_SIDE, ORDER_TYPE } from '@/lib/constants'
import { getDepositWalletAddress } from '@/lib/deposit-wallet'
import { buildOrderPayload } from '@/lib/orders'
import { normalizeAddress } from '@/lib/wallet'
import { badRequest, buildSignableEnvelope, findMarketByTokenId, requireTmaUser, serializeOrder } from '../../_lib'

interface PrepareBody {
  tokenId?: string
  side?: 'buy' | 'sell'
  orderType?: 'market' | 'limit'
  amount?: string
  limitPrice?: string
  limitShares?: string
  marketPriceCents?: number
}

/**
 * POST /api/tma/orders/prepare
 *
 * Builds the order (all amount math server-side via lib/orders) and returns
 * the exact EIP-712 TypedDataSign envelope for the client wallet to sign,
 * plus the serialized order to echo back on submit. No signing, no state.
 */
export async function POST(request: Request) {
  const guard = await requireTmaUser()
  if (guard.unauthorized) {
    return guard.unauthorized
  }
  const user = guard.user

  let body: PrepareBody
  try {
    body = await request.json()
  }
  catch {
    return badRequest('Invalid JSON body.')
  }

  if (!body.tokenId || !/^\d+$/.test(body.tokenId)) {
    return badRequest('tokenId is required.')
  }
  if (body.side !== 'buy' && body.side !== 'sell') {
    return badRequest('side must be buy or sell.')
  }
  const orderType = body.orderType === 'limit' ? ORDER_TYPE.LIMIT : ORDER_TYPE.MARKET

  const address = user.address ? normalizeAddress(user.address) : null
  if (!address) {
    return badRequest('User has no wallet address.')
  }

  // Gate on the relayer-reported DB status, like the web app does — NOT live
  // public-chain bytecode: KUEST's test relayer reports WALLET-CREATE as
  // mined while nothing lands on public Amoy (their test stack settles on a
  // chain we can't see), so a bytecode check would 409 forever.
  const depositWalletAddress
    = (user as { deposit_wallet_address?: string | null }).deposit_wallet_address
      ?? await getDepositWalletAddress(address as `0x${string}`)
  const dbStatus = (user as { deposit_wallet_status?: string | null }).deposit_wallet_status
  if (dbStatus !== 'deployed') {
    return NextResponse.json(
      { error: 'Deposit wallet is not ready yet.', code: 'DEPOSIT_WALLET_NOT_DEPLOYED' },
      { status: 409 },
    )
  }

  // Derive market facts server-side — the TMA client only knows the token id.
  const market = await findMarketByTokenId(body.tokenId)
  if (!market) {
    return NextResponse.json({ error: 'Unknown market token.' }, { status: 404 })
  }
  if (!market.isActive || market.isResolved) {
    return NextResponse.json(
      { error: 'This market is not accepting orders.', code: 'MARKET_NOT_ACTIVE' },
      { status: 409 },
    )
  }

  const payload = buildOrderPayload({
    outcome: { token_id: body.tokenId } as unknown as Outcome,
    makerAddress: depositWalletAddress as `0x${string}`,
    side: body.side === 'buy' ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
    orderType,
    amount: body.amount ?? '0',
    limitPrice: body.limitPrice ?? '0',
    limitShares: body.limitShares ?? '0',
    marketPriceCents: body.marketPriceCents,
  })

  const domain = getExchangeEip712Domain(market.negRisk)

  return NextResponse.json({
    order: serializeOrder(payload),
    typedData: buildSignableEnvelope(payload, domain as Record<string, unknown>),
    negRisk: market.negRisk,
    conditionId: market.conditionId,
    marketSlug: market.slug,
  })
}
