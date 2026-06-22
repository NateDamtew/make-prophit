import { NextResponse } from 'next/server'
import { mintDynamicTelegramToken, probeDynamicTelegramSignin } from '@/lib/tma/dynamic-token'
import { validateTelegramInitData } from '@/lib/tma/validate'

/**
 * Mints a Dynamic-compatible `telegramAuthToken` from a validated Telegram
 * Mini App `initData`, so the client can call Dynamic's `telegramSignIn()` and
 * get an auto-created embedded EVM wallet — without us running a bot server.
 */
export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    return NextResponse.json({ error: 'TMA auth is not configured' }, { status: 500 })
  }

  try {
    const { initData } = await request.json()
    if (!initData || typeof initData !== 'string') {
      return NextResponse.json({ error: 'Missing initData' }, { status: 400 })
    }

    const data = await validateTelegramInitData(initData)
    if (!data) {
      return NextResponse.json({ error: 'Invalid or expired initData' }, { status: 401 })
    }

    const telegramAuthToken = mintDynamicTelegramToken({ user: data.user, botToken })

    // Diagnostic: call Dynamic's /telegram/signin endpoint directly with the JWT
    // — the exact call the SDK makes — to capture its real validation error
    // (the SDK only surfaces a generic "signin_error").
    let probe: { status: number, body: string } | null = null
    const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENV_ID
    if (environmentId) {
      probe = await probeDynamicTelegramSignin({ environmentId, telegramAuthToken })
        .catch((caught: unknown): { status: number, body: string } => ({ status: 0, body: String(caught) }))
    }

    return NextResponse.json({ telegramAuthToken, probe })
  }
  catch (error) {
    console.error('TMA dynamic-token failed:', error)
    return NextResponse.json({ error: 'Failed to mint token' }, { status: 500 })
  }
}
