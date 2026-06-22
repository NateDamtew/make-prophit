'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppKit } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { authClient } from '@/lib/auth-client'
import { lastDynamicAuthError } from '@/lib/dynamic-auth-error'
import { getTelegramInitData, isInsideTelegram, isTmaHost } from '@/lib/tma'

const { useSession } = authClient

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'makeprophit_bot'

type Screen = 'none' | 'get-started' | 'permission' | 'open-in-telegram'
type Status = 'idle' | 'initializing' | 'error'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function TelegramLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#229ED9" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.932z" />
    </svg>
  )
}

/**
 * Telegram Mini App onboarding. Sign-in is strictly gated on creating an
 * embedded EVM wallet — there is no session without one (no HMAC fallback). The
 * flow is user-initiated so `initData` is captured fresh (no reload in the
 * middle): Get Started → permission → mint token → Dynamic telegramSignIn
 * (embedded wallet) → SIWE → a session with a Polygon address.
 */
export default function TmaAutoLogin() {
  const { sdkHasLoaded, dynamicWalletAddress, isTelegramEnabled, isDynamicAuthed, signInWithTelegram } = useAppKit()
  const { data: session, isPending } = useSession()
  const hasHydrated = useHasHydrated()
  const initialized = useRef(false)
  // Latest Dynamic wallet address, readable from inside the async init closure.
  const dynamicWalletRef = useRef<string | undefined>(undefined)
  dynamicWalletRef.current = dynamicWalletAddress
  const [screen, setScreen] = useState<Screen>('none')
  const [status, setStatus] = useState<Status>('idle')
  const [statusMessage, setStatusMessage] = useState('Setting up your Prophit account…')
  const [error, setError] = useState<string | null>(null)

  const hasWallet = Boolean(session?.user && (session.user as { address?: string | null }).address)

  // Decide the initial screen once we know the auth state. No auto-login.
  useEffect(() => {
    if (!hasHydrated || isPending || initialized.current) {
      return
    }
    if (!isTmaHost() && !isInsideTelegram()) {
      return
    }
    if (hasWallet) {
      return // already signed in with a wallet — nothing to show
    }
    initialized.current = true
    if (isInsideTelegram() && getTelegramInitData()) {
      setScreen('get-started')
    }
    else {
      // On tma.* in a normal browser (no Telegram context / initData).
      setScreen('open-in-telegram')
    }
  }, [hasHydrated, isPending, hasWallet])

  const runInit = useCallback(async () => {
    const initData = getTelegramInitData()
    if (!initData) {
      setStatus('error')
      setError('Could not read your Telegram session. Please re-open Prophit from the bot.')
      return
    }

    setError(null)
    setStatus('initializing')
    lastDynamicAuthError.message = null // reset so we capture only this attempt

    // Fail fast with a clear reason if Dynamic would silently no-op
    // telegramSignIn (the cause when nothing gets created in Dynamic).
    if (!isTelegramEnabled) {
      setStatus('error')
      setError(`Telegram provider not enabled in Dynamic's loaded settings — check the dashboard env + redeploy. [dynamicAuthed=${isDynamicAuthed}]`)
      return
    }

    try {
      setStatusMessage('Creating your account… (1/3)')
      const tokenRes = await fetch('/api/tma/dynamic-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
        signal: AbortSignal.timeout(15_000),
      }).catch((caught: unknown) => {
        throw new Error(`token request error: ${errorMessage(caught)}`)
      })
      if (!tokenRes.ok) {
        throw new Error(`token request failed (HTTP ${tokenRes.status})`)
      }
      const { telegramAuthToken, probe } = await tokenRes.json() as {
        telegramAuthToken?: string
        probe?: { status: number, body: string } | null
      }
      // DIAGNOSTIC: our backend called Dynamic's /telegram/auth directly — if it
      // rejected, show Dynamic's REAL error instead of the SDK's generic one.
      if (probe && (probe.status === 0 || probe.status >= 400)) {
        setStatus('error')
        setError(`Dynamic /telegram/auth → ${probe.status}: ${probe.body}`)
        return
      }
      if (!telegramAuthToken) {
        throw new Error('server returned no token')
      }

      setStatusMessage('Signing in… (2/3)')
      try {
        await signInWithTelegram(telegramAuthToken)
      }
      catch (signinErr) {
        throw new Error(`Dynamic sign-in rejected: ${errorMessage(signinErr)}`)
      }

      // telegramSignIn can resolve without authenticating, so we VERIFY a wallet
      // address actually appeared before treating it as success.
      setStatusMessage('Creating your wallet… (3/3)')
      const deadline = Date.now() + 15_000
      while (Date.now() < deadline) {
        const current = await authClient.getSession()
        const address = (current?.data?.user as { address?: string | null } | undefined)?.address
        if (address) {
          window.location.reload() // land cleanly on the wallet-backed session
          return
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      throw new Error(`no wallet address in time (Dynamic wallet: ${dynamicWalletRef.current ?? 'none'}, telegramEnabled=${isTelegramEnabled}, dynamicAuthed=${isDynamicAuthed}, authError: ${lastDynamicAuthError.message ?? 'none'})`)
    }
    catch (caught) {
      console.error('TMA embedded-wallet init failed:', caught)
      setStatus('error')
      setError(errorMessage(caught))
    }
  }, [signInWithTelegram, isTelegramEnabled, isDynamicAuthed])

  function handleOpenTelegram() {
    window.open(`https://t.me/${BOT_USERNAME}/Prophit`, '_blank')
  }

  if (!hasHydrated || hasWallet) {
    return null
  }

  // Initializing / error overlay.
  if (status === 'initializing' || status === 'error') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6">
        <div className="flex w-72 flex-col items-center gap-3 rounded-2xl bg-background p-8">
          {status === 'initializing'
            ? (
                <>
                  <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-center text-sm text-muted-foreground">{statusMessage}</p>
                </>
              )
            : (
                <>
                  <p className="text-center text-sm font-medium text-destructive">{error}</p>
                  <button
                    type="button"
                    onClick={() => void runInit()}
                    className="mt-2 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatus('idle')
                      setScreen('get-started')
                    }}
                    className="w-full rounded-xl py-2 text-sm text-muted-foreground"
                  >
                    Cancel
                  </button>
                </>
              )}
        </div>
      </div>
    )
  }

  // Permission modal.
  if (screen === 'permission') {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <div className="absolute inset-0 bg-black/60" onClick={() => setScreen('get-started')} />
        <div className="
          relative w-full rounded-t-2xl bg-background p-6 pb-10 text-center shadow-xl
          sm:max-w-sm sm:rounded-2xl sm:pb-6
        "
        >
          <div className="mb-4 flex justify-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-[#229ED9]/10">
              <TelegramLogo className="size-9" />
            </div>
          </div>
          <h2 className="mb-2 text-lg font-semibold">Continue with Telegram</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            By continuing, you agree to use your Telegram account to create your Prophit account and wallet.
          </p>
          <button
            type="button"
            onClick={() => void runInit()}
            disabled={!sdkHasLoaded}
            className="
              mb-3 w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity
              active:opacity-80
              disabled:cursor-not-allowed disabled:opacity-50
            "
          >
            {sdkHasLoaded ? 'Allow' : 'Loading…'}
          </button>
          <button
            type="button"
            onClick={() => setScreen('get-started')}
            className="w-full rounded-xl py-3 text-sm text-muted-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Get Started (inside Telegram).
  if (screen === 'get-started') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-[#229ED9]/10">
            <TelegramLogo className="size-10" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Welcome to Prophit</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Get started with your Telegram account — we'll create your account and wallet in a tap.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setScreen('permission')}
            className="
              w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity
              active:opacity-80
            "
          >
            Get Started
          </button>
        </div>
      </div>
    )
  }

  // On tma.* in a regular browser — prompt to open inside Telegram.
  if (screen === 'open-in-telegram') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-[#229ED9]/10">
            <TelegramLogo className="size-10" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Open in Telegram</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Launch Prophit from the bot to sign in with your Telegram account.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenTelegram}
            className="
              w-full rounded-xl bg-[#229ED9] py-3.5 text-sm font-semibold text-white transition-opacity
              active:opacity-80
            "
          >
            Open in Telegram
          </button>
        </div>
      </div>
    )
  }

  return null
}
