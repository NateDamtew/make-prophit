'use client'

import { cn } from '@/lib/utils'

/**
 * Quick amounts under the field. Values are a per-currency slot: KES gets
 * 50 / 100 / 500 / 1,000, UGX would get 1,000 / 2,000 / 5,000 / 10,000.
 */

interface AmountChipsProps {
  values: number[]
  /** The current amount in whole units; the matching chip reads as selected. */
  selected: number | null
  onPick: (value: number) => void
  /** Optional extra chip ("All") appended at the end. */
  extra?: { label: string; onPick: () => void; selected?: boolean } | null
  className?: string
}

/** Default quick amounts from the minimum stake (20 → 50 / 100 / 500 / 1,000). */
export function defaultChipValues(minStakeMajor: number): number[] {
  const base = Math.max(1, minStakeMajor)
  const raw = [base * 2.5, base * 5, base * 25, base * 50]
  const rounded = raw.map((value) => {
    const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1)
    return Math.max(base, Math.round(value / magnitude) * magnitude)
  })
  return Array.from(new Set(rounded))
}

function chipClass(active: boolean) {
  return cn(
    'h-10 rounded-full text-sm font-semibold tabular-nums transition-colors',
    active ? 'bg-foreground text-background' : 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
  )
}

export function AmountChips({ values, selected, onPick, extra = null, className }: AmountChipsProps) {
  return (
    <div className={cn('grid gap-2', extra ? 'grid-cols-5' : 'grid-cols-4', className)}>
      {values.map((value) => (
        <button key={value} type="button" className={chipClass(selected === value)} onClick={() => onPick(value)}>
          {value.toLocaleString('en-US')}
        </button>
      ))}
      {extra && (
        <button type="button" className={chipClass(Boolean(extra.selected))} onClick={extra.onPick}>
          {extra.label}
        </button>
      )}
    </div>
  )
}
