'use client'

import { BellIcon, CheckIcon, CopyIcon, Loader2Icon, WalletIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useState, useTransition } from 'react'

import type { Event, Market, Outcome } from '@/types'

import { usePolymarketTrading } from '@/app/[locale]/(platform)/_hooks/usePolymarketTrading'
import { registerPolymarketTradingInterestAction } from '@/app/[locale]/(platform)/event/[slug]/_actions/polymarket-interest'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { useAppKit } from '@/hooks/useAppKit'
import { formatCentsLabel } from '@/lib/formatters'
import { resolveFallbackOutcomeUnitPrice } from '@/lib/market-pricing'
import { fetchPolymarketDepositAddresses, POLYMARKET_MIN_ORDER_USD } from '@/lib/polymarket/trading-client'
import { cn } from '@/lib/utils'
import { useUser } from '@/stores/useUser'

interface PolymarketOrderPanelProps {
  event: Event
  isMobile: boolean
  initialMarket?: Market | null
  className?: string
}

const QUICK_AMOUNTS = [1, 5, 10, 25]
/** Market orders may fill up to this far from the shown price before they are cut off. */
const PRICE_TOLERANCE = 0.03

/**
 * Order panel for venue = 'polymarket' events. Prices are Polymarket's live
 * book. Users the access gate allows trade straight on Polymarket from their
 * own wallet (with Prophit's builder code); everyone else can ask to be told
 * when trading opens.
 */
