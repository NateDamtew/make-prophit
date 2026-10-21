'use client'

import { CheckIcon, ShareIcon, XIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useRef, useState } from 'react'

import type { PoolSummary } from '@/lib/pools/service'
import type { ShareCardPayload } from '@/lib/share-card'

import { stakeInPoolAction } from '@/app/[locale]/(platform)/_actions/pool-stake'
import { PositionShareDialog } from '@/app/[locale]/(platform)/_components/PositionShareDialog'
import { useTradingOnboarding } from '@/app/[locale]/(platform)/_providers/TradingOnboardingProvider'
import EventOrderPanelOutcomeButton from '@/app/[locale]/(platform)/event/[slug]/_components/EventOrderPanelOutcomeButton'
import EventOrderPanelResolvedMarketDisplay from '@/app/[locale]/(platform)/event/[slug]/_components/EventOrderPanelResolvedMarketDisplay'
import EventOrderPanelSubmitButton from '@/app/[locale]/(platform)/event/[slug]/_components/EventOrderPanelSubmitButton'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { useAppKit } from '@/hooks/useAppKit'
import { formatPoolMoney, majorInputToMinor, minorToMajorNumber } from '@/lib/pools/format'
import { estimatePayout } from '@/lib/pools/math'
import { cn } from '@/lib/utils'
import { usePortfolioValueVisibility } from '@/stores/usePortfolioValueVisibility'
import { useUser } from '@/stores/useUser'

import type { PoolCommunityRecord, PoolMarketRecord, PoolSide } from './pool-market-types'

import { PoolMarketIcon } from './PoolMarketHeader'
import PoolOrderPanelEarnings from './PoolOrderPanelEarnings'
import PoolOrderPanelInput from './PoolOrderPanelInput'
import { useInvalidatePool } from './usePoolMarketData'

/**
 * Order panel for pool markets. Mirrors `EventOrderPanelForm` (buy side):
 * outcome buttons, amount input with chips, "To win" and the submit button.
 * Stakes are placed against the user's local-currency ledger balance; there
 * is no sell side because a parimutuel stake is held until the pool settles.
 */

interface PoolOrderPanelProps {
  market: PoolMarketRecord
  community: PoolCommunityRecord
  summary: PoolSummary | null | undefined
  isSummaryLoading: boolean
  isMobile: boolean
  selectedOutcome: PoolSide
  onSelectOutcome: (outcome: PoolSide) => void
  outcomeLabels: { yes: string; no: string }
  className?: string
}

function BuyTab() {
  const t = useExtracted()
  return (
    <div className="-mx-4 mb-3 flex items-center border-b px-4">
      <span className="relative px-2 py-2.5 text-sm font-semibold text-primary">
        {t('Buy')}
        <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
      </span>
    </div>
  )
}

/**
 * Share-card payload for a pool stake, in the same shape the platform's
 * "Shill your bag" dialog and /api/og/position expect. Prices are shown as
 * percentages and money in the pool currency.
 */
function buildPoolSharePayload(params: {
  market: PoolMarketRecord
  community: PoolCommunityRecord
  outcome: PoolSide
  outcomeLabel: string
  stakeMinor: bigint
  payoutMinor: bigint
  totalYes: bigint
  totalNo: bigint
  currency: string
  userName?: string | null
  userImage?: string | null
}): ShareCardPayload {
  const total = params.totalYes + params.totalNo
  const yesChance = total > 0n ? Number((params.totalYes * 10_000n) / total) / 100 : 50
  const chance = params.outcome === 'yes' ? yesChance : 100 - yesChance
  const avgPricePct =
    params.payoutMinor > 0n
      ? Math.max(1, Math.min(99, Math.round((Number(params.stakeMinor) / Number(params.payoutMinor)) * 100)))
      : Math.round(chance)
  const imageUrl = params.market.image_url?.trim() || params.community.icon_url?.trim() || undefined
  return {
    title: params.market.title,
    outcome: params.outcomeLabel,
    avgPrice: `${avgPricePct}%`,
    odds: `${Math.round(chance)}%`,
    cost: formatPoolMoney(params.stakeMinor, params.currency),
    invested: formatPoolMoney(params.stakeMinor, params.currency),
    toWin: formatPoolMoney(params.payoutMinor, params.currency),
    imageUrl,
    userName: params.userName?.trim() || undefined,
    userImage: params.userImage?.trim() || undefined,
    variant: params.outcome,
    eventSlug: `community/${params.community.slug}/market/${params.market.id}`,
  }
}

