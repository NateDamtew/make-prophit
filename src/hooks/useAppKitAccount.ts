'use client'

import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { useAccount, useChainId } from 'wagmi'

export function useAppKitAccount(_options?: { namespace?: string }) {
  const { primaryWallet } = useDynamicContext()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()

  const isEmbedded = Boolean(
    (primaryWallet?.connector as { isEmbeddedWallet?: boolean } | undefined)?.isEmbeddedWallet,
  )

  return {
    address,
    isConnected,
    chainId,
    embeddedWalletInfo: isEmbedded ? { accountType: 'eoa' as const } : undefined,
  }
}
