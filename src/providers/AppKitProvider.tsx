'use client'

import type { ReactNode } from 'react'

import { useExtracted } from 'next-intl'
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WagmiProvider } from 'wagmi'

import type { AppKitValue } from '@/hooks/useAppKit'

import { SignaturePromptHost } from '@/components/SignaturePromptHost'
import { AppKitContext, defaultAppKitValue } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { useIsTma } from '@/hooks/useIsTma'
import { createDynamicWagmiConfig } from '@/lib/appkit'
import { IS_BROWSER } from '@/lib/constants'
import { signOutAndRedirect } from '@/lib/logout'
import { useUser } from '@/stores/useUser'

// Stable wagmi config — created once per module load. The wallet layer's
// DynamicWagmiConnector registers Dynamic's wallets on this same config.
const wagmiConfig = createDynamicWagmiConfig()

// The Dynamic SDK and its wallet connectors are most of the site's JavaScript.
// Loading them as their own chunk keeps them out of the bundle every page needs
// before it can hydrate.
const DynamicWalletLayer = lazy(() => import('@/providers/DynamicWalletLayer'))

// Visitors without a session only need the wallet SDK to log in. Load it once
// the page has finished loading and the browser is idle (or on the first
// open()), so it doesn't compete with the page's own content.
const IDLE_WALLET_LOAD_TIMEOUT_MS = 3000

/**
 * Tags any error thrown while loading or running the Dynamic layer with a
 * clear, greppable prefix so production wallet-stack failures are
 * identifiable. The page is not inside this boundary, so a failure leaves it up
 * with the wallet stack inert instead of unwinding to the root error page.
 */
class DynamicErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[AppKitProvider] Dynamic provider crashed:', error.message, info.componentStack)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function whenPageIdle(callback: () => void) {
  let idleHandle: number | undefined
  let timeoutHandle: number | undefined

  function scheduleIdle() {
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(callback, { timeout: IDLE_WALLET_LOAD_TIMEOUT_MS })
    } else {
      timeoutHandle = window.setTimeout(callback, IDLE_WALLET_LOAD_TIMEOUT_MS)
    }
  }

  if (document.readyState === 'complete') {
    scheduleIdle()
  } else {
    window.addEventListener('load', scheduleIdle, { once: true })
  }

  return () => {
    window.removeEventListener('load', scheduleIdle)
    if (idleHandle !== undefined) {
      window.cancelIdleCallback(idleHandle)
    }
    if (timeoutHandle !== undefined) {
      window.clearTimeout(timeoutHandle)
    }
  }
}

export default function AppKitProvider({ children }: { children: ReactNode }) {
  const t = useExtracted()
  const hasHydrated = useHasHydrated()
  const isTma = useIsTma()
  const currentUser = useUser()
  const hasAuthenticatedUser = Boolean(currentUser?.id)

  const [walletLoadRequested, setWalletLoadRequested] = useState(false)
  const [walletValue, setWalletValue] = useState<AppKitValue | null>(null)
  const walletValueRef = useRef<AppKitValue | null>(null)
  const pendingWalletRequests = useRef<Array<(value: AppKitValue) => void>>([])

  // Dynamic's internal widgets are not compatible with cacheComponents'
  // streaming hydration, so the wallet layer only mounts on the client after
  // hydration. Signed-in users (and the TMA) need it straight away.
  const shouldLoadWallet = hasHydrated && (walletLoadRequested || hasAuthenticatedUser || isTma)

  useEffect(() => {
    if (!hasHydrated || shouldLoadWallet) {
      return
    }
    return whenPageIdle(() => setWalletLoadRequested(true))
  }, [hasHydrated, shouldLoadWallet])

  const handleWalletValue = useCallback((value: AppKitValue) => {
    walletValueRef.current = value
    setWalletValue(value)
    for (const resolve of pendingWalletRequests.current.splice(0)) {
      resolve(value)
    }
  }, [])

  const whenWalletReady = useCallback(() => {
    if (walletValueRef.current) {
      return Promise.resolve(walletValueRef.current)
    }
    setWalletLoadRequested(true)
    return new Promise<AppKitValue>((resolve) => {
      pendingWalletRequests.current.push(resolve)
    })
  }, [])

  // Until the wallet layer has loaded: the wallet stack is inert, logout still
  // works via better-auth, and anything that needs the wallet loads it first.
  const loadingAppKitValue = useMemo<AppKitValue>(
    () => ({
      ...defaultAppKitValue,
      open: async (options) => {
        const value = await whenWalletReady()
        await value.open(options)
      },
      logout: async () => {
        await signOutAndRedirect({ currentPathname: IS_BROWSER ? window.location.pathname : '/' })
      },
      connectTonWallet: () => {
        void whenWalletReady().then((value) => value.connectTonWallet())
      },
      sendEmailOtp: async (email) => {
        const value = await whenWalletReady()
        await value.sendEmailOtp(email)
      },
      verifyEmailOtp: async (code) => {
        const value = await whenWalletReady()
        await value.verifyEmailOtp(code)
      },
    }),
    [whenWalletReady],
  )

  // The page stays at the same place in the tree whether or not the wallet
  // layer has loaded, so loading it never remounts the page.
  return (
    <WagmiProvider config={wagmiConfig}>
      <AppKitContext value={walletValue ?? loadingAppKitValue}>
        {children}
        <SignaturePromptHost />
      </AppKitContext>
      {shouldLoadWallet && (
        <DynamicErrorBoundary>
          <Suspense fallback={null}>
            <DynamicWalletLayer
              hasAuthenticatedUser={hasAuthenticatedUser}
              regionBlockedMessage={t('This platform is not currently available in your region.')}
              onValueChange={handleWalletValue}
            />
          </Suspense>
        </DynamicErrorBoundary>
      )}
    </WagmiProvider>
  )
}
