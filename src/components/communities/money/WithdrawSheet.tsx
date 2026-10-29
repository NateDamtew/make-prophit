'use client'

import { CheckIcon, XIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { MobileMoneyPayoutPreview } from '@/app/[locale]/(platform)/_actions/mobile-money'

import {
  createMobileMoneyPayoutAction,
  previewMobileMoneyPayoutAction,
} from '@/app/[locale]/(platform)/_actions/mobile-money'
import { formatMoney } from '@/components/communities/format'
import { useInvalidateMobileMoney, useMobileMoneySummary } from '@/components/communities/money/useMobileMoney'
import { CommunitySheet } from '@/components/communities/sheet/CommunitySheet'
import { AmountChips } from '@/components/communities/stake/AmountChips'
import { AmountInput } from '@/components/communities/stake/AmountInput'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * Withdraw to mobile money (`?sheet=withdraw`, "Withdraw" on a paid market).
 * Amount with 500 / 1,000 / All, the number it goes to, the fee row, then one
 * confirm step: a plain confirm, or the authenticator code when the account
 * has 2FA on. Views: form → confirm → done.
 */

interface WithdrawSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  community: { slug: string; name: string }
}

type View = 'form' | 'confirm' | 'done'

interface Done {
  intentId: string
  state: string
  grossMinor: string
  feeMinor: string
  netMinor: string
  currency: string
  msisdn: string
  failure: string | null
}

function majorToMinor(amount: string): bigint {
  const whole = Number.parseInt(amount, 10)
  return Number.isFinite(whole) && whole > 0 ? BigInt(whole) * 100n : 0n
}

/** A short reference people can quote to support, from the intent id. */
function shortReference(intentId: string): string {
  const tail = intentId
    .replace(/[^a-z0-9]/gi, '')
    .slice(-6)
    .toUpperCase()
  return `PRF-${tail.slice(0, 4)}-${tail.slice(4)}`
}

