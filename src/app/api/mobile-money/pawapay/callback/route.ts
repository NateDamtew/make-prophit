import { NextResponse } from 'next/server'

import { CALLBACK_MAX_BODY_BYTES, processPawaPayCallback } from '@/lib/mobile-money/callbacks'

/**
 * pawaPay deposit/payout callback endpoint. Register this URL in the pawaPay
 * dashboard (sandbox and production separately) and enable signed callbacks:
 *   https://<host>/api/mobile-money/pawapay/callback
 */
export async function POST(request: Request) {
  let raw: Uint8Array
  try {
    const declaredLength = Number(request.headers.get('content-length') || '0')
    if (declaredLength > CALLBACK_MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large.' }, { status: 413 })
    }
    raw = new Uint8Array(await request.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 })
  }

  try {
    const outcome = await processPawaPayCallback(request, raw)
    return NextResponse.json(outcome.body, { status: outcome.status })
  } catch (error) {
    console.error('[mobile-money] callback processing crashed', error)
    // 500 makes pawaPay retry, which is what we want for transient DB errors.
    return NextResponse.json({ error: 'Callback could not be processed.' }, { status: 500 })
  }
}
