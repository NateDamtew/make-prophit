'use client'

/**
 * Compatibility shims for Reown AppKit hooks, backed by our AppKitContext +
 * wagmi. Only used in admin files that interact directly with on-chain
 * transactions.
 */

import { useChainId, useConnectorClient } from 'wagmi'
import { useAppKit } from '@/hooks/useAppKit'

export function useAppKitNetworkCore() {
  const chainId = useChainId()
  return { chainId }
}

export function useAppKitProvider<T = unknown>(_namespace: string) {
  const { isEmbedded } = useAppKit()
  const { data: connectorClient } = useConnectorClient()

  // Expose the connector's request function as an EIP-1193 provider shim.
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
