import { NextResponse } from 'next/server'
import { getDepositWalletAddress, isDepositWalletDeployed } from '@/lib/deposit-wallet'
import { normalizeAddress } from '@/lib/wallet'
import { requireTmaUser } from '../_lib'

/**
 * GET /api/tma/trading-status
 *
 * Trading readiness snapshot for the authenticated user: wallet address,
 * deposit wallet address/status, and whether trading auth looks provisioned.
 */
export async function GET() {
  const { user, unauthorized } = await requireTmaUser()
  if (!user) {
    return unauthorized
  }

  const address = user.address ? normalizeAddress(user.address) : null

  let depositWalletAddress: string | null = null
  let depositWalletDeployed = false
  if (address) {
    try {
      depositWalletAddress = await getDepositWalletAddress(address as `0x${string}`)
      depositWalletDeployed = await isDepositWalletDeployed(depositWalletAddress as `0x${string}`)
    }
    catch (error) {
      console.error('[tma/trading-status] deposit wallet lookup failed', error)
    }
  }

  const settings = (user as { settings?: Record<string, any> }).settings ?? {}
  const tradingAuthSettings = settings.trading_auth ?? settings.tradingAuth ?? {}

  return NextResponse.json({
    address,
    depositWallet: {
      address: depositWalletAddress,
      status: (user as any).deposit_wallet_status ?? 'not_started',
      txHash: (user as any).deposit_wallet_tx_hash ?? null,
      deployed: depositWalletDeployed,
    },
    tradingAuth: {
      hasClobCredentials: Boolean(tradingAuthSettings.clob),
      hasRelayerCredentials: Boolean(tradingAuthSettings.relayer),
      approvalsCompleted: Boolean(tradingAuthSettings.approvals?.completed),
    },
  })
}
