'use client'

import type { Wallet } from '@dynamic-labs/sdk-react-core'
import type { Config } from 'wagmi'

import { EthereumWalletConnectors } from '@dynamic-labs/ethereum'
import {
  DynamicContextProvider,
  useConnectWithOtp,
  useDynamicContext,
  useDynamicModals,
  useUserWallets,
} from '@dynamic-labs/sdk-react-core'
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector'
import { memo, useEffect, useMemo, useState } from 'react'
import { createSiweMessage } from 'viem/siwe'
import { useConfig } from 'wagmi'

import type { AppKitValue, TonTxMessage } from '@/hooks/useAppKit'
import type { User } from '@/types'

import { toast } from '@/components/ui/toast'
import { useIsTma } from '@/hooks/useIsTma'
import { usePublicRuntimeConfig } from '@/hooks/usePublicRuntimeConfig'
import { defaultNetwork } from '@/lib/appkit'
import { authClient } from '@/lib/auth-client'
import { IS_BROWSER } from '@/lib/constants'
import { signOutAndRedirect } from '@/lib/logout'
import { clearBrowserStorage, clearNonHttpOnlyCookies } from '@/lib/utils'
import { mergeSessionUserState, useUser } from '@/stores/useUser'

/**
 * Everything that touches the Dynamic SDK. AppKitProvider loads this module
 * lazily, after hydration, so the SDK and its wallet connectors (most of the
 * site's JavaScript) stay out of the page's initial bundle. It renders no page
 * content: AppKitBridge publishes the wallet API to AppKitProvider, which hands
 * it to the app through AppKitContext.
 */

function getConnectedAccount(config: Config): { address: `0x${string}` | undefined; chainId: number } {
  const state = config?.state
  const current = state?.current
  const connection = current ? state.connections.get(current) : undefined
  const address = connection?.accounts?.[0]
  const chainId = connection?.chainId ?? state?.chainId ?? defaultNetwork.id
  return { address, chainId }
}

function isEmbeddedWallet(wallet: Wallet | null): boolean {
  return Boolean((wallet?.connector as { isEmbeddedWallet?: boolean } | undefined)?.isEmbeddedWallet)
}

// TON wallets are detected by their chain literal (from Dynamic's Chains union)
// so this provider stays web-safe and never imports the heavy `@dynamic-labs/ton`.
const TON_CHAIN = 'TON'

interface TonCapableConnector {
  sendTransaction?: (request: { validUntil: number; messages: TonTxMessage[] }) => Promise<string>
}

function findTonWallet(wallets: readonly Wallet[]): Wallet | null {
  return wallets.find((wallet) => wallet.chain === TON_CHAIN) ?? null
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
    const payload = (await response.json()) as { blocked?: boolean }
    return payload?.blocked === true
  } catch {
    return false
  }
}

/**
 * Drives the better-auth SIWE handshake after Dynamic reports a connected
 * wallet. Uses the wallet's actual connected chainId for both nonce and verify
 * so the server-side nonce key matches (see CLAUDE.md — never force a chain
 * switch for sign-in).
 */
async function driveSIWEHandshake(primaryWallet: Wallet, siteUrl: string, wagmiConfig: Config): Promise<boolean> {
  const address = primaryWallet.address as `0x${string}` | undefined
  if (!address) {
    return false
  }

  const { chainId } = getConnectedAccount(wagmiConfig)

  try {
    const session = await authClient.getSession()
    const sessionAddress = (session?.data?.user as any)?.address as string | undefined
    if (sessionAddress?.toLowerCase() === address.toLowerCase()) {
      const user = session.data?.user
      if (user) {
        useUser.setState((previous) => mergeSessionUserState(previous, user as unknown as User))
      }
      return true
    }
  } catch {
    // no session yet — continue
  }

  try {
    // better-auth 1.7: the nonce endpoint takes no body; the wallet address and
    // chain ID are read from the signed message at verify time instead.
    const { data: nonceData, error: nonceError } = await authClient.siwe.nonce()
    const nonce = nonceData?.nonce
    if (!nonce) {
      // Without a server-issued nonce, verification can never succeed (the
      // server compares against its stored nonce) — abort loudly instead of
      // signing a message that is guaranteed to fail. A 403 here usually means
      // the current origin is missing from better-auth trustedOrigins.
      console.warn('[SIWE] nonce request failed — aborting handshake:', nonceError ?? 'empty response')
      return false
    }

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
      return false
    }

    // The connected chainId is carried inside `message` (see createSiweMessage
    // above) — the server derives address + chain from it.
    const { data: verifyData, error: verifyError } = await authClient.siwe.verify({
      message,
      signature,
    })

    if (!verifyData?.success) {
      // Surface the server's rejection reason — a silent failure here leaves
      // the user "connected" in Dynamic but with no Prophit session.
      console.warn('[SIWE] verify rejected:', verifyError ?? verifyData ?? 'empty response')
      return false
    }

    const session = await authClient.getSession()
    const user = session?.data?.user
    if (user) {
      useUser.setState((previous) => mergeSessionUserState(previous, user as unknown as User))
      console.warn('[SIWE] handshake complete — session created for', address)
      return true
    }
    console.warn('[SIWE] verify succeeded but no session returned — check cookies/baseURL')
    return false
  } catch (error) {
    console.warn('[SIWE] handshake failed:', error)
    return false
  }
}

interface WalletLayerProps {
  hasAuthenticatedUser: boolean
  regionBlockedMessage: string
  onValueChange: (value: AppKitValue) => void
}

