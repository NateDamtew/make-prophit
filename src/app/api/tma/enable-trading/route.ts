import { NextResponse } from 'next/server'
import { enableTradingAuthAction } from '@/app/[locale]/(platform)/_actions/deposit-wallet'
import { badRequest } from '../_lib'

/**
 * POST /api/tma/enable-trading
 *
 * Body: { signature, timestamp, nonce } — the ClobAuth EIP-712 signature
 * (domain ClobAuthDomain v1 on the app chain) produced by the user's wallet.
 * Wraps enableTradingAuthAction: derives per-user CLOB + relayer credentials
 * and binds the L2 auth context cookie to this response.
 */
export async function POST(request: Request) {
  let body: { signature?: string, timestamp?: string, nonce?: string }
  try {
    body = await request.json()
  }
  catch {
    return badRequest('Invalid JSON body.')
  }

  if (!body.signature || !body.timestamp || !body.nonce) {
    return badRequest('signature, timestamp and nonce are required.')
  }

  const result = await enableTradingAuthAction({
    signature: body.signature,
    timestamp: body.timestamp,
    nonce: body.nonce,
  })

  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? 'Could not enable trading.' }, { status: 400 })
  }

  return NextResponse.json({ data: result.data })
}
