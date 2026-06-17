'use client'

import { useAccount, useChainId } from 'wagmi'
import { useAppKit } from '@/hooks/useAppKit'

export function useAppKitAccount(_options?: { namespace?: string }) {
  const { isEmbedded } = useAppKit()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()

  return {
    address,
    isConnected,
    chainId,
    embeddedWalletInfo: isEmbedded ? { accountType: 'eoa' as const } : undefined,
  }
}