export default function PolymarketOrderPanel({ event, isMobile, initialMarket, className }: PolymarketOrderPanelProps) {
  const t = useExtracted()
  const trading = usePolymarketTrading()
  const market = initialMarket ?? event.markets[0] ?? null

  return (
    <div className={cn('grid gap-4 rounded-xl border bg-card p-4', !isMobile && 'lg:w-85', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{market?.short_title || market?.title || event.title}</span>
        <Badge variant="outline">{t('On Polymarket')}</Badge>
      </div>

      {market && trading.tradingEnabled ? (
        <PolymarketTradeForm market={market} trading={trading} />
      ) : (
        <PolymarketInterest event={event} market={market} reason={trading.blockReason} />
      )}
    </div>
  )
}

function OutcomePrices({ market }: { market: Market }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {market.outcomes.map((outcome) => (
        <div key={outcome.token_id} className="grid gap-0.5 rounded-lg border bg-background px-3 py-2">
          <span className="truncate text-xs text-muted-foreground">{outcome.outcome_text}</span>
          <span className="text-base font-semibold tabular-nums">
            {formatCentsLabel(resolveFallbackOutcomeUnitPrice(market, outcome))}
          </span>
        </div>
      ))}
    </div>
  )
}

function PolymarketInterest({
  event,
  market,
  reason,
}: {
  event: Event
  market: Market | null
  reason: ReturnType<typeof usePolymarketTrading>['blockReason']
}) {
  const t = useExtracted()
  const user = useUser()
  const { open: openAppKit } = useAppKit()
  const [isSubmitting, startTransition] = useTransition()
  const [isRegistered, setIsRegistered] = useState(false)

  function handleNotify() {
    if (!user) {
      void openAppKit()
      return
    }
    startTransition(async () => {
      const result = await registerPolymarketTradingInterestAction(event.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setIsRegistered(true)
    })
  }

  return (
    <>
      {market && <OutcomePrices market={market} />}
      <p className="text-sm text-muted-foreground">
        {reason === 'region'
          ? t('Polymarket does not take new orders from your region.')
          : t('Trading this market with Polymarket’s full liquidity is coming soon to Prophit.')}
      </p>
      {reason !== 'region' && (
        <Button className="h-11 w-full font-semibold" onClick={handleNotify} disabled={isSubmitting || isRegistered}>
          {isRegistered ? <CheckIcon className="size-4" /> : <BellIcon className="size-4" />}
          {isRegistered ? t('We’ll let you know') : t('Notify me when trading opens')}
        </Button>
      )}
    </>
  )
}

function PolymarketTradeForm({
  market,
  trading,
}: {
  market: Market
  trading: ReturnType<typeof usePolymarketTrading>
}) {
  const t = useExtracted()
  const { open: openAppKit } = useAppKit()
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [outcome, setOutcome] = useState<Outcome | null>(market.outcomes[0] ?? null)
  const [amount, setAmount] = useState('5')
  const [isPlacing, setIsPlacing] = useState(false)
  const [depositAddress, setDepositAddress] = useState<string | null>(null)
  const price = outcome ? resolveFallbackOutcomeUnitPrice(market, outcome) : null
  const numericAmount = Number.parseFloat(amount)

  async function handleSubmit() {
    if (!trading.isWalletConnected) {
      void openAppKit()
      return
    }
    if (!outcome || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error(t('Enter an amount.'))
      return
    }
    setIsPlacing(true)
    try {
      const limitPrice =
        price == null
          ? undefined
          : side === 'buy'
            ? Math.min(0.99, price + PRICE_TOLERANCE)
            : Math.max(0.01, price - PRICE_TOLERANCE)
      const response = await trading.placeOrder({
        tokenId: outcome.token_id,
        side,
        amount: numericAmount,
        limitPrice,
      })
      if (response.ok) {
        toast.success(side === 'buy' ? t('Order placed') : t('Shares sold'), {
          description: `${outcome.outcome_text} · ${response.status}`,
        })
      } else {
        toast.error(t('Polymarket rejected the order'), { description: response.message })
      }
    } catch (error) {
      toast.error(t('Trade failed'), { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setIsPlacing(false)
    }
  }

  async function handleShowDeposit(builderCode: string | null) {
    if (!trading.account || !builderCode) {
      return
    }
    try {
      const addresses = await fetchPolymarketDepositAddresses(trading.account.wallet, builderCode)
      setDepositAddress(addresses.evm)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(['buy', 'sell'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={cn(
              'rounded-md py-1.5 text-sm font-semibold transition-colors',
              side === value ? 'bg-background shadow-xs' : 'text-muted-foreground',
            )}
            onClick={() => setSide(value)}
          >
            {value === 'buy' ? t('Buy') : t('Sell')}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {market.outcomes.map((entry) => (
          <Button
            key={entry.token_id}
            variant={entry.outcome_index === 0 ? 'yes' : 'no'}
            size="outcome"
            className={cn(outcome?.token_id === entry.token_id && 'ring-2 ring-ring')}
            onClick={() => setOutcome(entry)}
          >
            <span className="truncate">{entry.outcome_text}</span>
            <span className="tabular-nums">{formatCentsLabel(resolveFallbackOutcomeUnitPrice(market, entry))}</span>
          </Button>
        ))}
      </div>

      <div className="grid gap-1.5">
        <span className="text-xs text-muted-foreground">
          {side === 'buy' ? t('Amount (USD)') : t('Shares to sell')}
        </span>
        <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        {side === 'buy' && (
          <div className="flex gap-1.5">
            {QUICK_AMOUNTS.map((value) => (
              <Button
                key={value}
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => setAmount(String(value))}
              >
                ${value}
              </Button>
            ))}
          </div>
        )}
        {side === 'buy' && Number.isFinite(numericAmount) && numericAmount > 0 && price ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('≈ {shares} shares, pays ${payout} if right', {
              shares: (numericAmount / price).toFixed(2),
              payout: (numericAmount / price).toFixed(2),
            })}
          </span>
        ) : null}
        {side === 'buy' && numericAmount > 0 && numericAmount < POLYMARKET_MIN_ORDER_USD && (
          <span className="text-xs text-destructive">{t('The smallest order is $1.')}</span>
        )}
      </div>

      <Button className="h-11 w-full font-semibold" onClick={handleSubmit} disabled={isPlacing}>
        {isPlacing && <Loader2Icon className="size-4 animate-spin" />}
        {!trading.isWalletConnected ? t('Connect wallet to trade') : side === 'buy' ? t('Buy') : t('Sell')}
      </Button>

      <div className="grid gap-2 rounded-lg border bg-background p-3 text-sm">
        {trading.account ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('Polymarket balance')}</span>
              <span className="font-semibold tabular-nums">${trading.account.balanceUsd.toFixed(2)}</span>
            </div>
            {depositAddress ? (
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">
                  {t('Send USDC or USDT (Polygon, Ethereum, Base, Arbitrum…) to:')}
                </span>
                <button
                  type="button"
                  className="flex items-center gap-1.5 truncate text-left font-mono text-xs"
                  onClick={() => void navigator.clipboard?.writeText(depositAddress)}
                >
                  <CopyIcon className="size-3 shrink-0" />
                  {depositAddress}
                </button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => void handleShowDeposit(trading.builderCode)}>
                {t('Add funds')}
              </Button>
            )}
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={!trading.isWalletConnected || trading.isAccountLoading}
            onClick={() => void trading.loadAccount()}
          >
            {trading.isAccountLoading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <WalletIcon className="size-4" />
            )}
            {t('Set up Polymarket trading')}
          </Button>
        )}
        {trading.accountError && <span className="text-xs text-destructive">{trading.accountError}</span>}
      </div>
    </div>
  )
}
