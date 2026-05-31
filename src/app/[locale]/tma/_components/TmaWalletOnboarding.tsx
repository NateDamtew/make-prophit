'use client'

import { useAppKit, useAppKitAccount } from '@reown/appkit/react'
import { Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { useTmaUser } from './TmaProvider'

const STORAGE_KEY = 'tma_wallet_onboarding_skipped'

function wasSkipped() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  }
  catch {
    return false
  }
}

export default function TmaWalletOnboarding() {
  const user = useTmaUser()
  const { open } = useAppKit()
  const { isConnected } = useAppKitAccount()
  const [dismissed, setDismissed] = useState(wasSkipped)

  const show = !!user && !isConnected && !dismissed

  function handleConnect() {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
    open()
  }

  function handleSkip() {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
  }

  if (!show) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleSkip} />
      <div className="relative w-full rounded-t-2xl bg-background p-6 pb-10 shadow-xl">
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
          Connect a wallet to trade on Prophit. You can skip for now and browse markets.
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
