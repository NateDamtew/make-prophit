'use client'

import type { Wallet } from '@dynamic-labs/sdk-react-core'
import type { ReactNode } from 'react'
import type { Config } from 'wagmi'
import type { AppKitValue } from '@/hooks/useAppKit'
import type { User } from '@/types'
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum'
import { DynamicContextProvider, useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector'
import { generateRandomString } from 'better-auth/crypto'
import { useExtracted } from 'next-intl'
import { Component, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createSiweMessage } from 'viem/siwe'
import { WagmiProvider } from 'wagmi'
import { SignaturePromptHost } from '@/components/SignaturePromptHost'
import { AppKitContext, defaultAppKitValue } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { useIsTma } from '@/hooks/useIsTma'
import { usePublicRuntimeConfig } from '@/hooks/usePublicRuntimeConfig'
import { createDynamicWagmiConfig, defaultNetwork } from '@/lib/appkit'
import { authClient } from '@/lib/auth-client'
import { IS_BROWSER } from '@/lib/constants'
import { signOutAndRedirect } from '@/lib/logout'
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

function isEmbeddedWallet(wallet: Wallet | null): boolean {
  return Boolean((wallet?.connector as { isEmbeddedWallet?: boolean } | undefined)?.isEmbeddedWallet)
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

    // Sign with the wallet itself (not the wagmi action) so this works for
    // embedded/social wallets too — at onAuthSuccess they aren't wired into
    // wagmi yet, but Dynamic's Wallet can always sign.
    const signature = await primaryWallet.signMessage(message)
    if (!signature) {
      console.warn('[SIWE] wallet returned no signature')
      return
    }

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
    console.warn('[SIWE] handshake failed:', error)
  }
}

/**
 * Tags any error thrown inside the Dynamic provider subtree with a clear,
 * greppable prefix so production wallet-stack failures are identifiable.
 */
class DynamicErrorBoundary extends Component<{ children: ReactNode }> {
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[AppKitProvider] Dynamic provider crashed:', error.message, info.componentStack)
  }

  render() {
    return this.props.children
  }
}

/**
 * The single place that touches Dynamic hooks. Reads Dynamic + wagmi state and
 * publishes it through our own AppKitContext, so every other consumer in the
 * app reads a stable context (with safe SSR defaults) and never calls Dynamic
 * hooks directly. This lets us mount Dynamic client-only without consumers
 * throwing during SSR / first paint.
 */
function AppKitBridge({
  children,
  regionBlockedMessage,
  hasAuthenticatedUser,
}: {
  children: ReactNode
  regionBlockedMessage: string
  hasAuthenticatedUser: boolean
}) {
  const { setShowAuthFlow, handleLogOut, primaryWallet, user: dynamicUser } = useDynamicContext()

  const value = useMemo<AppKitValue>(() => ({
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
    isEmbedded: isEmbeddedWallet(primaryWallet),
    walletName: primaryWallet?.connector?.name ?? undefined,
    walletEmail: typeof dynamicUser?.email === 'string' ? dynamicUser.email : undefined,
    // Log out of BOTH layers: Dynamic (wallet) and better-auth (our session).
    // Dynamic's handleLogOut alone leaves the better-auth cookie alive, so the
    // user stays logged in after reload — signOutAndRedirect kills it + redirects.
    logout: async () => {
      try {
        await handleLogOut()
      }
      catch {
        // ignore — still clear better-auth below
      }
      await signOutAndRedirect({ currentPathname: IS_BROWSER ? window.location.pathname : '/' })
    },
  }), [hasAuthenticatedUser, regionBlockedMessage, setShowAuthFlow, handleLogOut, primaryWallet, dynamicUser?.email])

  return <AppKitContext value={value}>{children}</AppKitContext>
}

/**
 * Pre-hydration context: wallet stack is inert, logout still works via
 * better-auth. Lets the page render server-side without mounting Dynamic.
 */
const ssrAppKitValue: AppKitValue = {
  ...defaultAppKitValue,
  logout: async () => {
    await signOutAndRedirect({ currentPathname: IS_BROWSER ? window.location.pathname : '/' })
  },
}

export default function AppKitProvider({ children }: { children: ReactNode }) {
  const t = useExtracted()
  const { dynamicEnvId, siteUrl } = usePublicRuntimeConfig()
  const hasHydrated = useHasHydrated()
  const isTma = useIsTma()
  const currentUser = useUser()

  // TON wallet connect is a Telegram-Mini-App-only feature. We load the (large)
  // TON SDK via a dynamic import gated on `isTma`, so it never ships in the web
  // bundle — web users keep the exact same synchronous mount path.
  const [tonConnectors, setTonConnectors] = useState<readonly (typeof EthereumWalletConnectors)[]>([])
  useEffect(() => {
    if (!isTma) {
      return
    }
    let cancelled = false
    void import('@dynamic-labs/ton').then((mod) => {
      if (!cancelled) {
        setTonConnectors([mod.TonWalletConnectors as unknown as typeof EthereumWalletConnectors])
      }
    })
    return () => {
      cancelled = true
    }
  }, [isTma])

  const settings = useMemo(() => ({
    environmentId: dynamicEnvId,
    walletConnectors: [EthereumWalletConnectors, ...tonConnectors],
    events: {
      onAuthSuccess: async ({ primaryWallet }: { primaryWallet: Wallet | null }) => {
        if (primaryWallet) {
          await driveSIWEHandshake(primaryWallet, siteUrl)
        }
      },
      // Fires for any Dynamic logout (explicit or session-expiry). Just clear
      // local state reactively — the explicit logout() handles better-auth +
      // navigation, so reloading here would race ahead of that signOut.
      onLogout: () => {
        clearWalletState()
        useUser.setState(null)
      },
    },
  }), [dynamicEnvId, siteUrl, tonConnectors])

  // Dynamic's internal widgets are not compatible with cacheComponents'
  // streaming hydration, so we only mount Dynamic on the client after hydration.
  // Before that, the app renders normally against inert wallet defaults.
  // Inside the TMA we also wait for the TON connectors to load, so Dynamic
  // initializes once with the full connector set rather than re-initializing.
  if (!hasHydrated || (isTma && tonConnectors.length === 0)) {
    return (
      <WagmiProvider config={wagmiConfig}>
        <AppKitContext value={ssrAppKitValue}>
          {children}
        </AppKitContext>
      </WagmiProvider>
    )
  }

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
              <SignaturePromptHost />
            </AppKitBridge>
          </DynamicWagmiConnector>
        </WagmiProvider>
      </DynamicContextProvider>
    </DynamicErrorBoundary>
  )
}
