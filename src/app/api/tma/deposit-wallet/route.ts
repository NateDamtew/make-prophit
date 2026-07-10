import { NextResponse } from 'next/server'
import { createDepositWalletAction } from '@/app/[locale]/(platform)/_actions/deposit-wallet'

/**
 * POST /api/tma/deposit-wallet
 *
 * Wraps createDepositWalletAction: submits WALLET-CREATE to the relayer with
 * platform keys for the authenticated user (idempotent — returns current
 * status if already deploying/deployed).
 */
export async function POST() {
  const result = await createDepositWalletAction()

  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? 'Could not create deposit wallet.' }, { status: 400 })
  }

  return NextResponse.json({ data: result.data })
}
