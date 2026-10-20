'use client'

import { CheckCircle2Icon, Loader2Icon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { PoolSummary } from '@/lib/pools/service'

import {
  estimatePoolPayoutAction,
  getPoolSummaryAction,
  stakeInPoolAction,
} from '@/app/[locale]/(platform)/_actions/pool-stake'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Stake panel for pool-engine community markets. Users see percentages for
 * the odds and their own currency for stakes and payouts; the payout is
 * labelled "estimated" because a parimutuel pool only fixes it at close.
 */

function money(minor: string | bigint | null | undefined, currency: string | null | undefined) {
  if (minor === null || minor === undefined) {
    return '—'
  }
  const value = typeof minor === 'bigint' ? minor : BigInt(minor)
  const whole = (value / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = (value % 100n).toString().padStart(2, '0')
  return `${frac === '00' ? whole : `${whole}.${frac}`}${currency ? ` ${currency}` : ''}`
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

export default function PoolStakePanel({
  marketId,
  marketStatus,
  resolvedOutcome,
}: {
  marketId: string
  marketStatus: string
  resolvedOutcome: string | null
}) {
  const [summary, setSummary] = useState<PoolSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [side, setSide] = useState<'yes' | 'no'>('yes')
  const [amount, setAmount] = useState('')
  const [estimate, setEstimate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [justStaked, setJustStaked] = useState(false)

  const load = useCallback(async () => {
    const result = await getPoolSummaryAction(marketId)
    setSummary(result.data)
    if (result.error) {
      setError(result.error)
    }
    setLoading(false)
  }, [marketId])

  // Initial load: state is set from the promise callback (asynchronously), with
  // an `active` guard so an unmounted panel never updates.
  useEffect(() => {
    let active = true
    void getPoolSummaryAction(marketId).then((result) => {
      if (!active) {
        return
      }
      setSummary(result.data)
      if (result.error) {
        setError(result.error)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [marketId])

  // Re-quote the estimated payout as the user types (debounced). Clearing is
  // derived during render (`shownEstimate`) so the effect never sets state
  // synchronously.
  useEffect(() => {
    if (!amount || !summary) {
      return
    }
    const handle = window.setTimeout(async () => {
      const result = await estimatePoolPayoutAction(marketId, side, amount)
      setEstimate(result.data?.payoutMinor ?? null)
    }, 300)
    return () => window.clearTimeout(handle)
  }, [amount, side, summary, marketId])
  const shownEstimate = amount ? estimate : null

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      const result = await stakeInPoolAction({ communityMarketId: marketId, outcome: side, amountInput: amount })
      if (result.error) {
        setError(result.error)
        return
      }
      setAmount('')
      setJustStaked(true)
      await load()
      window.setTimeout(() => setJustStaked(false), 3_000)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-24 w-full rounded-sm" />
        </CardContent>
      </Card>
    )
  }
  if (!summary) {
    return null
  }

  const { pool, user } = summary
  const currency = pool.currency
  const isFinal = pool.state === 'settled' || pool.state === 'cancelled'
  const amountNumber = Number.parseFloat(amount || '0')
  const canStake =
    pool.acceptingStakes && Boolean(user?.currency) && Number.isFinite(amountNumber) && amountNumber > 0 && !busy

  return (
    <Card>
      <CardContent className="grid gap-4 p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Community pool</p>
            <p className="text-sm text-muted-foreground">
              {money(BigInt(pool.totalYes) + BigInt(pool.totalNo), currency)} staked by {pool.stakeCount}{' '}
              {pool.stakeCount === 1 ? 'stake' : 'stakes'}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">{pool.rakeBps / 100}% goes to the community</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!pool.acceptingStakes}
            onClick={() => setSide('yes')}
            className={cn(
              'rounded-xl border px-4 py-3 text-left transition',
              side === 'yes' ? 'border-(--yes) bg-(--yes)/10' : 'border-border hover:bg-muted/40',
              !pool.acceptingStakes && 'cursor-default opacity-80',
            )}
          >
            <div className="text-xs text-muted-foreground">Yes</div>
            <div className="text-2xl font-semibold text-(--yes)">{percent(pool.odds.yes)}</div>
            <div className="text-xs text-muted-foreground">{money(pool.totalYes, currency)}</div>
          </button>
          <button
            type="button"
            disabled={!pool.acceptingStakes}
            onClick={() => setSide('no')}
            className={cn(
              'rounded-xl border px-4 py-3 text-left transition',
              side === 'no' ? 'border-(--no) bg-(--no)/10' : 'border-border hover:bg-muted/40',
              !pool.acceptingStakes && 'cursor-default opacity-80',
            )}
          >
            <div className="text-xs text-muted-foreground">No</div>
            <div className="text-2xl font-semibold text-(--no)">{percent(pool.odds.no)}</div>
            <div className="text-xs text-muted-foreground">{money(pool.totalNo, currency)}</div>
          </button>
        </div>

        {isFinal ? (
          <div className="rounded-lg border border-border px-4 py-3 text-sm">
            <p className="font-medium">
              {pool.state === 'cancelled' || pool.settledOutcome === 'cancelled'
                ? 'Market cancelled — all stakes refunded'
                : `Settled: ${pool.settledOutcome?.toUpperCase()} won`}
            </p>
            {user && user.stakes.length > 0 && (
              <p className="text-xs text-muted-foreground">
                You staked {money(BigInt(user.totalYes) + BigInt(user.totalNo), currency)} and received{' '}
                {money(user.totalPayout ?? '0', currency)}.
              </p>
            )}
          </div>
        ) : !pool.acceptingStakes ? (
          <p className="text-sm text-muted-foreground">
            {marketStatus === 'resolved' || marketStatus === 'disputed'
              ? `Resolved ${resolvedOutcome ?? ''}. Settlement is being processed.`
              : 'This market is closed for new stakes and is waiting for the jury.'}
          </p>
        ) : !user?.currency ? (
          <p className="text-sm text-muted-foreground">Deposit via mobile money to start staking in this community.</p>
        ) : (
          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))}
                placeholder={`Amount in ${currency}`}
                className="h-12 flex-1 rounded-lg border border-border bg-transparent px-3 text-base text-foreground outline-none"
              />
              <Button type="button" className="h-12" disabled={!canStake} onClick={() => void submit()}>
                {busy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : justStaked ? (
                  <CheckCircle2Icon className="size-4" />
                ) : (
                  `Stake ${side.toUpperCase()}`
                )}
              </Button>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Available {money(user.availableMinor, currency)} · min {money(summary.minStakeMinor, currency)}
              </span>
              <span>
                {shownEstimate
                  ? `Est. payout if ${side.toUpperCase()}: ${money(shownEstimate, currency)}`
                  : 'Payout depends on the final pool'}
              </span>
            </div>
          </div>
        )}

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        {user && user.stakes.length > 0 && !isFinal && (
          <div className="grid gap-1 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Your stakes</p>
            {user.stakes.map((stake) => (
              <div key={stake.id} className="flex justify-between">
                <span className="uppercase">{stake.outcome}</span>
                <span>{money(stake.amountMinor, currency)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
