import { NextResponse } from 'next/server'
import { getDepositWalletNonceAction } from '@/app/[locale]/(platform)/_actions/approve-tokens'
import { DEFAULT_CHAIN_ID } from '@/lib/network'
import { getDepositWalletBatchTypedData } from '@/lib/wallet/transactions'
import { buildStandardApprovalCalls, requireTmaUser } from '../../_lib'

/**
 * POST /api/tma/approvals/prepare
 *
 * Returns the DepositWallet Batch EIP-712 typed data covering the standard
 * token approvals, for the user's EOA to sign. Echo nonce + deadline back to
 * POST /api/tma/approvals with the signature.
 */
export async function POST() {
  const guard = await requireTmaUser()
  if (guard.unauthorized) {
    return guard.unauthorized
  }
  const user = guard.user as typeof guard.user & {
    deposit_wallet_address?: string | null
    deposit_wallet_status?: string | null
  }

  if (user.deposit_wallet_status !== 'deployed' || !user.deposit_wallet_address) {
    return NextResponse.json(
      { error: 'Deposit wallet is not ready yet.', code: 'DEPOSIT_WALLET_NOT_DEPLOYED' },
      { status: 409 },
    )
  }

  const nonceResult = await getDepositWalletNonceAction()
  if (nonceResult.error || !nonceResult.nonce) {
    return NextResponse.json(
      { error: nonceResult.error ?? 'Could not get a wallet nonce.', code: nonceResult.code },
      { status: 502 },
    )
  }

  const calls = buildStandardApprovalCalls()
  const typedData = getDepositWalletBatchTypedData({
    chainId: DEFAULT_CHAIN_ID,
    depositWallet: user.deposit_wallet_address as `0x${string}`,
    calls,
    nonce: nonceResult.nonce,
  })

  return NextResponse.json({
    nonce: nonceResult.nonce,
    deadline: typedData.depositWalletParams.deadline,
    callsCount: calls.length,
    typedData: {
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: {
        wallet: typedData.message.wallet,
        nonce: typedData.message.nonce.toString(),
        deadline: typedData.message.deadline.toString(),
        calls: typedData.message.calls.map(call => ({
          target: call.target,
          value: call.value.toString(),
          data: call.data,
        })),
      },
    },
  })
}
