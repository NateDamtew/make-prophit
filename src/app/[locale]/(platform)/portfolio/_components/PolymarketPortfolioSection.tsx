'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2Icon, RefreshCwIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useState } from 'react'

import type { PolymarketPositionView } from '@/lib/polymarket/portfolio'

import { usePolymarketTrading } from '@/app/[locale]/(platform)/_hooks/usePolymarketTrading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { Link } from '@/i18n/navigation'
import { fetchPolymarketCashBalance, fetchPolymarketPositions } from '@/lib/polymarket/portfolio'
import { getRampForCountry } from '@/lib/ramp'

async function fetchSavedWallet(): Promise<`0x${string}` | null> {
  const response = await fetch('/api/polymarket/account', { cache: 'no-store' })
  if (!response.ok) {
    return null
  }
  const payload = (await response.json()) as { wallet: `0x${string}` | null }
  return payload.wallet
}

function formatUsd(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * The user's Polymarket account inside Prophit: cash, positions, claims and
 * withdrawals. Shown once they have set up Polymarket trading.
 */
export default function PolymarketPortfolioSection() {
  const t = useExtracted()
  const trading = usePolymarketTrading()
  const walletQuery = useQuery({ queryKey: ['polymarket-saved-wallet'], queryFn: fetchSavedWallet, staleTime: 60_000 })
  const wallet = walletQuery.data ?? null
  const positionsQuery = useQuery({
    queryKey: ['polymarket-positions', wallet],
    enabled: Boolean(wallet),
    queryFn: () => fetchPolymarketPositions(wallet!),
    refetchInterval: 30_000,
  })
  const cashQuery = useQuery({
    queryKey: ['polymarket-cash', wallet],
    enabled: Boolean(wallet),
    queryFn: () => fetchPolymarketCashBalance(wallet!),
    refetchInterval: 30_000,
  })
  const [claiming, setClaiming] = useState<string | null>(null)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawTo, setWithdrawTo] = useState('')
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  if (!wallet) {
    return null
  }

  const positions = positionsQuery.data ?? []
  const openValue = positions.reduce((sum, position) => sum + position.currentValue, 0)
  // A local-currency option appears here once a ramp is configured for the user's country.
  const localRamp = getRampForCountry(null)

  async function handleClaim(position: PolymarketPositionView) {
    setClaiming(position.conditionId)
    try {
      await trading.claimWinnings(position.conditionId)
      toast.success(t('Winnings claimed'), { description: position.title })
      void positionsQuery.refetch()
      void cashQuery.refetch()
    } catch (error) {
      toast.error(t('Claim failed'), { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setClaiming(null)
    }
  }

  async function handleWithdraw() {
    const amount = Number.parseFloat(withdrawAmount)
    const recipient = (withdrawTo.trim() || trading.ownerAddress || '') as `0x${string}`
    if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
      toast.error(t('Enter a valid wallet address.'))
      return
    }
    setIsWithdrawing(true)
    try {
      await trading.withdraw(amount, recipient)
      toast.success(t('Withdrawal sent'), { description: t('USDC on Polygon is on its way.') })
      setWithdrawAmount('')
      void cashQuery.refetch()
    } catch (error) {
      toast.error(t('Withdrawal failed'), { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setIsWithdrawing(false)
    }
  }

  return (
    <section className="grid gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{t('Polymarket account')}</h2>
          <Badge variant="outline">{t('Your wallet')}</Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void positionsQuery.refetch()
            void cashQuery.refetch()
          }}
        >
          <RefreshCwIcon className="size-4" />
          {t('Refresh')}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{t('Cash')}</p>
          <p className="text-xl font-semibold tabular-nums">
            {cashQuery.data == null ? '—' : formatUsd(cashQuery.data)}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{t('Positions value')}</p>
          <p className="text-xl font-semibold tabular-nums">{formatUsd(openValue)}</p>
        </div>
      </div>

      {positionsQuery.isLoading ? (
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      ) : positions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('No Polymarket positions yet.')}</p>
      ) : (
        <div className="grid gap-2">
          {positions.map((position) => (
            <div
              key={`${position.conditionId}-${position.outcome}`}
              className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <div className="grid min-w-0 flex-1">
                <span className="truncate font-medium">{position.title}</span>
                <span className="text-xs text-muted-foreground">
                  {position.outcome} · {position.shares.toFixed(2)} {t('shares')} · {t('avg')}{' '}
                  {Math.round(position.avgPrice * 100)}¢
                </span>
              </div>
              <div className="grid text-right tabular-nums">
                <span>{formatUsd(position.currentValue)}</span>
                <span className={position.pnl >= 0 ? 'text-xs text-yes' : 'text-xs text-no'}>
                  {position.pnl >= 0 ? '+' : ''}
                  {formatUsd(position.pnl)}
                </span>
              </div>
              {position.redeemable ? (
                <Button
                  size="sm"
                  onClick={() => void handleClaim(position)}
                  disabled={claiming === position.conditionId}
                >
                  {claiming === position.conditionId && <Loader2Icon className="size-4 animate-spin" />}
                  {t('Claim')}
                </Button>
              ) : (
                <Badge variant="outline">{position.currentPrice >= 0.999 ? t('Result pending') : t('Open')}</Badge>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">{t('Withdraw')}</p>
        <div className="flex flex-wrap gap-2">
          <Input
            className="w-28"
            inputMode="decimal"
            placeholder={t('Amount $')}
            value={withdrawAmount}
            onChange={(event) => setWithdrawAmount(event.target.value)}
          />
          <Input
            className="min-w-56 flex-1"
            placeholder={trading.ownerAddress ?? t('Polygon wallet address')}
            value={withdrawTo}
            onChange={(event) => setWithdrawTo(event.target.value)}
          />
          <Button size="sm" onClick={() => void handleWithdraw()} disabled={isWithdrawing || !withdrawAmount}>
            {isWithdrawing && <Loader2Icon className="size-4 animate-spin" />}
            {t('Withdraw USDC')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {localRamp
            ? t('You can also cash out to mobile money.')
            : t('Sent as USDC on Polygon. Leave the address empty to use your login wallet.')}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        {t('Prices and positions come from Polymarket. Your funds stay in your own wallet.')}{' '}
        <Link href="/" className="underline">
          {t('Find markets')}
        </Link>
      </p>
    </section>
  )
}
