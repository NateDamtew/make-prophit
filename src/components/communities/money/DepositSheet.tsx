'use client'

import { CheckIcon, XIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'

import { createMobileMoneyDepositAction } from '@/app/[locale]/(platform)/_actions/mobile-money'
import { formatMoney } from '@/components/communities/format'
import { DepositFailed, DepositWaiting } from '@/components/communities/money/DepositStates'
import {
  useInvalidateMobileMoney,
  useMobileMoneyIntent,
  useMobileMoneySummary,
} from '@/components/communities/money/useMobileMoney'
import { CommunitySheet } from '@/components/communities/sheet/CommunitySheet'
import { AmountChips, defaultChipValues } from '@/components/communities/stake/AmountChips'
import { AmountInput } from '@/components/communities/stake/AmountInput'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { Link } from '@/i18n/navigation'

/**
 * Deposit with mobile money, on its own (header "Deposit", `?sheet=deposit`).
 * Amount and number, then the phone prompt, then the money shows in the
 * balance. Views: form → waiting → (failed → form) → done.
 */

interface DepositSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  community: { slug: string; name: string }
}

type View = 'form' | 'waiting' | 'failed' | 'done'

function majorToMinor(amount: string): bigint {
  const whole = Number.parseInt(amount, 10)
  return Number.isFinite(whole) && whole > 0 ? BigInt(whole) * 100n : 0n
}

