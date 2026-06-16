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
import { useTheme } from 'next-themes'
import { useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { createSiweMessage } from 'viem/siwe'
import { WagmiProvider } from 'wagmi'
import { signMessage } from 'wagmi/actions'
import { SignaturePromptHost } from '@/components/SignaturePromptHost'
import { AppKitContext } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { usePublicRuntimeConfig } from '@/hooks/usePublicRuntimeConfig'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import { createDynamicWagmiConfig, defaultNetwork } from '@/lib/appkit'
import { authClient } from '@/lib/auth-client'
import { IS_BROWSER } from '@/lib/constants'
import { clearBrowserStorage, clearNonHttpOnlyCookies } from '@/lib/utils'
import { mergeSessionUserState, useUser } from '@/stores/useUser'

// Stable wagmi config — created once per module load
const wagmiConfig = createDynamicWagmiConfig()

// Module-level reference so SIWE callbacks can read wagmi state outside React
let activeWagmiConfig: Config = wagmiConfig

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

async function driveSIWEHandshake(primaryWallet: Wallet, siteUrl: string) {
  const address = primaryWallet.address as `0x${string}` | undefined
  if (!address) {
    return
  }

  const { chainId } = getConnectedAccount()

  // Skip if better-auth session already exists for this address
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
    // continue — no session yet
  }

  try {
    // Get nonce keyed by address + chainId so verify can find the same key
    const { data: nonceData } = await authClient.siwe.nonce({ walletAddress: address, chainId })
    const nonce = nonceData?.nonce || generateRandomString(32)

    const domain = new URL(siteUrl).host
    const message = createSiweMessage({
      domain,
      address,
      statement: 'Please sign with your account',
      uri: typeof window !== 'undefined' ? window.location.origin : siteUrl,
      version: '1',
      chainId,
      nonce,
    })

    // Sign using wagmi action (works outside React, no hook needed)
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

function DynamicThemeSynchronizer() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!IS_BROWSER) {
      return
    }
    const root = document.documentElement
    root.setAttribute('data-dynamic-theme', resolvedTheme === 'dark' ? 'dark' : 'light')
  }, [resolvedTheme])

  return null
}

function DynamicAppKitBridge({
  children,
  regionBlockedMessage,
  hasAuthenticatedUser,
}: {
  children: ReactNode
  regionBlockedMessage: string
  hasAuthenticatedUser: boolean
}) {
  const { setShowAuthFlow } = useDynamicContext()

  const appKitValue = useMemo(() => ({
    open: async (_options?: { view?: string }) => {
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

  return (
    <AppKitContext value={appKitValue}>
      {children}
    </AppKitContext>
  )
}

export default function AppKitProvider({ children }: { children: ReactNode }) {
  const t = useExtracted()
  const site = useSiteIdentity()
  const { dynamicEnvId, siteUrl } = usePublicRuntimeConfig()
  const hasHydrated = useHasHydrated()
  const currentUser = useUser()
  const { resolvedTheme } = useTheme()
  const themeMode: 'light' | 'dark' = resolvedTheme === 'dark' ? 'dark' : 'light'

  activeWagmiConfig = wagmiConfig

  const dynamicSettings = useMemo(() => ({
    environmentId: dynamicEnvId || 'placeholder',
    walletConnectors: [EthereumWalletConnectors],
    appName: site.name,
    appLogoUrl: site.logoUrl,
    initialAuthenticationMode: 'connect-and-sign' as const,
    overrides: {
      evmNetworks: [
        {
          blockExplorerUrls: [defaultNetwork.blockExplorers?.default.url ?? 'https://polygonscan.com'],
          chainId: defaultNetwork.id,
          iconUrls: [],
          name: defaultNetwork.name,
          nativeCurrency: defaultNetwork.nativeCurrency,
          networkId: defaultNetwork.id,
          rpcUrls: [...defaultNetwork.rpcUrls.default.http],
          vanityName: defaultNetwork.name,
        },
      ],
    },
    events: {
      onAuthSuccess: async ({ primaryWallet }: { primaryWallet: Wallet | null }) => {
        if (!primaryWallet) {
          return
        }

        await driveSIWEHandshake(primaryWallet, siteUrl)
      },
      onLogout: () => {
        clearWalletState()
        useUser.setState(null)
        window.location.reload()
      },
    },
  }), [dynamicEnvId, site.logoUrl, site.name, siteUrl])

  return (
    <DynamicContextProvider theme={themeMode} settings={dynamicSettings}>
      <WagmiProvider config={wagmiConfig}>
        <DynamicWagmiConnector>
          <DynamicAppKitBridge
            regionBlockedMessage={t('This platform is not currently available in your region.')}
            hasAuthenticatedUser={Boolean(currentUser?.id)}
          >
            {children}
            {hasHydrated && <SignaturePromptHost />}
            <DynamicThemeSynchronizer />
          </DynamicAppKitBridge>
        </DynamicWagmiConnector>
      </WagmiProvider>
    </DynamicContextProvider>
  )
}
