'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppKit } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { authClient } from '@/lib/auth-client'
import { getTelegramInitData, isInsideTelegram, isTmaHost } from '@/lib/tma'

const { useSession } = authClient

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'makeprophit_bot'

type Screen = 'none' | 'get-started' | 'signin' | 'open-in-telegram'

function TelegramLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#229ED9" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.932z" />
    </svg>
  )
}

/**
 * Telegram Mini App onboarding. Uses Dynamic's STANDARD social sign-in (the same
 * flow as the modal's Telegram button — proper OAuth + state handshake), which
 * on success creates an embedded EVM wallet and drives SIWE. Telegram-first,
 * with "Other options" opening Dynamic's full modal (Google / email / wallets).
 */
export default function TmaAutoLogin() {
  const { open, sdkHasLoaded, signInWithTelegram } = useAppKit()
  const { data: session, isPending } = useSession()
  const hasHydrated = useHasHydrated()
  const initialized = useRef(false)
  const [screen, setScreen] = useState<Screen>('none')
  const [error, setError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  const hasWallet = Boolean(session?.user && (session.user as { address?: string | null }).address)

  // Decide the initial screen once we know the auth state.
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
      // On tma.* in a normal browser (not launched inside Telegram).
      setScreen('open-in-telegram')
    }
  }, [hasHydrated, isPending, hasWallet])

  const handleTelegramSignIn = useCallback(async () => {
    setError(null)
    setIsSigningIn(true)
    try {
      // On success, onAuthSuccess drives SIWE and sets the address — the
      // hasWallet gate below then clears this UI.
      await signInWithTelegram()
    }
    catch (caught) {
      console.error('Telegram sign-in failed:', caught)
      setError('Telegram sign-in failed. Try "Other options" below.')
    }
    finally {
      setIsSigningIn(false)
    }
  }, [signInWithTelegram])

  function handleOtherOptions() {
    setScreen('none')
    void open() // Dynamic's full auth modal: Google / email / wallets
  }

  function handleOpenTelegram() {
    window.open(`https://t.me/${BOT_USERNAME}/Prophit`, '_blank')
  }

  if (!hasHydrated || hasWallet) {
    return null
  }

  // Sign-in modal: Telegram-first, with a small link to the other methods.
  if (screen === 'signin') {
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
          <h2 className="mb-1 text-lg font-semibold">Sign in to Prophit</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Use your Telegram account to create your Prophit account and wallet.
          </p>

          <button
            type="button"
            onClick={() => void handleTelegramSignIn()}
            disabled={!sdkHasLoaded || isSigningIn}
            className="
              w-full rounded-xl bg-[#229ED9] py-3.5 text-sm font-semibold text-white transition-opacity
              active:opacity-80
              disabled:cursor-not-allowed disabled:opacity-50
            "
          >
            {isSigningIn ? 'Signing in…' : sdkHasLoaded ? 'Sign in with Telegram' : 'Loading…'}
          </button>

          {error && <p className="mt-3 text-sm font-medium text-destructive">{error}</p>}

          <button
            type="button"
            onClick={handleOtherOptions}
            className="mt-4 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Other sign-in options
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
              Sign in with your Telegram account to start trading — we'll set up your wallet in a tap.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setScreen('signin')}
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
