'use client'

import { CheckIcon, Share2Icon, SmartphoneIcon, XIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { PoolSummary } from '@/lib/pools/service'
import type { ShareCardPayload } from '@/lib/share-card'

import { createMobileMoneyDepositAction } from '@/app/[locale]/(platform)/_actions/mobile-money'
import { stakeInPoolAction } from '@/app/[locale]/(platform)/_actions/pool-stake'
import { formatBps, formatCloseLabel, formatMoney } from '@/components/communities/format'
import { DepositFailed, DepositWaiting } from '@/components/communities/money/DepositStates'
import {
  useInvalidateMobileMoney,
  useMobileMoneyIntent,
  useMobileMoneySummary,
} from '@/components/communities/money/useMobileMoney'
import { PayoutLine } from '@/components/communities/odds/PayoutLine'
import { buildPoolSharePayload } from '@/components/communities/share/payload'
import { ShareSheet } from '@/components/communities/share/ShareSheet'
import { CommunitySheet } from '@/components/communities/sheet/CommunitySheet'
import { AmountChips, defaultChipValues } from '@/components/communities/stake/AmountChips'
import { AmountInput } from '@/components/communities/stake/AmountInput'
import { clearStakeIntent, readStakeIntent, saveStakeIntent } from '@/components/communities/stake/stake-intent'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useAppKit } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { Link } from '@/i18n/navigation'
import { estimatePayout } from '@/lib/pools/math'
import { cn } from '@/lib/utils'
import { useUser } from '@/stores/useUser'

/**
 * The stake form, rendered inline in the desktop sidebar or inside a sheet
 * on phones. One yellow button at a time: Stake when the balance covers it,
 * Deposit with mobile money when it is short. Nobody hits a dead end.
 *
 * Views: form → (deposit waiting → deposit failed) → form → success.
 */

export interface StakeSheetMarket {
  id: string
  title: string
  imageUrl?: string | null
  closesAt: number | null
  juryDueAt: number | null
}

export interface StakeSheetCommunity {
  id: string
  slug: string
  name: string
  iconUrl?: string | null
  jurySize: number
  juryRequired: number
}

interface StakeSheetProps {
  market: StakeSheetMarket
  community: StakeSheetCommunity
  summary: PoolSummary | null
  side: 'yes' | 'no'
  onSideChange: (side: 'yes' | 'no') => void
  outcomeLabels: { yes: string; no: string }
  /** Render the form in place (desktop sidebar) instead of inside a sheet. */
  inline?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Called after a stake or a completed deposit so the page refetches. */
  onMoneyMoved?: () => void
}

type View = 'form' | 'depositWaiting' | 'depositFailed' | 'success'

function majorToMinor(amount: string): bigint {
  const whole = Number.parseInt(amount, 10)
  return Number.isFinite(whole) && whole > 0 ? BigInt(whole) * 100n : 0n
}

