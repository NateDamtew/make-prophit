import { formatMoney } from '@/components/communities/format'
import { cn } from '@/lib/utils'

/**
 * "Pays about 750 KES if Yes wins". Pools pay from the final split, so the
 * number is "about" until the market closes and exact after.
 */

interface PayoutLineProps {
  payoutMinor: bigint | string | null
  currency: string | null
  outcomeLabel: string
  /** After close the estimate is final. */
  exact?: boolean
  className?: string
}

export function PayoutLine({ payoutMinor, currency, outcomeLabel, exact = false, className }: PayoutLineProps) {
  if (payoutMinor === null) {
    return null
  }
  return (
    <p className={cn('text-[15px]/snug text-foreground tabular-nums', className)}>
      Pays{' '}
      <strong>
        {exact ? '' : 'about '}
        {formatMoney(payoutMinor, currency)}
      </strong>{' '}
      if {outcomeLabel} wins
    </p>
  )
}
