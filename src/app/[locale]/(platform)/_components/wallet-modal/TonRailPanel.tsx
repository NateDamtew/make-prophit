'use client'

import { useState } from 'react'
import TonDepositPanel from '@/app/[locale]/(platform)/_components/wallet-modal/TonDepositPanel'
import TonWithdrawPanel from '@/app/[locale]/(platform)/_components/wallet-modal/TonWithdrawPanel'
import { cn } from '@/lib/utils'

type TonMode = 'deposit' | 'withdraw'

interface RailUser {
  address: string
  deposit_wallet_address?: string | null
}

/**
 * The TON funding surface (Telegram Mini App only): a deposit/withdraw toggle
 * over the two rhino-backed flows. Loaded via next/dynamic so the TON SDK never
 * ships in the web bundle.
 */
function TonRailPanel({ user, onDone }: { user: RailUser | null, onDone: () => void }) {
  const [mode, setMode] = useState<TonMode>('deposit')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
        {(['deposit', 'withdraw'] as const).map(option => (
          <button
            key={option}
            type="button"
            className={cn(
              'flex-1 rounded-full py-2 text-sm font-medium capitalize transition',
              mode === option
                ? 'bg-background text-foreground shadow-sm'
                : `text-muted-foreground hover:text-foreground`,
            )}
            onClick={() => setMode(option)}
          >
            {option}
          </button>
        ))}
      </div>

      {mode === 'deposit'
        ? <TonDepositPanel onDone={onDone} />
        : <TonWithdrawPanel user={user} onDone={onDone} />}
    </div>
  )
}

export default TonRailPanel