/** Payout an existing position receives if its side wins, after rake. */
function existingPositionPayout(params: {
  myStake: bigint
  sideTotal: bigint
  total: bigint
  rakeBps: number
}): bigint {
  if (params.myStake <= 0n || params.sideTotal <= 0n) {
    return 0n
  }
  const distributable = params.total - (params.total * BigInt(params.rakeBps)) / 10_000n
  return (distributable * params.myStake) / params.sideTotal
}

function MobileMarketInfo({
  market,
  community,
  balanceText,
  isBalanceLoading,
}: {
  market: PoolMarketRecord
  community: PoolCommunityRecord
  balanceText: string | null
  isBalanceLoading: boolean
}) {
  const t = useExtracted()
  const areValuesHidden = usePortfolioValueVisibility((state) => state.isHidden)
  return (
    <div className="mb-4 flex items-center gap-3.5">
      <div className="size-9 shrink-0 overflow-hidden rounded-md">
        <PoolMarketIcon market={market} community={community} sizes="36px" className="rounded-md" />
      </div>
      <div className="flex-1">
        <div className="line-clamp-2 text-base/tight font-semibold">{market.title}</div>
        <div className="flex items-center justify-end text-xs text-muted-foreground">
          {balanceText !== null && (
            <span className="flex items-center gap-1">
              <span>{t('Bal.')}</span>
              {isBalanceLoading ? (
                <Skeleton className="inline-block h-3 w-10 align-middle" />
              ) : (
                <>{areValuesHidden ? '****' : balanceText}</>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function AwaitingJuryDisplay({ marketTitle }: { marketTitle: string }) {
  const t = useExtracted()
  return (
    <div className="flex flex-col items-center gap-4 px-2 py-6 text-center" role="status" aria-live="polite">
      <Spinner className="size-10 text-primary" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-foreground">{t('Hold on, waiting for the jury...')}</h2>
      <div className="text-base/relaxed text-muted-foreground">{marketTitle}</div>
      <p className="max-w-sm text-sm/relaxed text-muted-foreground">
        {t('This market has closed. Your stake settles automatically once the community jury reaches consensus.')}
      </p>
    </div>
  )
}

function CancelledDisplay() {
  const t = useExtracted()
  return (
    <div className="flex flex-col items-center gap-4 px-2 py-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-primary">
        <XIcon className="size-7 text-background" strokeWidth={3} />
      </div>
      <div className="text-lg font-semibold text-primary">{t('Market cancelled')}</div>
      <div className="text-base text-muted-foreground">{t('All stakes were refunded to your balance.')}</div>
    </div>
  )
}

function SettledEarnings({ summary }: { summary: PoolSummary }) {
  const t = useExtracted()
  const user = summary.user
  if (!user || user.stakes.length === 0) {
    return null
  }
  const staked = BigInt(user.totalYes) + BigInt(user.totalNo)
  const received = BigInt(user.totalPayout ?? '0')
  const won = received > staked
  return (
    <div className="mt-1.5 w-full space-y-2 px-2 pb-4 text-left">
      <div className="w-full border-t border-border" />
      <p className="text-center text-sm font-semibold text-foreground">{t('Your Earnings')}</p>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{t('Position')}</span>
          <span className="text-right font-medium text-foreground">
            {formatPoolMoney(staked, summary.pool.currency)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">{t('Total')}</span>
          <span className={cn('text-right font-medium', won ? 'text-yes' : 'text-foreground')}>
            {formatPoolMoney(received, summary.pool.currency)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function PoolOrderPanel({
  market,
  community,
  summary,
  isSummaryLoading,
  isMobile,
  selectedOutcome,
  onSelectOutcome,
  outcomeLabels,
  className,
}: PoolOrderPanelProps) {
  const t = useExtracted()
  const user = useUser()
  const { open: openAppKit } = useAppKit()
  const { startDepositFlow } = useTradingOnboarding()
  const invalidatePool = useInvalidatePool(market.id)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [amount, setAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [shouldShake, setShouldShake] = useState(false)
  const [justStaked, setJustStaked] = useState(false)
  const [sharePayload, setSharePayload] = useState<ShareCardPayload | null>(null)
  const [isShareOpen, setIsShareOpen] = useState(false)

  const wrapperClassName = cn(
    { 'rounded-xl border lg:w-85': !isMobile },
    'relative grid w-full grid-cols-[minmax(0,1fr)] overflow-hidden lg:shadow-xl/5',
    className,
  )

  if (!summary) {
    return (
      <div className={wrapperClassName}>
        <div className="p-4">
          {isSummaryLoading ? (
            <Skeleton className="h-72 w-full rounded-lg" />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('This market is not open for trading yet.')}
            </p>
          )}
        </div>
      </div>
    )
  }

  const { pool } = summary
  const currency = pool.currency
  const ledgerUser = summary.user
  const hasLedgerBalance = Boolean(ledgerUser?.currency)
  const balanceMinor = ledgerUser ? BigInt(ledgerUser.availableMinor) : null
  const minStakeMinor = BigInt(summary.minStakeMinor)
  const minStakeMajor = minorToMajorNumber(minStakeMinor)
  const chipValues = [1, 2, 10, 20].map((multiplier) => minStakeMajor * multiplier)
  const stepValue = Math.max(1, minStakeMajor / 5)
  const amountNumber = Number.parseFloat(amount.replace(/,/g, '')) || 0
  const amountMinor = majorInputToMinor(amount.replace(/,/g, '')) ?? 0n
  const yesPrice = pool.odds.yes
  const noPrice = pool.odds.no
  const totalYes = BigInt(pool.totalYes)
  const totalNo = BigInt(pool.totalNo)
  const estimatedPayout =
    amountMinor > 0n
      ? estimatePayout({ totalYes, totalNo, side: selectedOutcome, amount: amountMinor, rakeBps: pool.rakeBps })
      : 0n
  const isFinal = pool.state === 'settled' || pool.state === 'cancelled'
  const isCancelled = pool.state === 'cancelled' || pool.settledOutcome === 'cancelled'
  const isTradingDisabled = isFinal || !pool.acceptingStakes
  const insufficientBalance = hasLedgerBalance && balanceMinor !== null && amountMinor > balanceMinor
  const belowMinimum = amountMinor > 0n && amountMinor < minStakeMinor
  const selectedLabel = selectedOutcome === 'yes' ? outcomeLabels.yes : outcomeLabels.no
  const needsLogin = !user
  const needsDeposit = !needsLogin && (!hasLedgerBalance || insufficientBalance)
  const submitLabel = needsLogin
    ? t('Log In')
    : needsDeposit
      ? t('Deposit')
      : justStaked
        ? t('Stake placed')
        : t('Buy {outcome}', { outcome: selectedLabel })
  const isSubmitDisabled = !needsLogin && !needsDeposit && (amountMinor <= 0n || belowMinimum || isSubmitting)

  function shakeInput() {
    setShouldShake(true)
    window.setTimeout(() => setShouldShake(false), 400)
  }

  async function handleSubmit() {
    if (needsLogin) {
      void openAppKit()
      return
    }
    if (needsDeposit) {
      inputRef.current?.focus()
      startDepositFlow()
      return
    }
    if (amountMinor <= 0n || belowMinimum) {
      shakeInput()
      inputRef.current?.focus()
      return
    }
    setIsSubmitting(true)
    try {
      const result = await stakeInPoolAction({
        communityMarketId: market.id,
        outcome: selectedOutcome,
        amountInput: amount.replace(/,/g, ''),
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      setAmount('')
      setJustStaked(true)
      window.setTimeout(() => setJustStaked(false), 2_500)
      setSharePayload(
        buildPoolSharePayload({
          market,
          community,
          outcome: selectedOutcome,
          outcomeLabel: selectedLabel,
          stakeMinor: amountMinor,
          payoutMinor: estimatedPayout,
          totalYes: totalYes + (selectedOutcome === 'yes' ? amountMinor : 0n),
          totalNo: totalNo + (selectedOutcome === 'no' ? amountMinor : 0n),
          currency,
          userName: user?.username,
          userImage: user?.image,
        }),
      )
      setIsShareOpen(true)
      await invalidatePool()
    } finally {
      setIsSubmitting(false)
    }
  }

  const balanceText = balanceMinor === null ? null : formatPoolMoney(balanceMinor, currency)

  return (
    <form
      className={wrapperClassName}
      onSubmit={(event) => {
        event.preventDefault()
        void handleSubmit()
      }}
    >
      <div className={cn('col-start-1 row-start-1 min-w-0', isTradingDisabled ? 'p-3' : 'p-4')}>
        {!isTradingDisabled && isMobile && (
          <MobileMarketInfo
            market={market}
            community={community}
            balanceText={balanceText}
            isBalanceLoading={isSummaryLoading}
          />
        )}
        {isTradingDisabled ? (
          isCancelled ? (
            <CancelledDisplay />
          ) : pool.state === 'settled' ? (
            <>
              <EventOrderPanelResolvedMarketDisplay
                resolvedOutcomeLabel={pool.settledOutcome === 'yes' ? outcomeLabels.yes : outcomeLabels.no}
                isSingleMarket
                shouldShowResolvedSportsSubtitle={false}
                resolvedMarketTitle={null}
                hasClaimableWinnings={false}
                claimPositionLabel=""
                claimValuePerShareLabel=""
                claimTotalLabel=""
                isClaimSubmitting={false}
                isPositionsLoading={false}
                onClaimWinnings={() => {}}
              />
              <SettledEarnings summary={summary} />
            </>
          ) : (
            <AwaitingJuryDisplay marketTitle={market.title} />
          )
        ) : (
          <>
            {!isMobile && <BuyTab />}
            <div className="mb-4 flex gap-2">
              <EventOrderPanelOutcomeButton
                variant="yes"
                price={yesPrice}
                label={outcomeLabels.yes}
                isSelected={selectedOutcome === 'yes'}
                oddsFormat="percentage"
                onSelect={() => onSelectOutcome('yes')}
              />
              <EventOrderPanelOutcomeButton
                variant="no"
                price={noPrice}
                label={outcomeLabels.no}
                isSelected={selectedOutcome === 'no'}
                oddsFormat="percentage"
                onSelect={() => onSelectOutcome('no')}
              />
            </div>

            <PoolOrderPanelInput
              isMobile={isMobile}
              amount={amount}
              amountNumber={amountNumber}
              currency={currency}
              balanceMinor={balanceMinor}
              isBalanceLoading={isSummaryLoading}
              chipValues={chipValues}
              stepValue={stepValue}
              maxAmount={balanceMinor === null ? 0 : minorToMajorNumber(balanceMinor)}
              inputRef={inputRef}
              onAmountChange={setAmount}
              shouldShake={shouldShake}
            />

            {belowMinimum && (
              <p className="mb-3 text-xs font-medium text-destructive">
                {t('Minimum stake is {min}', { min: formatPoolMoney(minStakeMinor, currency) })}
              </p>
            )}
            {!needsLogin && !hasLedgerBalance && (
              <p className="mb-3 text-xs text-muted-foreground">
                {t('Deposit with mobile money to start trading in {currency}.', { currency })}
              </p>
            )}

            {amountMinor > 0n && !belowMinimum && (
              <PoolOrderPanelEarnings
                isMobile={isMobile}
                stakeMinor={amountMinor}
                payoutMinor={estimatedPayout}
                currency={currency}
                rakeBps={pool.rakeBps}
              />
            )}

            <EventOrderPanelSubmitButton
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitDisabled}
              onClick={() => {}}
              label={
                justStaked ? (
                  <span className="inline-flex items-center gap-2">
                    <CheckIcon className="size-4" /> {submitLabel}
                  </span>
                ) : (
                  submitLabel
                )
              }
              loadingLabel={t('Placing stake...')}
            />

            {ledgerUser && ledgerUser.stakes.length > 0 && (
              <div className="mt-3 grid gap-1 border-t pt-3 text-xs text-muted-foreground">
                <div className="flex items-center justify-between font-semibold text-foreground">
                  <span className="inline-flex items-center gap-1">
                    {t('Your position')}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-foreground"
                      aria-label={t('Share')}
                      onClick={() => {
                        const myYes = BigInt(ledgerUser.totalYes)
                        const myNo = BigInt(ledgerUser.totalNo)
                        const side: PoolSide = myYes >= myNo ? 'yes' : 'no'
                        const myStake = side === 'yes' ? myYes : myNo
                        setSharePayload(
                          buildPoolSharePayload({
                            market,
                            community,
                            outcome: side,
                            outcomeLabel: side === 'yes' ? outcomeLabels.yes : outcomeLabels.no,
                            stakeMinor: myStake,
                            payoutMinor: existingPositionPayout({
                              myStake,
                              sideTotal: side === 'yes' ? totalYes : totalNo,
                              total: totalYes + totalNo,
                              rakeBps: pool.rakeBps,
                            }),
                            totalYes,
                            totalNo,
                            currency,
                            userName: user?.username,
                            userImage: user?.image,
                          }),
                        )
                        setIsShareOpen(true)
                      }}
                    >
                      <ShareIcon className="size-3.5" />
                    </Button>
                  </span>
                  <span>{formatPoolMoney(BigInt(ledgerUser.totalYes) + BigInt(ledgerUser.totalNo), currency)}</span>
                </div>
                {BigInt(ledgerUser.totalYes) > 0n && (
                  <div className="flex items-center justify-between">
                    <span className="text-yes">{outcomeLabels.yes}</span>
                    <span>{formatPoolMoney(ledgerUser.totalYes, currency)}</span>
                  </div>
                )}
                {BigInt(ledgerUser.totalNo) > 0n && (
                  <div className="flex items-center justify-between">
                    <span className="text-no">{outcomeLabels.no}</span>
                    <span>{formatPoolMoney(ledgerUser.totalNo, currency)}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <PositionShareDialog open={isShareOpen} onOpenChange={setIsShareOpen} payload={sharePayload} />
    </form>
  )
}
