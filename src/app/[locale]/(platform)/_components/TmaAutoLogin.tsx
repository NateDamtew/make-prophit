'use client'

import { Wallet, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppKit } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { authClient } from '@/lib/auth-client'

const { useSession } = authClient

const WALLET_SKIPPED_KEY = 'tma_wallet_skipped'
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'makeprophit_bot'

function isTmaHost() {
  if (typeof window === 'undefined') {
    return false
  }
  const host = window.location.hostname
  return host.startsWith('tma.') || host.includes('tma')
}

function isInsideTelegram() {
  if (typeof window === 'undefined') {
    return false
  }
  const webApp = (window as any).Telegram?.WebApp
  if (!webApp) {
    return false
  }
  // Check multiple signals — different Telegram clients set different properties
  if (webApp.initData) {
    return true
  }
  if (typeof webApp.platform === 'string' && webApp.platform !== '') {
    return true
  }
  if (typeof webApp.version === 'string') {
    return true
  }
  if (typeof webApp.colorScheme === 'string') {
    return true
  }
  return false
}

function getTelegramInitData(): string {
  const webApp = (window as any).Telegram?.WebApp
  return webApp?.initData ?? ''
}

type AuthStatus = 'idle' | 'authenticating' | 'done'
type Screen = 'none' | 'telegram-login' | 'wallet-onboarding'

export default function TmaAutoLogin() {
  const { open } = useAppKit()
  const { data: session, isPending } = useSession()
  const hasHydrated = useHasHydrated()
  const triggered = useRef(false)
  const [screen, setScreen] = useState<Screen>('none')
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle')

  const attemptTelegramAuth = useCallback(async (): Promise<boolean> => {
    const initData = getTelegramInitData()
    if (!initData) {
      // Inside Telegram but no initData (opened from bot profile without deep link)
      // Can't do server-side validation — fall through to show login screen
      return false
    }
    setAuthStatus('authenticating')
    try {
      const res = await fetch('/api/auth/telegram/verify-tma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      })
      if (res.ok) {
        setAuthStatus('done')
        window.location.reload()
        return true
      }
      setAuthStatus('idle')
      return false
    }
    catch {
      setAuthStatus('idle')
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

    // Only run on tma.* OR inside Telegram WebView
    if (!isTmaHost() && !isInsideTelegram()) {
      return
    }

    triggered.current = true

    // Already logged in — show wallet onboarding if not skipped
    if (session?.user) {
      const skipped = localStorage.getItem(WALLET_SKIPPED_KEY) === 'true'
      if (!skipped) {
        setScreen('wallet-onboarding')
      }
      return
    }

    // Inside Telegram WebView — auto-auth silently
    if (isInsideTelegram()) {
      attemptTelegramAuth().then((success) => {
        if (!success) {
          setScreen('telegram-login')
        }
      })
      return
    }

    // On tma.* in a browser — show Telegram login screen
    setScreen('telegram-login')
  }, [hasHydrated, isPending, session, attemptTelegramAuth])

  function handleOpenTelegram() {
    window.open(`https://t.me/${BOT_USERNAME}`, '_blank')
  }

  function handleConnectWallet() {
    localStorage.setItem(WALLET_SKIPPED_KEY, 'true')
    setScreen('none')
    open({ view: 'AllWallets' })
  }

  function handleSkipWallet() {
    localStorage.setItem(WALLET_SKIPPED_KEY, 'true')
    setScreen('none')
  }

  // Silent auth spinner
  if (authStatus === 'authenticating') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-background p-8">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Signing in with Telegram...</p>
        </div>
      </div>
    )
  }

  // Telegram login screen (browser or failed auto-auth)
  if (screen === 'telegram-login') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          {/* Telegram logo */}
          <div className="flex size-20 items-center justify-center rounded-full bg-[#229ED9]/10">
            <svg className="size-10" viewBox="0 0 24 24" fill="#229ED9">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.932z" />
            </svg>
          </div>

          <div>
            <h1 className="text-2xl font-bold">Sign in to Prophit</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isInsideTelegram()
                ? 'Use the menu button or tap the link below to launch Prophit with full sign-in support.'
                : 'Open the Prophit bot in Telegram to sign in seamlessly with your Telegram account.'}
            </p>
          </div>

          <button
            onClick={handleOpenTelegram}
            className="
              w-full rounded-xl bg-[#229ED9] py-3.5 text-sm font-semibold text-white transition-opacity
              active:opacity-80
            "
          >
            {isInsideTelegram() ? 'Open via Bot Link' : 'Open in Telegram'}
          </button>

          <div className="flex w-full items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={handleConnectWallet}
            className="
              w-full rounded-xl border border-border py-3.5 text-sm font-medium transition-colors
              hover:bg-accent
            "
          >
            Continue with Wallet
          </button>
        </div>
      </div>
    )
  }

  // Wallet onboarding (after Telegram auth)
  if (screen === 'wallet-onboarding') {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <div className="absolute inset-0 bg-black/60" onClick={handleSkipWallet} />
        <div className="
          relative w-full rounded-t-2xl bg-background p-6 pb-10 shadow-xl
          sm:max-w-sm sm:rounded-2xl sm:pb-6
        "
        >
          <button
            onClick={handleSkipWallet}
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
            onClick={handleConnectWallet}
            className="
              mb-3 w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity
              active:opacity-80
            "
          >
            Connect Wallet
          </button>
          <button
            onClick={handleSkipWallet}
            className="w-full rounded-xl py-3 text-sm text-muted-foreground"
          >
            Skip for now
          </button>
        </div>
      </div>
    )
  }

  return null
}
