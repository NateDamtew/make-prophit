import type { SerializedOrder } from '../_lib'
import type { CLOB_ORDER_TYPE } from '@/lib/constants'
import type { OrderType } from '@/types'
import { NextResponse } from 'next/server'
import { wrapTypedDataSignature } from 'viem/experimental/erc7739'
import { EIP712_TYPES, getExchangeEip712Domain, ORDER_TYPE } from '@/lib/constants'
import { submitOrder } from '@/lib/orders'
import { badRequest, buildOrderMessage, deserializeOrder, findMarketByTokenId, requireTmaUser } from '../_lib'

interface SubmitBody {
  order?: SerializedOrder
  signature?: string
  orderType?: 'market' | 'limit'
  clobOrderType?: keyof typeof CLOB_ORDER_TYPE
}

/**
 * POST /api/tma/orders
 *
 * Body: the serialized order from /prepare + the RAW TypedDataSign signature
 * from the client wallet. Wraps the signature (ERC-7739) server-side and
 * submits through the same path the web app uses (store-order: per-user CLOB
 * auth, HMAC, submission, DB, error mapping).
 */
export async function POST(request: Request) {
  const guard = await requireTmaUser()
  if (guard.unauthorized) {
    return guard.unauthorized
  }

  let body: SubmitBody
  try {
    body = await request.json()
  }
  catch {
    return badRequest('Invalid JSON body.')
  }

  if (!body.order || !body.signature) {
    return badRequest('order and signature are required.')
  }

  const order = deserializeOrder(body.order)

  // Market facts come from the DB via the order's own token — the client
  // can't submit for a market that doesn't match what it signed.
  const market = await findMarketByTokenId(order.token_id.toString())
  if (!market) {
    return NextResponse.json({ error: 'Unknown market token.' }, { status: 404 })
  }
  const domain = getExchangeEip712Domain(market.negRisk)

  let wrappedSignature: `0x${string}`
  try {
    wrappedSignature = wrapTypedDataSignature({
      domain,
      types: EIP712_TYPES,
      primaryType: 'Order',
      message: buildOrderMessage(order),
      signature: body.signature as `0x${string}`,
    })
  }
  catch (error) {
    console.error('[tma/orders] signature wrap failed', error)
    return badRequest('Invalid signature.')
  }

  const result = await submitOrder({
    order,
    signature: wrappedSignature,
    orderType: (body.orderType === 'limit' ? ORDER_TYPE.LIMIT : ORDER_TYPE.MARKET) as OrderType,
    clobOrderType: body.clobOrderType,
    conditionId: market.conditionId,
    slug: market.slug,
  })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ data: { orderId: result.orderId } })
}
