import type { Outcome } from '@/types'
import { NextResponse } from 'next/server'
import { getExchangeEip712Domain, ORDER_SIDE, ORDER_TYPE } from '@/lib/constants'
import { getDepositWalletAddress, isDepositWalletDeployed } from '@/lib/deposit-wallet'
import { buildOrderPayload } from '@/lib/orders'
import { normalizeAddress } from '@/lib/wallet'
import { badRequest, buildSignableEnvelope, requireTmaUser, serializeOrder } from '../../_lib'

interface PrepareBody {
  tokenId?: string
  side?: 'buy' | 'sell'
  orderType?: 'market' | 'limit'
  amount?: string
  limitPrice?: string
  limitShares?: string
  marketPriceCents?: number
  negRisk?: boolean
}

/**
 * POST /api/tma/orders/prepare
 *
 * Builds the order (all amount math server-side via lib/orders) and returns
 * the exact EIP-712 TypedDataSign envelope for the client wallet to sign,
 * plus the serialized order to echo back on submit. No signing, no state.
 */
export async function POST(request: Request) {
  const { user, unauthorized } = await requireTmaUser()
  if (!user) {
    return unauthorized
  }

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

  const depositWalletAddress = await getDepositWalletAddress(address as `0x${string}`)
  const deployed = await isDepositWalletDeployed(depositWalletAddress as `0x${string}`)
  if (!deployed) {
    return NextResponse.json(
      { error: 'Deposit wallet is not deployed yet.', code: 'DEPOSIT_WALLET_NOT_DEPLOYED' },
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

  const domain = getExchangeEip712Domain(Boolean(body.negRisk))

  return NextResponse.json({
    order: serializeOrder(payload),
    typedData: buildSignableEnvelope(payload, domain as Record<string, unknown>),
    negRisk: Boolean(body.negRisk),
  })
}
