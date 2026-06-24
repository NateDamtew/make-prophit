'use client'

import { Wallet, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppKit } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { authClient } from '@/lib/auth-client'
import { getTelegramInitData, isInsideTelegram, isTmaHost } from '@/lib/tma'

const { useSession } = authClient

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'makeprophit_bot'

type AuthStatus = 'idle' | 'authenticating' | 'done'
type Screen = 'none' | 'telegram-login' | 'wallet-onboarding'

export default function TmaAutoLogin() {
  const { open, sendEmailOtp, verifyEmailOtp, connectTonWallet } = useAppKit()
  const { data: session, isPending } = useSession()
  const hasHydrated = useHasHydrated()
  const triggered = useRef(false)
  const [screen, setScreen] = useState<Screen>('none')
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle')
  const [authError, setAuthError] = useState<string | null>(null)
  const [wizardStep, setWizardStep] = useState<'email' | 'otp' | 'ton'>('email')
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [wizardBusy, setWizardBusy] = useState(false)
  const [wizardError, setWizardError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!hasHydrated || isPending || triggered.current) {
      return
    }
    // Only run on tma.* hostname OR inside Telegram WebView
    if (!isTmaHost() && !isInsideTelegram()) {
      return
    }

    triggered.current = true

    // Already logged in — show wallet onboarding only for users WITHOUT a
    // connected wallet (i.e. Telegram/social sign-ups). Wallet users already
    // have an address, so they should never see "Connect Your Wallet".
    if (session?.user) {
      const hasWallet = Boolean((session.user as { address?: string | null }).address)
      if (!hasWallet) {
        setScreen('wallet-onboarding')
      }
      return
    }

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
  }, [hasHydrated, isPending, session, attemptTelegramAuth])

  function handleOpenTelegram() {
    window.open(`https://t.me/${BOT_USERNAME}/Prophit`, '_blank')
  }

  function handleCloseOnboarding() {
    setScreen('none')
  }

  // Browser (on tma.* but outside Telegram) fallback — open Dynamic's modal.
  function handleConnectWallet() {
    setScreen('none')
    open()
  }

  async function handleSendEmail() {
    if (!email.trim() || wizardBusy) {
      return
    }
    setWizardError(null)
    setWizardBusy(true)
    try {
      await sendEmailOtp(email.trim())
      setWizardStep('otp')
    }
    catch (err) {
      setWizardError(err instanceof Error ? err.message : 'Could not send the code. Please try again.')
    }
    finally {
      setWizardBusy(false)
    }
  }

  async function handleVerifyOtp() {
    if (!otpCode.trim() || wizardBusy) {
      return
    }
    setWizardError(null)
    setWizardBusy(true)
    try {
      await verifyEmailOtp(otpCode.trim())
      // Embedded wallet created + SIWE running — move to the optional TON step.
      setWizardStep('ton')
    }
    catch (err) {
      setWizardError(err instanceof Error ? err.message : 'Invalid code. Please try again.')
    }
    finally {
      setWizardBusy(false)
    }
  }

  function handleConnectTon() {
    connectTonWallet()
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
              <p className="text-sm text-muted-foreground">Signing in with Telegram...</p>
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
    const primaryButton = `
      mb-3 w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity
      active:opacity-80
      disabled:cursor-not-allowed disabled:opacity-50
    `
    const inputClass = `
      mb-3 w-full rounded-xl border border-border bg-transparent px-4 py-3 text-sm outline-none
      focus:border-primary
    `
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <div className="absolute inset-0 bg-black/60" onClick={handleCloseOnboarding} />
        <div className="
          relative w-full rounded-t-2xl bg-background p-6 pb-10 shadow-xl
          sm:max-w-sm sm:rounded-2xl sm:pb-6
        "
        >
          <button
            onClick={handleCloseOnboarding}
            className="absolute top-4 right-4 text-muted-foreground"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>

          <div className="mb-4 flex justify-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
              <Wallet className="size-7 text-primary" />
            </div>
          </div>

          {wizardStep === 'email' && (
            <>
              <h2 className="mb-1 text-center text-lg font-semibold">Set up your wallet</h2>
              <p className="mb-5 text-center text-sm text-muted-foreground">
                Enter your email and we'll create your Prophit wallet.
              </p>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@email.com"
                className={inputClass}
              />
              {wizardError && <p className="mb-3 text-center text-sm text-destructive">{wizardError}</p>}
              <button type="button" onClick={handleSendEmail} disabled={wizardBusy || !email.trim()} className={primaryButton}>
                {wizardBusy ? 'Sending…' : 'Continue'}
              </button>
            </>
          )}

          {wizardStep === 'otp' && (
            <>
              <h2 className="mb-1 text-center text-lg font-semibold">Enter the code</h2>
              <p className="mb-5 text-center text-sm text-muted-foreground">
                We sent a 6-digit code to
                {' '}
                {email}
                .
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={event => setOtpCode(event.target.value)}
                placeholder="123456"
                className={`${inputClass} text-center text-lg tracking-[0.4em]`}
              />
              {wizardError && <p className="mb-3 text-center text-sm text-destructive">{wizardError}</p>}
              <button type="button" onClick={handleVerifyOtp} disabled={wizardBusy || !otpCode.trim()} className={primaryButton}>
                {wizardBusy ? 'Verifying…' : 'Verify'}
              </button>
            </>
          )}

          {wizardStep === 'ton' && (
            <>
              <h2 className="mb-1 text-center text-lg font-semibold">Fund with TON</h2>
              <p className="mb-5 text-center text-sm text-muted-foreground">
                Your wallet is ready. Connect your TON wallet to deposit — or skip and do it later when you want to trade.
              </p>
              <button type="button" onClick={handleConnectTon} className={primaryButton}>
                Connect TON wallet
              </button>
              <button
                type="button"
                onClick={handleCloseOnboarding}
                className="w-full rounded-xl py-3 text-sm text-muted-foreground"
              >
                I'll do it later
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return null
}
