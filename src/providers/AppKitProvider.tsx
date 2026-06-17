'use client'

import type { Wallet } from '@dynamic-labs/sdk-react-core'
import type { ReactNode } from 'react'
import type { Config } from 'wagmi'
import type { User } from '@/types'
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum'
import { DynamicContextProvider, useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector'
import { generateRandomString } from 'better-auth/crypto'
import { useExtracted } from 'next-intl'
import { Component, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { createSiweMessage } from 'viem/siwe'
import { WagmiProvider } from 'wagmi'
import { signMessage } from 'wagmi/actions'
import { SignaturePromptHost } from '@/components/SignaturePromptHost'
import { AppKitContext } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { usePublicRuntimeConfig } from '@/hooks/usePublicRuntimeConfig'
import { createDynamicWagmiConfig, defaultNetwork } from '@/lib/appkit'
import { authClient } from '@/lib/auth-client'
import { IS_BROWSER } from '@/lib/constants'
import { clearBrowserStorage, clearNonHttpOnlyCookies } from '@/lib/utils'
import { mergeSessionUserState, useUser } from '@/stores/useUser'

// Stable wagmi config — created once per module load.
const wagmiConfig = createDynamicWagmiConfig()
const activeWagmiConfig: Config = wagmiConfig

function getConnectedAccount(): { address: `0x${string}` | undefined, chainId: number } {
  const state = activeWagmiConfig?.state
  const current = state?.current
  const connection = current ? state.connections.get(current) : undefined
  const address = connection?.accounts?.[0]
  const chainId = connection?.chainId ?? state?.chainId ?? defaultNetwork.id
  return { address, chainId }
}

function clearWalletState() {
  if (!IS_BROWSER) {
    return
  }
  clearBrowserStorage()
  clearNonHttpOnlyCookies()
}

async function isCurrentRegionBlocked() {
  try {
    const response = await fetch('/api/geoblock-status', {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })
    if (!response.ok) {
      return false
    }
    const payload = await response.json() as { blocked?: boolean }
    return payload?.blocked === true
  }
  catch {
    return false
  }
}

/**
 * Drives the better-auth SIWE handshake after Dynamic reports a connected
 * wallet. Uses the wallet's actual connected chainId for both nonce and verify
 * so the server-side nonce key matches (see CLAUDE.md — never force a chain
 * switch for sign-in).
 */
async function driveSIWEHandshake(primaryWallet: Wallet, siteUrl: string) {
  const address = primaryWallet.address as `0x${string}` | undefined
  if (!address) {
    return
  }

  const { chainId } = getConnectedAccount()

  try {
    const session = await authClient.getSession()
    const sessionAddress = (session?.data?.user as any)?.address as string | undefined
    if (sessionAddress?.toLowerCase() === address.toLowerCase()) {
      const user = session.data?.user
      if (user) {
        useUser.setState(previous => mergeSessionUserState(previous, user as unknown as User))
      }
      return
    }
  }
  catch {
    // no session yet — continue
  }

  try {
    const { data: nonceData } = await authClient.siwe.nonce({ walletAddress: address, chainId })
    const nonce = nonceData?.nonce || generateRandomString(32)

    const message = createSiweMessage({
      domain: new URL(siteUrl).host,
      address,
      statement: 'Please sign with your account',
      uri: typeof window !== 'undefined' ? window.location.origin : siteUrl,
      version: '1',
      chainId,
      nonce,
    })

    const signature = await signMessage(activeWagmiConfig, { message })

    const { data: verifyData } = await authClient.siwe.verify({
      message,
      signature,
      walletAddress: address,
      chainId,
    })

    if (verifyData?.success) {
      const session = await authClient.getSession()
      const user = session?.data?.user
      if (user) {
        useUser.setState(previous => mergeSessionUserState(previous, user as unknown as User))
      }
    }
  }
  catch (error) {
    console.warn('[SIWE] Handshake failed', error)
  }
}

/**
 * Tags any error thrown inside the Dynamic provider subtree with a clear,
 * greppable prefix and re-throws so the root boundary still handles it. Makes
 * production wallet-stack failures identifiable in the console at a glance.
 */
class DynamicErrorBoundary extends Component<{ children: ReactNode }> {
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[AppKitProvider] Dynamic provider crashed:', error.message, info.componentStack)
  }

  render() {
    return this.props.children
  }
}

function AppKitBridge({
  children,
  regionBlockedMessage,
  hasAuthenticatedUser,
}: {
  children: ReactNode
  regionBlockedMessage: string
  hasAuthenticatedUser: boolean
}) {
  const { setShowAuthFlow } = useDynamicContext()

  const value = useMemo(() => ({
    open: async () => {
      if (!hasAuthenticatedUser && await isCurrentRegionBlocked()) {
        toast.warning(regionBlockedMessage)
        return
      }
      setShowAuthFlow(true)
    },
    close: async () => {
      setShowAuthFlow(false)
    },
    isReady: true,
  }), [hasAuthenticatedUser, regionBlockedMessage, setShowAuthFlow])

  return <AppKitContext value={value}>{children}</AppKitContext>
}

export default function AppKitProvider({ children }: { children: ReactNode }) {
  const t = useExtracted()
  const { dynamicEnvId, siteUrl } = usePublicRuntimeConfig()
  const hasHydrated = useHasHydrated()
  const currentUser = useUser()

  // Diagnostics: runs above the Dynamic subtree, so it logs even when that
  // subtree crashes. Confirms the env id actually reached the client bundle.
  useEffect(() => {
    console.info('[AppKitProvider] init — dynamicEnvId:', dynamicEnvId || '(MISSING)')
  }, [dynamicEnvId])

  const settings = useMemo(() => ({
    environmentId: dynamicEnvId,
    walletConnectors: [EthereumWalletConnectors],
    events: {
      onAuthSuccess: async ({ primaryWallet }: { primaryWallet: Wallet | null }) => {
        if (primaryWallet) {
          await driveSIWEHandshake(primaryWallet, siteUrl)
        }
      },
      onLogout: () => {
        clearWalletState()
        useUser.setState(null)
        window.location.reload()
      },
    },
  }), [dynamicEnvId, siteUrl])

  return (
    <DynamicErrorBoundary>
      <DynamicContextProvider settings={settings}>
        <WagmiProvider config={wagmiConfig}>
          <DynamicWagmiConnector>
            <AppKitBridge
              regionBlockedMessage={t('This platform is not currently available in your region.')}
              hasAuthenticatedUser={Boolean(currentUser?.id)}
            >
              {children}
              {hasHydrated && <SignaturePromptHost />}
            </AppKitBridge>
          </DynamicWagmiConnector>
        </WagmiProvider>
      </DynamicContextProvider>
    </DynamicErrorBoundary>
  )
}
