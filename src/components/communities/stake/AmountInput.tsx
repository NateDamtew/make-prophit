'use client'

import type { RefObject } from 'react'

import { InfoIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The amount field: a big number, the currency beside it, whole units only.
 * Problems are words and an icon in the normal text colour, never red (red
 * means No on these screens).
 */

interface AmountInputProps {
  /** Whole major units as typed, digits only ("1000"). */
  value: string
  onChange: (value: string) => void
  currency: string | null
  id?: string
  label?: string
  /** A problem with the amount, shown under the field. */
  message?: React.ReactNode
  /** Highlight the border (used when the balance is short). */
  attention?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  autoFocus?: boolean
  className?: string
}

function formatAmountDisplay(digits: string): string {
  const cleaned = digits.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  if (!cleaned) {
    return ''
  }
  return Number(cleaned).toLocaleString('en-US')
}

export function AmountInput({
  value,
  onChange,
  currency,
  id = 'stake-amount',
  label = 'Amount',
  message,
  attention = false,
  inputRef,
  autoFocus,
  className,
}: AmountInputProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-muted-foreground">
        {label}
      </label>
      <div
        className={cn(
          'flex h-16 items-center gap-2 rounded-md border bg-background px-4 transition-colors focus-within:border-foreground focus-within:ring-2 focus-within:ring-foreground/10',
          attention ? 'border-muted-foreground' : 'border-border',
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="0"
          value={formatAmountDisplay(value)}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 12))}
          className="min-w-0 flex-1 bg-transparent text-[32px]/none font-bold text-foreground tabular-nums outline-none placeholder:text-muted-foreground/40"
        />
        {currency && <span className="text-[17px] font-semibold text-muted-foreground">{currency}</span>}
      </div>
      {message && (
        <p className="flex items-start gap-1.5 text-[13px]/snug text-foreground">
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </p>
      )}
    </div>
  )
}
