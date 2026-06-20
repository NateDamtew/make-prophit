'use client'

import { Wallet, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppKit } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { authClient } from '@/lib/auth-client'
import { getTelegramInitData, isInsideTelegram, isTmaHost } from '@/lib/tma'

const { useSession } = authClient

const WALLET_SKIPPED_KEY = 'tma_wallet_skipped'
// Per-launch guard so we attempt embedded-wallet provisioning at most once per
// Mini App session (sessionStorage resets each fresh launch → retries next time).
const EMBEDDED_ATTEMPT_KEY = 'tma_embedded_attempted'
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'makeprophit_bot'

type AuthStatus = 'idle' | 'authenticating' | 'done'
type Screen = 'none' | 'telegram-login' | 'wallet-onboarding'

export default function TmaAutoLogin() {
  const { open, sdkHasLoaded, signInWithTelegram } = useAppKit()
  const { data: session, isPending } = useSession()
  const hasHydrated = useHasHydrated()
  const triggered = useRef(false)
  const [screen, setScreen] = useState<Screen>('none')
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle')
  const [authError, setAuthError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('Signing in with Telegram…')

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
        signal: AbortSignal.timeout(15_000),
      })
      if (res.ok) {
        setAuthStatus('done')
        window.location.reload()
        return true
      }
      const errorData = await res.json().catch(() => null)
      console.error('TMA auth failed:', res.status, errorData)
      setAuthStatus('idle')
      setAuthError(errorData?.message ?? `Authentication failed (${res.status})`)
      return false
    }
    catch (err) {
      console.error('TMA auth error:', err)
      setAuthStatus('idle')
      setAuthError('Connection timed out. Please try again.')
      return false
    }
  }, [])

  // Best-effort upgrade for logged-in TMA users WITHOUT a wallet: authenticate
  // with Dynamic (which auto-creates an embedded EVM wallet) so they get a
  // Polygon address. This NEVER blocks login — they're already signed in. If it
  // fails for any reason, we fall back to the manual "Connect Wallet" screen.
  const provisionEmbeddedWallet = useCallback(async (initData: string) => {
    setAuthStatus('authenticating')
    try {
      setStatusMessage('Setting up your wallet… (1/3 minting token)')
      const tokenRes = await fetch('/api/tma/dynamic-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
        signal: AbortSignal.timeout(15_000),
      }).catch((error: unknown) => {
        throw new Error(`token request error: ${error instanceof Error ? error.message : String(error)}`)
      })
      if (!tokenRes.ok) {
        throw new Error(`token request failed (HTTP ${tokenRes.status})`)
      }
      const { telegramAuthToken } = await tokenRes.json() as { telegramAuthToken?: string }
      if (!telegramAuthToken) {
        throw new Error('server returned no token')
      }

      // Triggers Dynamic auth + embedded wallet, then onAuthSuccess drives SIWE.
      setStatusMessage('Setting up your wallet… (2/3 signing in)')
      try {
        await signInWithTelegram(telegramAuthToken)
      }
      catch (signinErr) {
        throw new Error(`Dynamic sign-in rejected: ${signinErr instanceof Error ? signinErr.message : String(signinErr)}`)
      }

      // telegramSignIn can resolve without actually authenticating, so we VERIFY
      // an address really appeared rather than trusting it.
      setStatusMessage('Setting up your wallet… (3/3 waiting for wallet)')
      const deadline = Date.now() + 12_000
      while (Date.now() < deadline) {
        const current = await authClient.getSession()
        const address = (current?.data?.user as { address?: string | null } | undefined)?.address
        if (address) {
          // Land cleanly on the now-address-keyed session.
          window.location.reload()
          return
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      throw new Error('signed in, but no wallet address appeared after 12s')
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('TMA embedded-wallet provisioning failed:', err)
      setAuthStatus('idle')
      // TEMP (debug): surface the failure on-screen since there is no console in
      // the Mini App. Once the flow is confirmed, replace with a silent fallback
      // to the manual Connect Wallet screen.
      setAuthError(`Wallet setup failed — ${message}`)
    }
  }, [signInWithTelegram])

  useEffect(() => {
    if (!hasHydrated || isPending || triggered.current) {
      return
    }
    // Only run on tma.* hostname OR inside Telegram WebView
    if (!isTmaHost() && !isInsideTelegram()) {
      return
    }

    // Already logged in.
    if (session?.user) {
      const hasWallet = Boolean((session.user as { address?: string | null }).address)
      if (hasWallet) {
        triggered.current = true
        return
      }
      // No wallet yet — auto-provision an embedded EVM wallet (TMA + initData)
      // so the user gets a Polygon address. Best-effort UPGRADE: the user is
      // already logged in, so this can never block sign-in. The `wallet_skipped`
      // flag must NOT block this — it only suppresses the manual screen below.
      const initData = isInsideTelegram() ? getTelegramInitData() : null
      const alreadyAttempted = sessionStorage.getItem(EMBEDDED_ATTEMPT_KEY) === '1'
      if (initData && !alreadyAttempted) {
        // telegramSignIn needs Dynamic's SDK loaded; wait for it (the effect
        // re-runs when sdkHasLoaded flips) so we don't no-op. Show the spinner
        // so this wait is visible rather than a silent dead-end.
        if (!sdkHasLoaded) {
          setStatusMessage('Setting up your wallet… (loading)')
          setAuthStatus('authenticating')
          return
        }
        triggered.current = true
        sessionStorage.setItem(EMBEDDED_ATTEMPT_KEY, '1')
        void provisionEmbeddedWallet(initData)
        return
      }
      // Couldn't auto-provision (no initData, or already tried this launch) →
      // offer the manual "Connect Wallet" screen unless the user opted out.
      triggered.current = true
      const skipped = localStorage.getItem(WALLET_SKIPPED_KEY) === 'true'
      if (!skipped) {
        setScreen('wallet-onboarding')
      }
      return
    }

    triggered.current = true

    // Inside Telegram WebView — auto-auth silently if initData available
    if (isInsideTelegram()) {
      const initData = getTelegramInitData()
      if (initData) {
        attemptTelegramAuth().then((success) => {
          if (!success) {
            // Auth failed even with initData — let them browse normally
          }
        })
      }
      // No initData (e.g. Desktop Telegram bot profile) — let them browse
      // and use the normal Log In button in the header
      return
    }

    // On tma.* in a regular browser (not Telegram) — show Telegram login screen
    if (isTmaHost()) {
      setScreen('telegram-login')
    }
  }, [hasHydrated, isPending, session, sdkHasLoaded, attemptTelegramAuth, provisionEmbeddedWallet])

  function handleOpenTelegram() {
    window.open(`https://t.me/${BOT_USERNAME}/Prophit`, '_blank')
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

  // Silent auth spinner or error
  if (authStatus === 'authenticating' || authError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="flex w-72 flex-col items-center gap-3 rounded-2xl bg-background p-8">
          {authStatus === 'authenticating' && !authError && (
            <>
              <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">{statusMessage}</p>
            </>
          )}
          {authError && (
            <>
              <p className="text-center text-sm text-destructive">{authError}</p>
              <button
                onClick={() => {
                  setAuthError(null)
                  triggered.current = false
                  attemptTelegramAuth()
                }}
                className="mt-2 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Try Again
              </button>
              <button
                onClick={() => setAuthError(null)}
                className="w-full rounded-xl py-2 text-sm text-muted-foreground"
              >
                Dismiss
              </button>
            </>
          )}
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
