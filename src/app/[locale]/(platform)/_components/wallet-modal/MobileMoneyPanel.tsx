'use client'

import { CheckCircle2Icon, Loader2Icon, PhoneIcon, XCircleIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { MobileMoneyIntentView, MobileMoneySummary } from '@/app/[locale]/(platform)/_actions/mobile-money'

import {
  createMobileMoneyDepositAction,
  createMobileMoneyPayoutAction,
  getMobileMoneyIntentAction,
  getMobileMoneySummaryAction,
  previewMobileMoneyDepositAction,
  previewMobileMoneyPayoutAction,
} from '@/app/[locale]/(platform)/_actions/mobile-money'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * Mobile money (pawaPay) deposit / withdraw surface inside the wallet modal.
 * Users see only their local currency. Steps: phone → amount → confirm →
 * waiting (polls the intent) → result. Fork-only component; the only touch on
 * upstream files is the menu entry and the view case that render it.
 */

type Mode = 'deposit' | 'withdraw'
type Step = 'phone' | 'amount' | 'waiting' | 'done'

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 4 * 60_000

function formatMinor(value: string | bigint | null | undefined, currency: string | null) {
  if (value === null || value === undefined) {
    return '—'
  }
  const minor = typeof value === 'bigint' ? value : BigInt(value)
  const negative = minor < 0n
  const abs = negative ? -minor : minor
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = (abs % 100n).toString().padStart(2, '0')
  const body = frac === '00' ? whole : `${whole}.${frac}`
  return `${negative ? '-' : ''}${body}${currency ? ` ${currency}` : ''}`
}

function sanitizeAmount(raw: string, wholeOnly: boolean) {
  const cleaned = raw.replace(/[^\d.]/g, '')
  if (wholeOnly) {
    return cleaned.replace(/\..*$/, '')
  }
  const [whole, ...rest] = cleaned.split('.')
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole
}

function sanitizePhone(raw: string) {
  return raw.replace(/[^\d+ ]/g, '').slice(0, 20)
}

function MobileMoneyPanel({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('deposit')
  const [step, setStep] = useState<Step>('phone')
  const [summary, setSummary] = useState<MobileMoneySummary | null>(null)
  const [isLoadingSummary, setIsLoadingSummary] = useState(true)
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [providerName, setProviderName] = useState<string | null>(null)
  const [wholeUnitsOnly, setWholeUnitsOnly] = useState(false)
  const [payoutQuote, setPayoutQuote] = useState<{
    feeMinor: string
    netMinor: string
    confirmationToken: string
    requiresTwoFactor: boolean
    numberVerified: boolean
  } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [intent, setIntent] = useState<MobileMoneyIntentView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const pollStartedAt = useRef(0)

  const currency = summary?.currency ?? intent?.currency ?? null

  const loadSummary = useCallback(async () => {
    const result = await getMobileMoneySummaryAction()
    if (result.data) {
      setSummary(result.data)
      if (!phone && result.data.savedAccounts[0]) {
        setPhone(result.data.savedAccounts[0].msisdn)
      }
    }
    setIsLoadingSummary(false)
  }, [phone])

  useEffect(() => {
    void loadSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [])

  // Poll the intent while it is open.
  useEffect(() => {
    if (step !== 'waiting' || !intent) {
      return
    }
    const isOpen = intent.state === 'initiated' || intent.state === 'pending'
    if (!isOpen) {
      setStep('done')
      void loadSummary()
      return
    }
    if (Date.now() - pollStartedAt.current > POLL_TIMEOUT_MS) {
      return
    }
    const handle = window.setTimeout(async () => {
      const result = await getMobileMoneyIntentAction(intent.id)
      if (result.data) {
        setIntent(result.data)
      }
    }, POLL_INTERVAL_MS)
    return () => window.clearTimeout(handle)
  }, [step, intent, loadSummary])

  function reset(nextMode: Mode = mode) {
    setMode(nextMode)
    setStep('phone')
    setAmount('')
    setProviderName(null)
    setPayoutQuote(null)
    setTotpCode('')
    setIntent(null)
    setError(null)
  }

  async function handlePhoneContinue() {
    setError(null)
    setIsBusy(true)
    try {
      if (mode === 'deposit') {
        const result = await previewMobileMoneyDepositAction(phone)
        if (!result.data) {
          setError(result.error ?? 'Could not check that number.')
          return
        }
        setPhone(result.data.msisdn)
        setProviderName(result.data.providerDisplayName)
        setWholeUnitsOnly(result.data.wholeUnitsOnly)
      } else {
        // Provider lookup happens with the amount for withdrawals; just move on.
        setProviderName(null)
      }
      setStep('amount')
    } finally {
      setIsBusy(false)
    }
  }

  async function refreshPayoutQuote(nextAmount: string) {
    if (mode !== 'withdraw' || !nextAmount) {
      setPayoutQuote(null)
      return
    }
    const result = await previewMobileMoneyPayoutAction({ phoneInput: phone, amountInput: nextAmount })
    if (result.data) {
      setPayoutQuote({
        feeMinor: result.data.feeMinor,
        netMinor: result.data.netMinor,
        confirmationToken: result.data.confirmationToken,
        requiresTwoFactor: result.data.requiresTwoFactor,
        numberVerified: result.data.numberVerified,
      })
      setProviderName(result.data.providerDisplayName)
      setError(null)
    } else {
      setPayoutQuote(null)
      setError(result.error)
    }
  }

  async function handleSubmit() {
    setError(null)
    setIsBusy(true)
    try {
      const result =
        mode === 'deposit'
          ? await createMobileMoneyDepositAction({ phoneInput: phone, amountInput: amount, acceptTerms })
          : await createMobileMoneyPayoutAction({
              phoneInput: phone,
              amountInput: amount,
              confirmationToken: payoutQuote?.confirmationToken ?? '',
              totpCode: totpCode || undefined,
              acceptTerms,
            })
      if (!result.data) {
        setError(result.error ?? 'Something went wrong.')
        return
      }
      const created = result.data
      const view: MobileMoneyIntentView = {
        id: created.intentId,
        kind: mode === 'deposit' ? 'deposit' : 'payout',
        state: created.state,
        providerStatus: null,
        amountMinor: 'amountMinor' in created ? created.amountMinor : created.grossMinor,
        feeMinor: 'feeMinor' in created ? created.feeMinor : '0',
        netMinor: 'netMinor' in created ? created.netMinor : created.amountMinor,
        currency: created.currency,
        provider: created.provider,
        msisdn: created.msisdn,
        failureCode: created.failure?.code ?? null,
        failureMessage: created.failure?.message ?? null,
        createdAt: new Date().toISOString(),
        completedAt: null,
      }
      setIntent(view)
      pollStartedAt.current = Date.now()
      setStep(view.state === 'initiated' || view.state === 'pending' ? 'waiting' : 'done')
    } finally {
      setIsBusy(false)
    }
  }

  const available = summary?.availableMinor ?? '0'
  const depositsPaused = false
  const consentRequired = summary?.consentRequired ?? false
  const amountNumber = Number.parseFloat(amount || '0')
  const canSubmit =
    Number.isFinite(amountNumber) &&
    amountNumber > 0 &&
    !isBusy &&
    (!consentRequired || acceptTerms) &&
    (mode === 'deposit' || (Boolean(payoutQuote) && (!payoutQuote?.requiresTwoFactor || totpCode.length === 6)))

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">Your balance</p>
        {isLoadingSummary ? (
          <Skeleton className="mt-1 h-7 w-32 rounded-sm" />
        ) : (
          <p className="text-2xl font-semibold text-foreground">
            {formatMinor(summary?.balanceMinor ?? '0', currency)}
          </p>
        )}
        {summary && BigInt(summary.reservedMinor) > 0n && (
          <p className="text-xs text-muted-foreground">
            {formatMinor(summary.reservedMinor, currency)} held for open orders and withdrawals
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
        {(['deposit', 'withdraw'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={cn(
              'flex-1 rounded-full py-2 text-sm font-medium capitalize transition',
              mode === option
                ? 'bg-background text-foreground shadow-sm'
                : `text-muted-foreground hover:text-foreground`,
            )}
            onClick={() => reset(option)}
            disabled={isBusy || step === 'waiting'}
          >
            {option}
          </button>
        ))}
      </div>

      {step === 'phone' && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-foreground" htmlFor="mobile-money-phone">
            Mobile money number
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-border px-3">
            <PhoneIcon className="size-4 text-muted-foreground" />
            <input
              id="mobile-money-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(sanitizePhone(event.target.value))}
              placeholder="2547XXXXXXXX"
              className="h-12 w-full bg-transparent text-base text-foreground outline-none"
            />
          </div>
          {summary && summary.savedAccounts.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {summary.savedAccounts.map((account) => (
                <button
                  key={`${account.msisdn}-${account.provider}`}
                  type="button"
                  className={cn(
                    'rounded-full border border-border px-3 py-1 text-xs',
                    phone === account.msisdn
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setPhone(account.msisdn)}
                >
                  {account.msisdn}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {mode === 'deposit'
              ? 'Enter the number registered for mobile money, with the country code. You will approve the payment on your phone.'
              : 'Enter the mobile money number that should receive the money.'}
          </p>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button
            type="button"
            className="h-12 w-full"
            disabled={phone.replace(/\D/g, '').length < 9 || isBusy}
            onClick={() => void handlePhoneContinue()}
          >
            {isBusy ? <Loader2Icon className="size-4 animate-spin" /> : 'Continue'}
          </Button>
        </div>
      )}

      {step === 'amount' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{providerName ? `${providerName} · ${phone}` : phone}</span>
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setStep('phone')}>
              Change
            </button>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2 text-center">
            <input
              type="text"
              inputMode={wholeUnitsOnly && mode === 'deposit' ? 'numeric' : 'decimal'}
              value={amount}
              onChange={(event) => {
                const next = sanitizeAmount(event.target.value, wholeUnitsOnly && mode === 'deposit')
                setAmount(next)
                if (mode === 'withdraw') {
                  void refreshPayoutQuote(next)
                }
              }}
              placeholder="0"
              className="min-h-[1.2em] bg-transparent pb-1 text-center text-5xl/tight font-semibold text-foreground outline-none"
              style={{ width: `${Math.max(amount.length, 3)}ch`, maxWidth: '70vw' }}
            />
            <span className="pb-1 text-xl/tight font-semibold text-muted-foreground">{currency ?? ''}</span>
          </div>

          {mode === 'deposit' && summary?.limits && (
            <p className="text-center text-xs text-muted-foreground">
              Min {formatMinor(summary.limits.minDepositMinor, currency)} · Max{' '}
              {formatMinor(summary.limits.maxDepositMinor, currency)}
              {wholeUnitsOnly ? ' · whole amounts only' : ''}
            </p>
          )}

          {mode === 'withdraw' && (
            <div className="rounded-lg border border-border px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Available</span>
                <span className="font-semibold text-foreground">{formatMinor(available, currency)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">Fee</span>
                <span className="font-semibold text-foreground">
                  {payoutQuote
                    ? formatMinor(payoutQuote.feeMinor, currency)
                    : formatMinor(summary?.limits?.withdrawalFeeMinor ?? '0', currency)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">You receive</span>
                <span className="font-semibold text-foreground">
                  {payoutQuote ? formatMinor(payoutQuote.netMinor, currency) : '—'}
                </span>
              </div>
            </div>
          )}

          {mode === 'withdraw' && payoutQuote && !payoutQuote.numberVerified && (
            <p className="text-center text-xs text-muted-foreground">
              This number has not deposited before, so a lower limit applies until it does.
            </p>
          )}

          {mode === 'withdraw' && payoutQuote?.requiresTwoFactor && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-foreground" htmlFor="mobile-money-totp">
                Authenticator code
              </label>
              <input
                id="mobile-money-totp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="h-12 w-full rounded-lg border border-border bg-transparent px-3 text-base tracking-widest text-foreground outline-none"
              />
            </div>
          )}

          {consentRequired && (
            <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-3 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-primary"
                checked={acceptTerms}
                onChange={(event) => setAcceptTerms(event.target.checked)}
              />
              <span>
                I confirm that I am 18 or older and I accept the{' '}
                <Link className="underline" href="/tos" target="_blank">
                  Terms of Use
                </Link>
                .
              </span>
            </label>
          )}

          {error && <p className="text-center text-sm font-medium text-destructive">{error}</p>}

          <Button
            type="button"
            className="h-12 w-full"
            disabled={!canSubmit || depositsPaused}
            onClick={() => void handleSubmit()}
          >
            {isBusy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : mode === 'deposit' ? (
              `Deposit ${amount ? formatMinor(BigInt(Math.round(amountNumber * 100)), currency) : ''}`.trim()
            ) : (
              `Withdraw ${amount ? formatMinor(BigInt(Math.round(amountNumber * 100)), currency) : ''}`.trim()
            )}
          </Button>
        </div>
      )}

      {step === 'waiting' && intent && (
        <div className="space-y-4 pt-2 text-center">
          <Loader2Icon className="mx-auto size-10 animate-spin text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {intent.kind === 'deposit' ? 'Check your phone' : 'Sending your money'}
            </p>
            <p className="text-xs text-muted-foreground">
              {intent.kind === 'deposit'
                ? `Approve the ${formatMinor(intent.amountMinor, intent.currency)} payment prompt on ${intent.msisdn}. This usually takes under a minute.`
                : `${formatMinor(intent.netMinor, intent.currency)} is being sent to ${intent.msisdn}.`}
            </p>
          </div>
          <Button type="button" variant="outline" className="h-12 w-full" onClick={onDone}>
            I’ll check back later
          </Button>
        </div>
      )}

      {step === 'done' && intent && (
        <div className="space-y-4 pt-2 text-center">
          {intent.state === 'completed' ? (
            <CheckCircle2Icon className="mx-auto size-10 text-emerald-500" />
          ) : (
            <XCircleIcon className="mx-auto size-10 text-destructive" />
          )}
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {intent.state === 'completed'
                ? intent.kind === 'deposit'
                  ? 'Deposit received'
                  : 'Withdrawal sent'
                : intent.kind === 'deposit'
                  ? 'Deposit not completed'
                  : 'Withdrawal returned'}
            </p>
            <p className="text-xs text-muted-foreground">
              {intent.state === 'completed'
                ? intent.kind === 'deposit'
                  ? `${formatMinor(intent.amountMinor, intent.currency)} has been added to your balance.`
                  : `${formatMinor(intent.netMinor, intent.currency)} is on its way to ${intent.msisdn}.`
                : (intent.failureMessage ?? 'The payment could not be completed. Nothing was taken from your balance.')}
            </p>
          </div>
          <div className="grid gap-2">
            <Button type="button" className="h-12 w-full" onClick={onDone}>
              Done
            </Button>
            {intent.state !== 'completed' && (
              <Button type="button" variant="outline" className="h-12 w-full" onClick={() => reset()}>
                Try again
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default MobileMoneyPanel