export function WithdrawSheet({ open, onOpenChange, community }: WithdrawSheetProps) {
  const t = useExtracted()
  const moneyQuery = useMobileMoneySummary()
  const invalidateMoney = useInvalidateMobileMoney()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [amount, setAmount] = useState('')
  const [phoneInput, setPhoneInput] = useState<string | null>(null)
  const [editingPhone, setEditingPhone] = useState(false)
  const [view, setView] = useState<View>('form')
  // The last quote, keyed by the number and amount it was for; stale ones are ignored at render.
  const [quoteEntry, setQuoteEntry] = useState<{
    key: string
    data: MobileMoneyPayoutPreview | null
    error: string | null
  } | null>(null)
  const [totp, setTotp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<Done | null>(null)

  const summary = moneyQuery.data ?? null
  const currency = summary?.currency ?? null
  const availableMinor = summary ? BigInt(summary.availableMinor) : 0n
  const feeMinor = summary?.limits ? BigInt(summary.limits.withdrawalFeeMinor) : 0n
  const minPayoutMinor = summary?.limits ? BigInt(summary.limits.minPayoutMinor) : 0n
  const savedPhone = summary?.savedAccounts?.[0]?.msisdn ?? ''
  const phone = phoneInput ?? savedPhone
  const amountMinor = majorToMinor(amount)
  const amountNumber = Number.parseInt(amount, 10) || 0
  const allMajor = Number(availableMinor / 100n)
  const chips = useMemo(() => [500, 1000].filter((value) => BigInt(value) * 100n <= availableMinor), [availableMinor])
  const overBalance = amountMinor > availableMinor
  const belowMinimum = amountMinor > 0n && amountMinor < minPayoutMinor
  const frozen = summary?.withdrawalsFrozen ?? false
  const inputsValid = amountMinor > 0n && !overBalance && !belowMinimum && phone.trim().length > 0
  const quoteKey = `${phone.trim()}|${amountNumber}`
  const quote = inputsValid && quoteEntry?.key === quoteKey ? quoteEntry.data : null
  const quoteError = inputsValid && quoteEntry?.key === quoteKey ? quoteEntry.error : null
  const quoting = inputsValid && quoteEntry?.key !== quoteKey

  // Quote the exact fee and net for this number and amount (debounced).
  useEffect(() => {
    if (view !== 'form' || !inputsValid) {
      return
    }
    let cancelled = false
    const handle = window.setTimeout(async () => {
      const result = await previewMobileMoneyPayoutAction({ phoneInput: phone, amountInput: String(amountNumber) })
      if (cancelled) {
        return
      }
      setQuoteEntry({ key: quoteKey, data: result.data, error: result.data ? null : result.error })
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [view, inputsValid, amountNumber, phone, quoteKey])

  async function handleConfirm() {
    if (!quote) {
      return
    }
    setSubmitting(true)
    try {
      const result = await createMobileMoneyPayoutAction({
        phoneInput: phone,
        amountInput: String(amountNumber),
        confirmationToken: quote.confirmationToken,
        totpCode: quote.requiresTwoFactor ? totp : undefined,
      })
      if (result.error || !result.data) {
        toast.error(result.error ?? t('Could not start the withdrawal.'))
        return
      }
      setDone({
        intentId: result.data.intentId,
        state: result.data.state,
        grossMinor: result.data.grossMinor,
        feeMinor: result.data.feeMinor,
        netMinor: result.data.netMinor,
        currency: result.data.currency,
        msisdn: result.data.msisdn,
        failure: result.data.failure?.message ?? null,
      })
      setView('done')
      void invalidateMoney()
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setView('form')
    setDone(null)
    setAmount('')
    setTotp('')
    setQuoteEntry(null)
  }

  const displayFee = quote ? BigInt(quote.feeMinor) : feeMinor
  const displayNet = quote ? BigInt(quote.netMinor) : amountMinor > displayFee ? amountMinor - displayFee : 0n
  const canContinue = Boolean(quote) && !quoting && !overBalance && !belowMinimum && amountMinor > 0n && !frozen

  let body: React.ReactNode
  if (view === 'done' && done) {
    const failed = done.state === 'failed' || done.state === 'rejected' || done.state === 'cancelled'
    body = failed ? (
      <div className="flex flex-col gap-4">
        <h2 className="text-[22px]/tight font-bold">{t('The withdrawal was returned')}</h2>
        <p className="text-sm/relaxed text-muted-foreground">
          {done.failure ?? t('Mobile money did not accept it. Your balance is untouched.')}
        </p>
        <Button size="lg" className="h-13 rounded-md text-base font-bold" onClick={reset}>
          {t('Try again')}
        </Button>
      </div>
    ) : (
      <div className="flex flex-col gap-4">
        <div className="flex size-11 items-center justify-center rounded-full bg-secondary">
          <CheckIcon className="size-6" strokeWidth={2.5} aria-hidden="true" />
        </div>
        <h2 className="text-[26px]/tight font-bold tabular-nums">
          {t('{amount} is on its way', { amount: formatMoney(done.netMinor, done.currency) })}
        </h2>
        <p className="text-sm/relaxed text-muted-foreground tabular-nums">
          {t('To mobile money {phone}. The confirmation SMS usually arrives within a minute.', {
            phone: done.msisdn,
          })}
        </p>
        <dl className="grid grid-cols-[1fr_auto] gap-y-2 rounded-xl border border-border bg-card p-4 text-sm tabular-nums">
          <dt className="text-muted-foreground">{t('Withdrawn')}</dt>
          <dd className="font-semibold">{formatMoney(done.grossMinor, done.currency)}</dd>
          <dt className="text-muted-foreground">{t('Fee')}</dt>
          <dd className="font-semibold">{formatMoney(done.feeMinor, done.currency)}</dd>
          <dt className="text-muted-foreground">{t('Sent to mobile money')}</dt>
          <dd className="font-semibold">{formatMoney(done.netMinor, done.currency)}</dd>
          <dt className="text-muted-foreground">{t('Balance now')}</dt>
          <dd className="font-semibold">{summary ? formatMoney(summary.availableMinor, done.currency) : '—'}</dd>
          <dt className="text-muted-foreground">{t('Reference')}</dt>
          <dd className="font-mono text-xs font-semibold">{shortReference(done.intentId)}</dd>
        </dl>
        <p className="text-xs/relaxed text-muted-foreground">
          {t('Not arrived in 10 minutes? Quote the reference when you ask for help.')}
        </p>
        <Button
          size="lg"
          nativeButton={false}
          render={<Link href={`/community/${community.slug}`} />}
          className="h-13 w-full rounded-md text-base font-bold shadow-lg shadow-primary/20"
          onClick={() => onOpenChange(false)}
        >
          {t('Find your next market')}
        </Button>
        <Button variant="ghost" className="self-center" onClick={() => onOpenChange(false)}>
          {t('Back to {community}', { community: community.name })}
        </Button>
      </div>
    )
  } else if (view === 'confirm' && quote) {
    body = (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-secondary p-4 tabular-nums">
          <p className="text-[13px] text-muted-foreground">{t('You’re sending')}</p>
          <p className="text-[28px]/tight font-bold">{formatMoney(quote.netMinor, quote.currency)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('to {provider} {phone}, after the {fee} fee', {
              provider: quote.providerDisplayName,
              phone: quote.msisdn,
              fee: formatMoney(quote.feeMinor, quote.currency),
            })}
          </p>
        </div>
        {quote.requiresTwoFactor ? (
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {t('Enter the 6-digit code from your authenticator app')}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={totp}
              onChange={(event) => setTotp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="h-12 rounded-md border border-border bg-background px-3 text-center text-xl tracking-[0.4em] text-foreground outline-none focus:border-foreground"
            />
            <span>{t('We ask for a code on every withdrawal, so nobody else can move your money.')}</span>
          </label>
        ) : (
          <p className="text-sm/relaxed text-muted-foreground">
            {t('Check the number. Money sent to the wrong number cannot be recalled.')}
          </p>
        )}
        <Button
          size="lg"
          className="h-13 w-full rounded-md text-base font-bold shadow-lg ring-1 shadow-primary/20 ring-primary/20"
          disabled={submitting || (quote.requiresTwoFactor && totp.length !== 6)}
          onClick={() => void handleConfirm()}
        >
          {submitting ? t('Sending…') : t('Confirm withdrawal')}
        </Button>
        <Button variant="ghost" className="self-center" onClick={() => setView('form')} disabled={submitting}>
          {t('Back')}
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
              {summary?.currency ? formatMoney(availableMinor, currency) : '—'}
            </strong>
          </span>
        </div>

        {frozen && (
          <p className="rounded-md bg-secondary px-3 py-2.5 text-[13px]">
            {t('Withdrawals are paused on your account. Please contact support.')}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <AmountInput
            value={amount}
            onChange={setAmount}
            currency={currency}
            inputRef={inputRef}
            label={t('Amount to withdraw')}
            attention={overBalance}
            message={
              overBalance
                ? t('That is more than your balance of {balance}.', { balance: formatMoney(availableMinor, currency) })
                : belowMinimum
                  ? t('The smallest withdrawal is {min}.', { min: formatMoney(minPayoutMinor, currency) })
                  : (quoteError ?? null)
            }
          />
          <AmountChips
            values={chips}
            selected={amountNumber > 0 && amountNumber !== allMajor ? amountNumber : null}
            onPick={(value) => {
              setAmount(String(value))
              inputRef.current?.focus()
            }}
            extra={
              allMajor > 0
                ? { label: t('All'), onPick: () => setAmount(String(allMajor)), selected: amountNumber === allMajor }
                : null
            }
          />
        </div>

        <div className="flex flex-col gap-2 rounded-xl bg-secondary p-3.5 text-sm tabular-nums">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{t('To')}</span>
            {editingPhone || !savedPhone ? (
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhoneInput(event.target.value)}
                placeholder="0712 345 678"
                className="h-10 w-44 rounded-md border border-border bg-background px-3 text-[15px] text-foreground tabular-nums outline-none focus:border-foreground"
              />
            ) : (
              <span className="flex items-center gap-2">
                <strong>{quote?.providerDisplayName ? `${quote.providerDisplayName} ${phone}` : phone}</strong>
                <button
                  type="button"
                  className="text-xs font-semibold underline underline-offset-[3px]"
                  onClick={() => setEditingPhone(true)}
                >
                  {t('Change')}
                </button>
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('Amount')}</span>
            <span>{formatMoney(amountMinor, currency)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('Withdrawal fee')}</span>
            <span>{formatMoney(displayFee, currency)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
            <span>{t('You receive')}</span>
            <span className={cn(quoting && 'opacity-60')}>{formatMoney(displayNet, currency)}</span>
          </div>
        </div>

        <Button
          size="lg"
          className="h-13 w-full rounded-md text-base font-bold shadow-lg ring-1 shadow-primary/20 ring-primary/20"
          disabled={!canContinue}
          onClick={() => setView('confirm')}
        >
          {t('Withdraw {amount}', { amount: formatMoney(amountMinor, currency) })}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t('Usually arrives within a minute. You confirm on the next screen.')}
        </p>
      </div>
    )
  }

  return (
    <CommunitySheet open={open} onOpenChange={onOpenChange} title={t('Withdraw to mobile money')}>
      <div className="flex flex-col gap-4 pt-2">
        {view !== 'done' && (
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-bold">
              {view === 'confirm' ? t('Confirm withdrawal') : t('Withdraw to mobile money')}
            </h2>
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
      </div>
    </CommunitySheet>
  )
}
