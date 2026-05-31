'use client'

import { Wallet, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppKit } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { authClient } from '@/lib/auth-client'

const { useSession } = authClient

const WALLET_SKIPPED_KEY = 'tma_wallet_skipped'

function isTmaHost() {
  if (typeof window === 'undefined') {
    return false
  }
  const host = window.location.hostname
  return host.startsWith('tma.') || host.includes('tma')
}

export default function TmaAutoLogin() {
  const { open } = useAppKit()
  const { data: session, isPending } = useSession()
  const hasHydrated = useHasHydrated()
  const triggered = useRef(false)
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [authStatus, setAuthStatus] = useState<'idle' | 'authenticating' | 'authenticated' | 'failed'>('idle')

  const attemptTelegramAuth = useCallback(async () => {
    if (typeof window === 'undefined') {
      return false
    }

    const webApp = (window as any).Telegram?.WebApp
    if (!webApp?.initData) {
      return false
    }

    setAuthStatus('authenticating')
    try {
      const res = await fetch('/api/tma/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: webApp.initData }),
      })

      if (res.ok) {
        setAuthStatus('authenticated')
        window.location.reload()
        return true
      }

      setAuthStatus('failed')
      return false
    }
    catch {
      setAuthStatus('failed')
      return false
    }
  }, [])

  useEffect(() => {
    if (!hasHydrated || isPending || triggered.current) {
      return
    }
    if (!isTmaHost()) {
      return
    }
    if (session?.user) {
      triggered.current = true
      const skipped = localStorage.getItem(WALLET_SKIPPED_KEY) === 'true'
      if (!skipped) {
        setShowWalletModal(true)
      }
      return
    }

    triggered.current = true
    attemptTelegramAuth().then((success) => {
      if (!success) {
        open()
      }
    })
  }, [hasHydrated, isPending, session, attemptTelegramAuth, open])

  function handleConnect() {
    localStorage.setItem(WALLET_SKIPPED_KEY, 'true')
    setShowWalletModal(false)
    open()
  }

  function handleSkip() {
    localStorage.setItem(WALLET_SKIPPED_KEY, 'true')
    setShowWalletModal(false)
  }

  if (authStatus === 'authenticating') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-background p-8">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Signing in with Telegram...</p>
        </div>
      </div>
    )
  }

  if (!showWalletModal) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleSkip} />
      <div className="
        relative w-full rounded-t-2xl bg-background p-6 pb-10 shadow-xl
        sm:max-w-sm sm:rounded-2xl sm:pb-6
      "
      >
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 text-muted-foreground"
          aria-label="Skip"
        >
          <X className="size-5" />
        </button>

        <div className="mb-4 flex justify-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
            <Wallet className="size-7 text-primary" />
          </div>
        </div>

        <h2 className="mb-1 text-center text-lg font-semibold">Connect Your Wallet</h2>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Connect a wallet to start trading. You can skip and browse markets first.
        </p>

        <button
          onClick={handleConnect}
          className="
            mb-3 w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity
            active:opacity-80
          "
        >
          Connect Wallet
        </button>
        <button
          onClick={handleSkip}
          className="w-full rounded-xl py-3 text-sm text-muted-foreground"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
