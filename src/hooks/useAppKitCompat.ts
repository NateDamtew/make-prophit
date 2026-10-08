'use client'

/**
 * Compatibility shims for Reown AppKit hooks, backed by our AppKitContext +
 * wagmi. Only used in admin files that interact directly with on-chain
 * transactions.
 */

import { useCallback } from 'react'
import { useChainId, useConnectorClient, useSwitchChain } from 'wagmi'

import { useAppKit } from '@/hooks/useAppKit'

export function useAppKitNetworkCore() {
  const chainId = useChainId()
  return { chainId }
}

/** Reown useAppKitNetwork shim: current chain plus a wagmi-backed switchNetwork. */
export function useAppKitNetwork() {
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const switchNetwork = useCallback(
    async (network: { id: number | string }) => {
      await switchChainAsync({ chainId: Number(network.id) })
    },
    [switchChainAsync],
  )

  return { chainId, switchNetwork }
}

interface AppKitConnectingWalletConnector {
  id?: string
  rdns?: string
  chain?: string
}

interface AppKitConnectingWallet {
  id?: string
  isInjected?: boolean
  connectors: AppKitConnectingWalletConnector[]
}

interface AppKitSwitchConnectionArgs {
  connection: {
    connectorId: string
    accounts: Array<{ address: string }>
  }
  address: string
}

/**
 * Reown multi-connection shim. Dynamic manages a single active wallet, so
 * there is no switchable connection list — switchConnection stays null and the
 * multi-wallet arbitrage switch-back path is skipped at its null guard.
 */
export function useAppKitConnection(_options?: { namespace?: string }) {
  return { switchConnection: null as ((args: AppKitSwitchConnectionArgs) => Promise<void>) | null }
}

/** Reown modal state shim: no Reown modal exists under Dynamic. */
export function useAppKitState() {
  return {
    open: false,
    initialized: true,
    loading: false,
    // Reown's per-project multi-wallet flag; always false under Dynamic, which
    // keeps the multi-wallet arbitrage connect flow disabled.
    multiWallet: false,
    connectingWallet: undefined as AppKitConnectingWallet | undefined,
  }
}

export function useAppKitProvider<T = unknown>(_namespace: string) {
  const { isEmbedded } = useAppKit()
  const { data: connectorClient } = useConnectorClient()

  // Expose the connector's request function as an EIP-1193 provider shim.
  const walletProvider = connectorClient?.transport
    ? ({
        request: async (args: { method: string; params?: unknown[] | object }) => {
          return (connectorClient.transport as any).request(args)
        },
      } as T)
    : undefined

  const walletProviderType = isEmbedded ? ('AUTH' as const) : ('INJECTED' as const)

  return { walletProvider, walletProviderType }
}
