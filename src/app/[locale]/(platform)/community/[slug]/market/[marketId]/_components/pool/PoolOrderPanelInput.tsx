'use client'

import type { RefObject } from 'react'

import { useExtracted } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDisplayAmount, getAmountSizeClass, sanitizeNumericInput } from '@/lib/amount-input'
import { formatAmountInputValue } from '@/lib/formatters'
import { formatPoolMoney } from '@/lib/pools/format'
import { cn } from '@/lib/utils'
import { usePortfolioValueVisibility } from '@/stores/usePortfolioValueVisibility'

/**
 * Amount input for pool stakes: the platform `EventOrderPanelInput` buy
 * layout with the balance, quick-add chips and Max button in the pool's
 * local currency.
 */

interface PoolOrderPanelInputProps {
  isMobile: boolean
  amount: string
  amountNumber: number
  currency: string | null
  balanceMinor: bigint | null
  isBalanceLoading: boolean
  chipValues: number[]
  stepValue: number
  maxAmount: number
  inputRef: RefObject<HTMLInputElement | null>
  onAmountChange: (value: string) => void
  shouldShake?: boolean
}

function formatChipLabel(value: number) {
  if (value >= 1_000_000) {
    return `+${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  }
  if (value >= 1_000) {
    return `+${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`
  }
  return `+${value}`
}

export default function PoolOrderPanelInput({
  isMobile,
  amount,
  amountNumber,
  currency,
  balanceMinor,
  isBalanceLoading,
  chipValues,
  stepValue,
  maxAmount,
  inputRef,
  onAmountChange,
  shouldShake,
}: PoolOrderPanelInputProps) {
  const t = useExtracted()
  const areValuesHidden = usePortfolioValueVisibility((state) => state.isHidden)

  function focusInput() {
    inputRef.current?.focus()
  }

  function handleInputChange(rawValue: string) {
    onAmountChange(sanitizeNumericInput(rawValue))
  }

  function handleBlur(value: string) {
    const cleaned = sanitizeNumericInput(value)
    const numeric = Number.parseFloat(cleaned)
    if (!cleaned || Number.isNaN(numeric)) {
      onAmountChange('')
      return
    }
    onAmountChange(formatAmountInputValue(numeric))
  }

  function setMax() {
    onAmountChange(formatAmountInputValue(Math.max(0, maxAmount), { roundingMode: 'floor' }))
    focusInput()
  }

  const amountSizeClass = getAmountSizeClass(amount)
  const inputValue = formatDisplayAmount(amount)
  const balanceLabel = balanceMinor === null ? null : formatPoolMoney(balanceMinor, currency)

  return (
    <>
      {isMobile ? (
        <div className="mb-4">
          <div className="mb-4 flex items-center justify-center gap-4">
            <Button
              type="button"
              onClick={() => onAmountChange(formatAmountInputValue(Math.max(0, amountNumber - stepValue)))}
              size="icon"
              variant="ghost"
            >
              −
            </Button>
            <div className="flex-1 text-center">
              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                className={cn(
                  `w-full [appearance:textfield] border-0 bg-transparent text-center font-semibold text-foreground placeholder-muted-foreground outline-hidden [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`,
                  amountSizeClass,
                  { 'animate-order-shake': shouldShake },
                )}
                placeholder="0"
                value={inputValue}
                onChange={(event) => handleInputChange(event.target.value)}
                onBlur={(event) => handleBlur(event.target.value)}
              />
              {currency && <div className="text-xs font-medium text-muted-foreground">{currency}</div>}
            </div>
            <Button
              type="button"
              onClick={() => onAmountChange(formatAmountInputValue(amountNumber + stepValue))}
              size="icon"
              variant="ghost"
            >
              +
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-2 flex items-center gap-3">
          <div className="shrink-0">
            <div className="text-lg font-medium">{t('Amount')}</div>
            <div className="text-xs text-muted-foreground">
              {isBalanceLoading ? (
                <Skeleton className="inline-block h-3 w-16 align-middle" />
              ) : balanceLabel !== null ? (
                <button
                  type="button"
                  className="cursor-pointer bg-transparent p-0 text-left transition-colors hover:text-foreground"
                  onClick={setMax}
                >
                  {t('Balance')} {areValuesHidden ? '****' : balanceLabel}
                </button>
              ) : null}
            </div>
          </div>
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              className={cn(
                `h-14 w-full [appearance:textfield] border-0 bg-transparent text-right font-semibold text-slate-700 placeholder-slate-400 outline-hidden dark:text-slate-300 dark:placeholder-slate-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`,
                amountSizeClass,
                { 'animate-order-shake': shouldShake },
              )}
              placeholder="0"
              value={inputValue}
              onChange={(event) => handleInputChange(event.target.value)}
              onBlur={(event) => handleBlur(event.target.value)}
            />
            {currency && (
              <span className="pointer-events-none absolute top-1 right-0 text-xs font-medium text-muted-foreground">
                {currency}
              </span>
            )}
          </div>
        </div>
      )}

      <div className={cn('mb-3 flex gap-2', isMobile ? 'justify-center' : 'justify-end')}>
        {chipValues.map((chipValue) => (
          <Button
            type="button"
            key={chipValue}
            size="sm"
            variant="outline"
            className="px-2 text-xs"
            onClick={() => {
              onAmountChange(formatAmountInputValue(amountNumber + chipValue))
              focusInput()
            }}
          >
            {formatChipLabel(chipValue)}
          </Button>
        ))}
        <Button type="button" size="sm" variant="outline" className="text-xs" onClick={setMax}>
          {t('Max')}
        </Button>
      </div>
    </>
  )
}
