'use client'

import { ArrowRightIcon, CheckCircle2Icon, Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTonWithdrawal } from '@/app/[locale]/(platform)/_components/wallet-modal/useTonWithdrawal'
import { Button } from '@/components/ui/button'
import { MAX_AMOUNT_INPUT, sanitizeNumericInput } from '@/lib/amount-input'
import { cn } from '@/lib/utils'

const QUOTE_DEBOUNCE_MS = 400

interface WithdrawalUser {
  address: string
  deposit_wallet_address?: string | null
}

function shortenTon(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}

/**
 * Polygon→TON withdrawal (Telegram Mini App only): pay USDC from the deposit
 * wallet, receive USDT at the connected TON wallet. Signs the existing
 * deposit-wallet EIP-712 batch — no TON signature.
 */
function TonWithdrawPanel({ user, onDone }: { user: WithdrawalUser | null, onDone: () => void }) {
  const {
    tonWalletAddress,
    connectTonWallet,
    status,
    error,
    quote,
    isQuoting,
    refreshQuote,
    withdraw,
  } = useTonWithdrawal(user)
  const [amount, setAmount] = useState('')

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void refreshQuote(amount)
    }, QUOTE_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [amount, refreshQuote])

  const amountNumber = Number.parseFloat(amount || '0')
  const isAmountValid = Number.isFinite(amountNumber) && amountNumber > 0
  const isBusy = status === 'preparing' || status === 'signing'

  if (!tonWalletAddress) {
    return (
      <div className="space-y-4 pt-2">
        <p className="text-center text-sm text-muted-foreground">
          Connect a TON wallet to receive your withdrawal as USDT on TON.
        </p>
        <Button type="button" className="h-12 w-full" onClick={connectTonWallet}>
          Connect TON wallet
        </Button>
      </div>
    )
  }

  if (status === 'submitted') {
    return (
      <div className="space-y-4 pt-4 text-center">
        <CheckCircle2Icon className="mx-auto size-10 text-emerald-500" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Withdrawal submitted</p>
          <p className="text-xs text-muted-foreground">
            Your USDT will arrive at your TON wallet shortly.
          </p>
        </div>
        <Button type="button" className="h-12 w-full" onClick={onDone}>
          Done
        </Button>
      </div>
    )
  }

  function handleInputChange(rawValue: string) {
    const cleaned = sanitizeNumericInput(rawValue)
    const numeric = Number.parseFloat(cleaned)
    if (cleaned === '' || Number.isNaN(numeric) || numeric <= MAX_AMOUNT_INPUT) {
      setAmount(cleaned)
    }
  }

  return (
    <div className="space-y-5 pt-2">
      <div className="flex items-center justify-center gap-2 text-center">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={event => handleInputChange(event.target.value)}
          placeholder="0.00"
          className={cn(`
            min-h-[1.2em] bg-transparent pb-1 text-center text-5xl/tight font-semibold text-foreground outline-none
          `)}
          style={{ width: `${Math.max(amount.length, 4)}ch`, maxWidth: '70vw' }}
        />
        <span className="pb-1 text-xl/tight font-semibold text-muted-foreground">USDC</span>
      </div>

      <div className="flex items-center justify-center">
        <div className="flex items-center gap-3 rounded-full bg-muted/60 px-4 py-2 text-sm">
          <span className="font-semibold text-foreground">USDC · Polygon</span>
          <ArrowRightIcon className="size-4 text-muted-foreground" />
          <span className="font-semibold text-foreground">USDT · TON</span>
        </div>
      </div>

      <div className="rounded-lg border border-border px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">You receive</span>
          {isQuoting
            ? <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            : (
                <span className="font-semibold text-foreground">
                  {quote ? `${quote.receiveAmount} USDT` : '—'}
                </span>
              )}
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>To</span>
          <span className="font-mono">{shortenTon(tonWalletAddress)}</span>
        </div>
        {quote && (
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Network + bridge fee</span>
            <span>{`$${quote.fees.feeUsd.toFixed(2)}`}</span>
          </div>
        )}
      </div>

      {error && <p className="text-center text-sm font-medium text-destructive">{error}</p>}

      <Button
        type="button"
        className="h-12 w-full"
        disabled={!isAmountValid || isBusy}
        onClick={() => void withdraw(amount)}
      >
        {isBusy
          ? (
              <span className="flex items-center gap-2">
                <Loader2Icon className="size-4 animate-spin" />
                {status === 'signing' ? 'Confirm in your wallet…' : 'Preparing…'}
              </span>
            )
          : 'Withdraw to TON'}
      </Button>
    </div>
  )
}

export default TonWithdrawPanel
