import { NextResponse } from 'next/server'
import { submitDepositWalletTransactionAction } from '@/app/[locale]/(platform)/_actions/approve-tokens'
import { DEFAULT_CHAIN_ID } from '@/lib/network'
import {
  buildWalletTransactionRequestPayload,
  getDepositWalletBatchTypedData,
} from '@/lib/wallet/transactions'
import { badRequest, buildStandardApprovalCalls, requireTmaUser } from '../_lib'

/**
 * POST /api/tma/approvals
 *
 * Body: { nonce, deadline, signature } from /prepare. Rebuilds the same Batch
 * typed data server-side (never trusts client calls), wraps it in the relayer
 * payload and submits — the relayer executes the approvals from the deposit
 * wallet and the action syncs the CLOB's collateral balance/allowance.
 */
export async function POST(request: Request) {
  const guard = await requireTmaUser()
  if (guard.unauthorized) {
    return guard.unauthorized
  }
  const user = guard.user as typeof guard.user & {
    deposit_wallet_address?: string | null
    deposit_wallet_status?: string | null
  }

  if (user.deposit_wallet_status !== 'deployed' || !user.deposit_wallet_address || !user.address) {
    return NextResponse.json(
      { error: 'Deposit wallet is not ready yet.', code: 'DEPOSIT_WALLET_NOT_DEPLOYED' },
      { status: 409 },
    )
  }

  let body: { nonce?: string, deadline?: string, signature?: string }
  try {
    body = await request.json()
  }
  catch {
    return badRequest('Invalid JSON body.')
  }
  if (!body.nonce || !body.deadline || !body.signature) {
    return badRequest('nonce, deadline and signature are required.')
  }
  const deadline = Number.parseInt(body.deadline, 10)
  if (!Number.isFinite(deadline)) {
    return badRequest('Invalid deadline.')
  }

  const typedData = getDepositWalletBatchTypedData({
    chainId: DEFAULT_CHAIN_ID,
    depositWallet: user.deposit_wallet_address as `0x${string}`,
    calls: buildStandardApprovalCalls(),
    nonce: body.nonce,
    deadline,
  })

  const payload = buildWalletTransactionRequestPayload({
    from: user.address,
    nonce: body.nonce,
    signature: body.signature,
    typedData,
  })

  const result = await submitDepositWalletTransactionAction(payload)
  if (result.error) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 400 })
  }

  return NextResponse.json({ data: result })
}
