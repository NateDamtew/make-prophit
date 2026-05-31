'use client'

import { useAppKit, useAppKitAccount } from '@reown/appkit/react'
import { Wallet, X } from 'lucide-react'
import { createContext, useState } from 'react'

interface WalletGateContextValue {
  isConnected: boolean
  requireWallet: () => boolean
}

const WalletGateCtx = createContext<WalletGateContextValue>({
  isConnected: false,
  requireWallet: () => false,
})

export function TmaWalletGateProvider({ children }: { children: React.ReactNode }) {
  const { open } = useAppKit()
  const { isConnected } = useAppKitAccount()
  const [showGate, setShowGate] = useState(false)

  function requireWallet(): boolean {
    if (isConnected) {
      return true
    }
    setShowGate(true)
    return false
  }

  function handleConnect() {
    setShowGate(false)
    open()
  }

  return (
    <WalletGateCtx value={{ isConnected, requireWallet }}>
      {children}
      {showGate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowGate(false)} />
          <div className="relative w-full rounded-t-2xl bg-background p-6 pb-10 shadow-xl">
            <button
              onClick={() => setShowGate(false)}
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

            <h2 className="mb-1 text-center text-lg font-semibold">Wallet Required</h2>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              You need to connect a wallet to trade on Prophit.
            </p>

            <button
              onClick={handleConnect}
              className="
                w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity
                active:opacity-80
              "
            >
              Connect Wallet
            </button>
          </div>
        </div>
      )}
    </WalletGateCtx>
  )
}
