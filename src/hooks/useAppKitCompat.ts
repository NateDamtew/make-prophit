'use client'

/**
 * Compatibility shims for Reown AppKit hooks, backed by Dynamic + wagmi.
 * Only used in admin files that interact directly with on-chain transactions.
 */

import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { useChainId, useConnectorClient } from 'wagmi'

export function useAppKitNetworkCore() {
  const chainId = useChainId()
  return { chainId }
}

export function useAppKitProvider<T = unknown>(_namespace: string) {
  const { primaryWallet } = useDynamicContext()
  const { data: connectorClient } = useConnectorClient()

  const isEmbedded = Boolean(
    (primaryWallet?.connector as { isEmbeddedWallet?: boolean } | undefined)?.isEmbeddedWallet,
  )

  const walletProvider = connectorClient?.transport
    ? ({
        request: async (args: { method: string, params?: unknown[] | object }) => {
          return (connectorClient.transport as any).request(args)
        },
      } as T)
    : undefined

  const walletProviderType = isEmbedded ? ('AUTH' as const) : ('INJECTED' as const)

  return { walletProvider, walletProviderType }
}