export function DepositSheet({ open, onOpenChange, community }: DepositSheetProps) {
  const t = useExtracted()
  const moneyQuery = useMobileMoneySummary()
  const invalidateMoney = useInvalidateMobileMoney()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [amount, setAmount] = useState('')
  const [phoneInput, setPhoneInput] = useState<string | null>(null)
  const [view, setView] = useState<View>('form')
  const [intentId, setIntentId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const summary = moneyQuery.data ?? null
  const currency = summary?.currency ?? null
  const phone = phoneInput ?? summary?.savedAccounts?.[0]?.msisdn ?? ''
  const minDepositMinor = summary?.limits ? BigInt(summary.limits.minDepositMinor) : 5_000n
  const maxDepositMinor = summary?.limits ? BigInt(summary.limits.maxDepositMinor) : null
  const amountMinor = majorToMinor(amount)
  const amountNumber = Number.parseInt(amount, 10) || 0
  // Round deposit sizes people reach for; the generic ladder only when the minimum is unusual.
  const chips = useMemo(() => {
    const minMajor = Number(minDepositMinor / 100n)
    const round = [50, 100, 500, 1000].filter((value) => value >= minMajor)
    return round.length >= 3 ? round : defaultChipValues(minMajor)
  }, [minDepositMinor])
  const belowMinimum = amountMinor > 0n && amountMinor < minDepositMinor
  const overMaximum = maxDepositMinor !== null && amountMinor > maxDepositMinor

  const intentQuery = useMobileMoneyIntent(view === 'waiting' ? intentId : null)
  const intent = view === 'waiting' ? (intentQuery.data ?? null) : null
  const intentFailed = intent?.state === 'failed' || intent?.state === 'rejected' || intent?.state === 'cancelled'
  const completed = intent?.state === 'completed' ? intent : null
  const effectiveView: View = completed ? 'done' : intentFailed ? 'failed' : view

  const completedId = completed?.id ?? null
  useEffect(() => {
    if (completedId) {
      void invalidateMoney()
    }
  }, [completedId, invalidateMoney])

  function reset() {
    setView('form')
    setIntentId(null)
    setAmount('')
  }

  async function handleDeposit() {
    if (!phone.trim()) {
      toast.error(t('Enter the mobile money number to pay from.'))
      return
    }
    if (amountMinor <= 0n || belowMinimum || overMaximum) {
      inputRef.current?.focus()
      return
    }
    setSubmitting(true)
    try {
      const result = await createMobileMoneyDepositAction({ phoneInput: phone, amountInput: String(amountNumber) })
      if (result.error || !result.data) {
        toast.error(result.error ?? t('Could not start the deposit.'))
        return
      }
      if (result.data.failure) {
        toast.error(result.data.failure.message)
        return
      }
      setIntentId(result.data.intentId)
      setView('waiting')
    } finally {
      setSubmitting(false)
    }
  }

  let body: React.ReactNode
  if (effectiveView === 'waiting') {
    body = (
      <DepositWaiting
        amountMinor={amountMinor}
        currency={currency}
        phone={phone}
        onCancel={reset}
        onNotReceived={() => setView('failed')}
      />
    )
  } else if (effectiveView === 'failed') {
    body = (
      <DepositFailed
        amountMinor={amountMinor}
        currency={currency}
        phone={phone}
        reason={intentQuery.data?.failureMessage ?? null}
        onRetry={() => void handleDeposit()}
        onChangeNumber={() => {
          setIntentId(null)
          setView('form')
        }}
      />
    )
  } else if (effectiveView === 'done' && completed) {
    body = (
      <div className="flex flex-col items-start gap-4">
        <div className="flex size-11 items-center justify-center rounded-full bg-secondary">
          <CheckIcon className="size-6" strokeWidth={2.5} aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold tabular-nums">
          {t('{amount} added from mobile money', { amount: formatMoney(completed.netMinor, completed.currency) })}
        </h2>
        <p className="text-sm/relaxed text-muted-foreground tabular-nums">
          {t('Your balance is {balance}. It is ready to stake on any market in {community}.', {
            balance: formatMoney(summary?.availableMinor ?? completed.netMinor, completed.currency),
            community: community.name,
          })}
        </p>
        <Button
          size="lg"
          className="h-13 w-full rounded-md text-base font-bold shadow-lg shadow-primary/20"
          onClick={() => onOpenChange(false)}
        >
          {t('Find a market')}
        </Button>
        <Button variant="ghost" className="self-center" onClick={reset}>
          {t('Deposit more')}
        </Button>
      </div>
    )
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between text-[13px] tabular-nums">
          <span className="text-muted-foreground">
            {t('Your balance')}{' '}
            <strong className="font-semibold text-foreground">
              {summary?.currency ? formatMoney(summary.availableMinor, currency) : '—'}
            </strong>
          </span>
          <span className="text-muted-foreground">{t('Deposits are free')}</span>
        </div>

        <div className="flex flex-col gap-2">
          <AmountInput
            value={amount}
            onChange={setAmount}
            currency={currency}
            inputRef={inputRef}
            label={t('Amount to add')}
            message={
              belowMinimum
                ? t('The smallest deposit is {min}.', { min: formatMoney(minDepositMinor, currency) })
                : overMaximum && maxDepositMinor !== null
                  ? t('The largest deposit is {max} at a time.', { max: formatMoney(maxDepositMinor, currency) })
                  : null
            }
          />
          <AmountChips
            values={chips}
            selected={amountNumber > 0 ? amountNumber : null}
            onPick={(value) => {
              setAmount(String(value))
              inputRef.current?.focus()
            }}
          />
        </div>

        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          {t('Mobile money number')}
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhoneInput(event.target.value)}
            placeholder="0712 345 678"
            className="h-11 rounded-md border border-border bg-background px-3 text-[15px] text-foreground tabular-nums outline-none focus:border-foreground"
          />
        </label>

        <Button
          type="button"
          size="lg"
          className="h-13 w-full rounded-md text-base font-bold shadow-lg ring-1 shadow-primary/20 ring-primary/20"
          disabled={submitting || amountMinor <= 0n || belowMinimum || overMaximum}
          onClick={() => void handleDeposit()}
        >
          {submitting
            ? t('One moment…')
            : t('Deposit {amount} with mobile money', { amount: formatMoney(amountMinor, currency) })}
        </Button>
        <p className="text-center text-xs text-muted-foreground tabular-nums">
          {t('You approve the payment on your phone. Minimum {min}.', {
            min: formatMoney(minDepositMinor, currency),
          })}
        </p>
      </div>
    )
  }

  return (
    <CommunitySheet open={open} onOpenChange={onOpenChange} title={t('Deposit with mobile money')}>
      <div className="flex flex-col gap-4 pt-2">
        {effectiveView === 'form' && (
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-bold">{t('Deposit with mobile money')}</h2>
            <button
              type="button"
              aria-label={t('Close')}
              onClick={() => onOpenChange(false)}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary"
            >
              <XIcon className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {body}
        {effectiveView === 'form' && (
          <p className="border-t border-border pt-3 text-center text-xs text-muted-foreground">
            <Link href={`/community/${community.slug}?sheet=withdraw`} className="underline underline-offset-[3px]">
              {t('Withdraw instead')}
            </Link>
          </p>
        )}
      </div>
    </CommunitySheet>
  )
}
