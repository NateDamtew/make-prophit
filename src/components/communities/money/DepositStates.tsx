'use client'

import { SmartphoneIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'

import { formatMoney } from '@/components/communities/format'
import { Button } from '@/components/ui/button'

/**
 * The two screens every mobile money deposit shares, whether it starts from
 * the stake sheet or the deposit sheet: the phone prompt is out, and the
 * prompt did not go through.
 */

export function DepositWaiting({
  amountMinor,
  currency,
  phone,
  onCancel,
  onNotReceived,
}: {
  amountMinor: bigint
  currency: string | null
  phone: string
  onCancel: () => void
  onNotReceived: () => void
}) {
  const t = useExtracted()
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <div className="relative flex size-32 items-center justify-center rounded-full border-2 border-border">
        <span
          className="absolute inset-[-2px] animate-spin rounded-full border-2 border-transparent border-t-foreground border-r-foreground"
          aria-hidden="true"
        />
        <div className="flex size-24 items-center justify-center rounded-full bg-secondary">
          <SmartphoneIcon className="size-10" aria-hidden="true" />
        </div>
      </div>
      <div>
        <h2 className="text-[26px]/tight font-bold">{t('Check your phone')}</h2>
        <p className="mt-2 text-base/relaxed text-muted-foreground tabular-nums">
          {t('Mobile money is asking you to pay {amount} to Prophit. Enter your PIN to approve it.', {
            amount: formatMoney(amountMinor, currency),
          })}
        </p>
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">{t('Prompt sent to {phone}.', { phone })}</p>
      <ol className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left text-sm/snug">
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
            1
          </span>
          {t('Unlock your phone. The payment prompt shows on screen.')}
        </li>
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
            2
          </span>
          {t('Enter your PIN and press OK.')}
        </li>
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
            3
          </span>
          {t('Stay on this page. Your money shows up here on its own, no need to tap anything.')}
        </li>
      </ol>
      <div className="flex w-full flex-col gap-2">
        <Button variant="secondary" size="lg" className="h-12 rounded-md" onClick={onNotReceived}>
          {t('Didn’t get it?')}
        </Button>
        <Button variant="ghost" size="lg" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <p className="text-xs text-muted-foreground">{t('Deposits are free.')}</p>
      </div>
    </div>
  )
}

export function DepositFailed({
  amountMinor,
  currency,
  phone,
  reason,
  stakeLine,
  onRetry,
  onChangeNumber,
}: {
  amountMinor: bigint
  currency: string | null
  phone: string
  reason: string | null
  /** What is still saved for the person, e.g. the stake that waits on this deposit. */
  stakeLine?: string
  onRetry: () => void
  onChangeNumber: () => void
}) {
  const t = useExtracted()
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[22px]/tight font-bold">{t('The payment prompt didn’t go through')}</h2>
        <p className="mt-2 text-sm/relaxed text-muted-foreground">
          {reason ?? t('No PIN was entered in time, so nothing was taken from your phone.')} {stakeLine ?? ''}
        </p>
      </div>
      <div className="rounded-xl bg-secondary p-3.5 text-sm tabular-nums">
        <p>
          {t('Sending to')} <strong>{phone}</strong>
        </p>
        <p className="text-muted-foreground">
          {t('Amount {amount}. Deposits are free.', { amount: formatMoney(amountMinor, currency) })}
        </p>
      </div>
      <Button size="lg" className="h-13 rounded-md text-base font-bold" onClick={onRetry}>
        {t('Send the prompt again')}
      </Button>
      <Button variant="secondary" size="lg" className="h-12 rounded-md" onClick={onChangeNumber}>
        {t('Use a different number')}
      </Button>
    </div>
  )
}