export function StakeSheet(props: StakeSheetProps) {
  const { market, community, summary, side, onSideChange, outcomeLabels, inline = false } = props
  const t = useExtracted()
  const locale = useLocale()
  const now = useNowTimestamp()
  const user = useUser()
  const { open: openAppKit } = useAppKit()
  const moneyQuery = useMobileMoneySummary()
  const invalidateMoney = useInvalidateMobileMoney()
  const inputRef = useRef<HTMLInputElement | null>(null)

  const hydrated = useHasHydrated()
  // The pick saved before sign-up / deposit, read once the client is up.
  const savedIntent = useMemo(() => (hydrated ? readStakeIntent(market.id) : null), [hydrated, market.id])
  const [amountInput, setAmountInput] = useState<string | null>(null)
  const amount = amountInput ?? savedIntent?.amount ?? ''
  const setAmount = setAmountInput
  const [view, setView] = useState<View>('form')
  const [phoneInput, setPhoneInput] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [intentId, setIntentId] = useState<string | null>(null)
  const [lastStake, setLastStake] = useState<{ amountMinor: bigint; payoutMinor: bigint; side: 'yes' | 'no' } | null>(
    null,
  )
  const [sharePayload, setSharePayload] = useState<ShareCardPayload | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  const intentQuery = useMobileMoneyIntent(view === 'depositWaiting' ? intentId : null)
  const phone = phoneInput ?? moneyQuery.data?.savedAccounts?.[0]?.msisdn ?? ''

  // While a deposit is waiting, the view follows the intent: completed brings
  // the form back with the money ready, a failure shows the retry screen.
  const intent = view === 'depositWaiting' ? (intentQuery.data ?? null) : null
  const intentFailed = intent?.state === 'failed' || intent?.state === 'rejected' || intent?.state === 'cancelled'
  const effectiveView: View = intent?.state === 'completed' ? 'form' : intentFailed ? 'depositFailed' : view
  const depositedMinor = intent?.state === 'completed' ? BigInt(intent.netMinor) : null

  const onMoneyMoved = props.onMoneyMoved
  const completedIntentId = intent?.state === 'completed' ? intent.id : null
  useEffect(() => {
    if (!completedIntentId) {
      return
    }
    void invalidateMoney()
    onMoneyMoved?.()
  }, [completedIntentId, invalidateMoney, onMoneyMoved])

  const pool = summary?.pool ?? null
  const currency = pool?.currency ?? summary?.user?.currency ?? moneyQuery.data?.currency ?? null
  const ledgerUser = summary?.user ?? null
  const balanceMinor = ledgerUser ? BigInt(ledgerUser.availableMinor) : null
  const minStakeMinor = summary ? BigInt(summary.minStakeMinor) : 2_000n
  const minStakeMajor = Number(minStakeMinor / 100n)
  const minDepositMinor = moneyQuery.data?.limits ? BigInt(moneyQuery.data.limits.minDepositMinor) : 5_000n
  const capRemainingMinor = ledgerUser ? BigInt(ledgerUser.stakeCapRemainingMinor) : null
  const capMinor = summary ? BigInt(summary.caps.maxPerPersonMinor) : null
  const amountMinor = majorToMinor(amount)
  const amountNumber = Number.parseInt(amount, 10) || 0
  const chips = useMemo(() => defaultChipValues(minStakeMajor), [minStakeMajor])

  const totalYes = pool ? BigInt(pool.totalYes) : 0n
  const totalNo = pool ? BigInt(pool.totalNo) : 0n
  const payoutMinor =
    pool && amountMinor > 0n
      ? estimatePayout({ totalYes, totalNo, side, amount: amountMinor, rakeBps: pool.rakeBps })
      : 0n
  const sideLabel = side === 'yes' ? outcomeLabels.yes : outcomeLabels.no
  const yesChance = pool ? Math.round(pool.odds.yes * 100) : null
  const closed = pool ? !pool.acceptingStakes : false
  const closingSoon =
    market.closesAt !== null && now !== null && market.closesAt - now < 60_000 && market.closesAt > now

  const needsLogin = !user
  const belowMinimum = amountMinor > 0n && amountMinor < minStakeMinor
  const overCap = capRemainingMinor !== null && amountMinor > capRemainingMinor
  const short = !needsLogin && balanceMinor !== null && amountMinor > balanceMinor
  const noBalanceYet = !needsLogin && ledgerUser !== null && ledgerUser.currency === null
  const needMinor =
    short || noBalanceYet
      ? amountMinor > (balanceMinor ?? 0n)
        ? amountMinor - (balanceMinor ?? 0n)
        : minDepositMinor
      : 0n
  const depositMinor = needMinor < minDepositMinor ? minDepositMinor : needMinor
  const canSubmit = amountMinor > 0n && !belowMinimum && !overCap && !submitting

  function persistIntent() {
    saveStakeIntent(market.id, { side, amount })
  }

  async function handleDeposit() {
    if (!phone.trim()) {
      toast.error(t('Enter the mobile money number to pay from.'))
      return
    }
    persistIntent()
    setSubmitting(true)
    try {
      const result = await createMobileMoneyDepositAction({
        phoneInput: phone,
        amountInput: String(Number(depositMinor / 100n)),
      })
      if (result.error || !result.data) {
        toast.error(result.error ?? t('Could not start the deposit.'))
        return
      }
      if (result.data.failure) {
        toast.error(result.data.failure.message)
        return
      }
      setIntentId(result.data.intentId)
      setView('depositWaiting')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStake() {
    if (needsLogin) {
      persistIntent()
      void openAppKit()
      return
    }
    if (short || noBalanceYet) {
      await handleDeposit()
      return
    }
    if (!canSubmit) {
      inputRef.current?.focus()
      return
    }
    setSubmitting(true)
    try {
      const result = await stakeInPoolAction({
        communityMarketId: market.id,
        outcome: side,
        amountInput: String(amountNumber),
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      clearStakeIntent(market.id)
      setLastStake({ amountMinor, payoutMinor, side })
      setSharePayload(
        buildPoolSharePayload({
          market: { id: market.id, title: market.title, imageUrl: market.imageUrl },
          community: { slug: community.slug, name: community.name, iconUrl: community.iconUrl },
          outcome: side,
          outcomeLabel: sideLabel,
          stakeMinor: amountMinor,
          payoutMinor,
          totalYes: totalYes + (side === 'yes' ? amountMinor : 0n),
          totalNo: totalNo + (side === 'no' ? amountMinor : 0n),
          currency: currency ?? 'KES',
          userName: user?.username,
          userImage: user?.image,
        }),
      )
      setAmount('')
      setIntentId(null)
      setView('success')
      props.onMoneyMoved?.()
    } finally {
      setSubmitting(false)
    }
  }

  const ctaLabel = needsLogin
    ? t('Sign up to stake')
    : short || noBalanceYet
      ? t('Deposit {amount} with mobile money', { amount: formatMoney(depositMinor, currency) })
      : t('Stake {amount} on {side}', { amount: formatMoney(amountMinor, currency), side: sideLabel })

  let body: React.ReactNode
  if (effectiveView === 'depositWaiting') {
    body = (
      <DepositWaiting
        amountMinor={depositMinor}
        currency={currency}
        phone={phone}
        onCancel={() => {
          setIntentId(null)
          setView('form')
        }}
        onNotReceived={() => setView('depositFailed')}
      />
    )
  } else if (effectiveView === 'depositFailed') {
    body = (
      <DepositFailed
        amountMinor={depositMinor}
        currency={currency}
        phone={phone}
        reason={intentQuery.data?.failureMessage ?? null}
        stakeLine={t('Your {side} stake of {amount} is still saved.', {
          side: sideLabel,
          amount: formatMoney(amountMinor, currency),
        })}
        onRetry={() => void handleDeposit()}
        onChangeNumber={() => {
          setIntentId(null)
          setView('form')
        }}
      />
    )
  } else if (effectiveView === 'success' && lastStake) {
    body = (
      <StakeSuccess
        amountMinor={lastStake.amountMinor}
        payoutMinor={lastStake.payoutMinor}
        sideLabel={lastStake.side === 'yes' ? outcomeLabels.yes : outcomeLabels.no}
        currency={currency}
        juryDueAt={market.juryDueAt}
        jurySize={community.jurySize}
        juryRequired={community.juryRequired}
        onShare={() => setShareOpen(true)}
        onDone={() => {
          setView('form')
          props.onOpenChange?.(false)
        }}
      />
    )
  } else if (closed) {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-[15px] font-semibold">{t('This market just closed')}</p>
        <p className="text-[13px]/relaxed text-muted-foreground">{t('Nothing was taken from your balance.')}</p>
        <Button variant="secondary" nativeButton={false} render={<Link href={`/community/${community.slug}`} />}>
          {t('See open markets')}
        </Button>
      </div>
    )
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {depositedMinor !== null && (
          <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-[13px] tabular-nums">
            <CheckIcon className="size-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>{t('{amount} added', { amount: formatMoney(depositedMinor, currency) })}</strong>{' '}
              {t('from mobile money.')}
            </span>
          </div>
        )}

        <div role="radiogroup" aria-label={t('Your call')} className="grid grid-cols-2 gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={side === 'yes'}
            onClick={() => onSideChange('yes')}
            className={cn(
              'h-12 rounded-md text-base font-bold tabular-nums transition-colors',
              side === 'yes' ? 'bg-yes text-background' : 'bg-yes/15 text-yes',
            )}
          >
            {outcomeLabels.yes}
            {yesChance !== null ? ` ${yesChance}%` : ''}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={side === 'no'}
            onClick={() => onSideChange('no')}
            className={cn(
              'h-12 rounded-md text-base font-bold tabular-nums transition-colors',
              side === 'no' ? 'bg-no text-background' : 'bg-no/15 text-no-text',
            )}
          >
            {outcomeLabels.no}
            {yesChance !== null ? ` ${100 - yesChance}%` : ''}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <AmountInput
            value={amount}
            onChange={setAmount}
            currency={currency}
            inputRef={inputRef}
            attention={short}
            message={
              belowMinimum ? (
                t('The smallest stake is {min}.', { min: formatMoney(minStakeMinor, currency) })
              ) : overCap && capMinor !== null && capRemainingMinor !== null ? (
                <span>
                  {t('You already have {staked} on this market. The cap is {cap} per person, so you can add up to', {
                    staked: formatMoney(capMinor - capRemainingMinor, currency),
                    cap: formatMoney(capMinor, currency),
                  })}{' '}
                  <strong>{formatMoney(capRemainingMinor, currency)}</strong>.{' '}
                  <button
                    type="button"
                    className="font-bold underline underline-offset-[3px]"
                    onClick={() => setAmount(String(Number(capRemainingMinor / 100n)))}
                  >
                    {t('Use {amount}', { amount: Number(capRemainingMinor / 100n).toLocaleString('en-US') })}
                  </button>
                </span>
              ) : null
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

        {!needsLogin && (
          <div className="flex items-center justify-between text-[13px] tabular-nums">
            <span className="text-muted-foreground">
              {t('Balance')}{' '}
              <strong className="font-semibold text-foreground">
                {balanceMinor === null ? '—' : formatMoney(balanceMinor, currency)}
              </strong>
            </span>
            {!short && !noBalanceYet && (
              <button
                type="button"
                className="inline-flex min-h-8 items-center gap-1.5 font-semibold"
                onClick={() => {
                  setAmount(
                    String(
                      Math.max(amountNumber, Number(minDepositMinor / 100n)) + Number((balanceMinor ?? 0n) / 100n),
                    ),
                  )
                }}
              >
                <SmartphoneIcon className="size-4" aria-hidden="true" />
                {t('Deposit')}
              </button>
            )}
          </div>
        )}

        {(short || noBalanceYet) && !needsLogin && (
          <div className="flex flex-col gap-3 rounded-xl bg-secondary p-3.5">
            <p className="text-sm/snug tabular-nums">
              <strong>
                {balanceMinor !== null && balanceMinor > 0n
                  ? t('Your balance is {balance}. You need {need} more.', {
                      balance: formatMoney(balanceMinor, currency),
                      need: formatMoney(amountMinor - balanceMinor, currency),
                    })
                  : t('You need {need} to place this stake.', { need: formatMoney(depositMinor, currency) })}
              </strong>{' '}
              {t('Add it with mobile money and we bring you straight back here with your stake ready.')}
            </p>
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
          </div>
        )}

        {!short && !noBalanceYet && amountMinor > 0n && !belowMinimum && (
          <PayoutLine payoutMinor={payoutMinor} currency={currency} outcomeLabel={sideLabel} />
        )}

        {closingSoon && market.closesAt !== null && now !== null && (
          <div className="rounded-md bg-secondary px-3 py-2.5 text-[13px] tabular-nums">
            <strong>
              {t('Closes in {seconds}.', {
                seconds: `0:${String(Math.max(0, Math.floor((market.closesAt - now) / 1000))).padStart(2, '0')}`,
              })}
            </strong>{' '}
            {t('A stake that arrives after close is returned.')}
          </div>
        )}

        <Button
          type="button"
          size="lg"
          className="h-13 w-full rounded-md text-base font-bold shadow-lg ring-1 shadow-primary/20 ring-primary/20"
          disabled={!needsLogin && !short && !noBalanceYet && !canSubmit}
          onClick={() => void handleStake()}
        >
          {submitting ? t('One moment…') : ctaLabel}
        </Button>
        {needsLogin && (
          <p className="text-center text-xs/relaxed text-muted-foreground">
            {t('One account for every community. By signing up you agree to the')}{' '}
            <Link href="/tos" target="_blank" className="underline underline-offset-[3px]">
              {t('Terms and Conditions')}
            </Link>
            .
          </p>
        )}
        {(short || noBalanceYet) && !needsLogin && (
          <p className="text-center text-xs text-muted-foreground tabular-nums">
            {t('Deposits are free. Minimum {min}.', { min: formatMoney(minDepositMinor, currency) })}
          </p>
        )}

        <p className="border-t border-border pt-3 text-xs/relaxed text-muted-foreground tabular-nums">
          {market.closesAt !== null ? `${t('Closes')} ${formatCloseLabel(market.closesAt, locale, now)} · ` : ''}
          {t('Min {min}, max {max} per person', {
            min: formatMoney(minStakeMinor, currency),
            max: capMinor !== null ? formatMoney(capMinor, currency) : '—',
          })}
          {pool
            ? ` · ${t('{rake} of the pool goes to the community and jury.', { rake: formatBps(pool.rakeBps) })}`
            : ''}
        </p>
      </div>
    )
  }

  const content = (
    <div className="flex flex-col gap-4">
      {!inline && effectiveView === 'form' && (
        <div className="flex items-start gap-3">
          <p className="flex-1 text-[15px]/snug font-semibold">{market.title}</p>
          <button
            type="button"
            aria-label={t('Close')}
            onClick={() => props.onOpenChange?.(false)}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary"
          >
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {body}
      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        payload={sharePayload}
        kind="call"
        marketPath={`/community/${community.slug}/market/${market.id}`}
        communityName={community.name}
      />
    </div>
  )

  if (inline) {
    return <div className="rounded-xl border border-border bg-card p-5">{content}</div>
  }
  return (
    <CommunitySheet open={Boolean(props.open)} onOpenChange={(next) => props.onOpenChange?.(next)} title={market.title}>
      <div className="pt-2">{content}</div>
    </CommunitySheet>
  )
}

function StakeSuccess({
  amountMinor,
  payoutMinor,
  sideLabel,
  currency,
  juryDueAt,
  jurySize,
  juryRequired,
  onShare,
  onDone,
}: {
  amountMinor: bigint
  payoutMinor: bigint
  sideLabel: string
  currency: string | null
  juryDueAt: number | null
  jurySize: number
  juryRequired: number
  onShare: () => void
  onDone: () => void
}) {
  const t = useExtracted()
  const locale = useLocale()
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex size-11 items-center justify-center rounded-full bg-secondary">
        <CheckIcon className="size-6" strokeWidth={2.5} aria-hidden="true" />
      </div>
      <h2 className="text-xl font-bold tabular-nums">
        {t('You’re in: {amount} on {side}', { amount: formatMoney(amountMinor, currency), side: sideLabel })}
      </h2>
      <p className="text-sm/relaxed text-muted-foreground tabular-nums">
        {t('Pays about {payout} if {side} wins.', { payout: formatMoney(payoutMinor, currency), side: sideLabel })}{' '}
        {juryDueAt !== null
          ? t('Jury decides by {time}: {size} jurors, {required} must agree.', {
              time: formatCloseLabel(juryDueAt, locale),
              size: String(jurySize),
              required: String(juryRequired),
            })
          : t('{size} jurors decide, {required} must agree.', {
              size: String(jurySize),
              required: String(juryRequired),
            })}
      </p>
      <Button
        size="lg"
        className="h-13 w-full rounded-md text-base font-bold shadow-lg shadow-primary/20"
        onClick={onShare}
      >
        <Share2Icon className="size-4" aria-hidden="true" />
        {t('Share your call')}
      </Button>
      <Button variant="ghost" className="self-center" onClick={onDone}>
        {t('Done')}
      </Button>
    </div>
  )
}