/**
 * The single place that touches Dynamic hooks. Reads Dynamic + wagmi state and
 * publishes it to AppKitProvider, so every other consumer in the app reads a
 * stable context (with safe defaults until this layer loads) and never calls
 * Dynamic hooks directly.
 */
function AppKitBridge({ hasAuthenticatedUser, regionBlockedMessage, onValueChange }: WalletLayerProps) {
  const { setShowAuthFlow, handleLogOut, primaryWallet, user: dynamicUser } = useDynamicContext()
  const { siteUrl } = usePublicRuntimeConfig()
  const wagmiConfig = useConfig()
  const dynamicUserEmail = typeof dynamicUser?.email === 'string' ? dynamicUser.email : undefined
  const { setShowLinkNewWalletModal } = useDynamicModals()
  const { connectWithEmail, verifyOneTimePassword } = useConnectWithOtp()
  const userWallets = useUserWallets()
  const tonWallet = useMemo(() => findTonWallet(userWallets), [userWallets])

  const value = useMemo<AppKitValue>(
    () => ({
      open: async () => {
        if (!hasAuthenticatedUser && (await isCurrentRegionBlocked())) {
          toast.warning(regionBlockedMessage)
          return
        }
        // Dynamic still holds a wallet but there is no Prophit session (an
        // earlier SIWE verify failed). Dynamic won't reopen its auth flow for
        // an already-authenticated user, so the button would silently do
        // nothing: retry the handshake, and if that still fails, drop the
        // stale Dynamic login so the user can start over.
        if (primaryWallet && !hasAuthenticatedUser) {
          if (await driveSIWEHandshake(primaryWallet, siteUrl, wagmiConfig)) {
            return
          }
          try {
            await handleLogOut()
          } catch {
            // fall through to a fresh auth flow regardless
          }
        }
        setShowAuthFlow(true)
      },
      close: async () => {
        setShowAuthFlow(false)
      },
      isReady: true,
      isEmbedded: isEmbeddedWallet(primaryWallet),
      walletName: primaryWallet?.connector?.name ?? undefined,
      walletEmail: dynamicUserEmail,
      // Log out of BOTH layers: Dynamic (wallet) and better-auth (our session).
      // Dynamic's handleLogOut alone leaves the better-auth cookie alive, so the
      // user stays logged in after reload — signOutAndRedirect kills it + redirects.
      logout: async () => {
        try {
          await handleLogOut()
        } catch {
          // ignore — still clear better-auth below
        }
        await signOutAndRedirect({ currentPathname: IS_BROWSER ? window.location.pathname : '/' })
      },
      tonWalletAddress: tonWallet?.address,
      connectTonWallet: () => {
        setShowLinkNewWalletModal(true)
      },
      sendTonTransaction: async (messages: TonTxMessage[], validUntilSeconds = 600) => {
        if (!tonWallet) {
          throw new Error('No TON wallet connected')
        }
        const connector = tonWallet.connector as unknown as TonCapableConnector
        if (typeof connector.sendTransaction !== 'function') {
          throw new TypeError('Connected TON wallet cannot send transactions')
        }
        return connector.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + validUntilSeconds,
          messages,
        })
      },
      sendEmailOtp: async (email: string) => {
        await connectWithEmail(email)
      },
      verifyEmailOtp: async (code: string) => {
        await verifyOneTimePassword(code)
      },
    }),
    [
      hasAuthenticatedUser,
      regionBlockedMessage,
      siteUrl,
      wagmiConfig,
      setShowAuthFlow,
      handleLogOut,
      primaryWallet,
      dynamicUserEmail,
      tonWallet,
      setShowLinkNewWalletModal,
      connectWithEmail,
      verifyOneTimePassword,
    ],
  )

  // The page is not rendered inside this layer (so loading it never remounts
  // the page); AppKitProvider receives the wallet API here and provides it.
  useEffect(() => {
    // oxlint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent
    onValueChange(value)
  }, [onValueChange, value])

  return null
}

// Memoized so AppKitProvider re-rendering with a new wallet value doesn't
// re-render Dynamic's hooks into yet another value.
export default memo(function DynamicWalletLayer(props: WalletLayerProps) {
  const { dynamicEnvId, siteUrl } = usePublicRuntimeConfig()
  const isTma = useIsTma()
  const wagmiConfig = useConfig()

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

  const settings = useMemo(
    () => ({
      environmentId: dynamicEnvId,
      walletConnectors: [EthereumWalletConnectors, ...tonConnectors],
      events: {
        onAuthSuccess: async ({ primaryWallet }: { primaryWallet: Wallet | null }) => {
          if (primaryWallet) {
            await driveSIWEHandshake(primaryWallet, siteUrl, wagmiConfig)
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
    }),
    [dynamicEnvId, siteUrl, tonConnectors, wagmiConfig],
  )

  // Inside the TMA, wait for the TON connectors so Dynamic initializes once
  // with the full connector set rather than re-initializing.
  if (isTma && tonConnectors.length === 0) {
    return null
  }

  // Dynamic's internal widgets are not compatible with cacheComponents'
  // streaming hydration; this layer only ever mounts on the client, after
  // hydration (see AppKitProvider).
  return (
    <DynamicContextProvider settings={settings}>
      <DynamicWagmiConnector>
        <AppKitBridge {...props} />
      </DynamicWagmiConnector>
    </DynamicContextProvider>
  )
})
