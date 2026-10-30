'use client'

import { CopyIcon, Loader2Icon, WalletIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useState } from 'react'

import type { PolymarketNotifyReason } from '@/app/[locale]/(platform)/event/[slug]/_components/PolymarketNotifyDialog'
import type { Event, Market, Outcome } from '@/types'

import { usePolymarketTrading } from '@/app/[locale]/(platform)/_hooks/usePolymarketTrading'
import PolymarketNotifyDialog from '@/app/[locale]/(platform)/event/[slug]/_components/PolymarketNotifyDialog'
import EventIconImage from '@/components/EventIconImage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useAppKit } from '@/hooks/useAppKit'
import { formatCentsLabel } from '@/lib/formatters'
import { resolveFallbackOutcomeUnitPrice } from '@/lib/market-pricing'
import { fetchPolymarketDepositAddresses, POLYMARKET_MIN_ORDER_USD } from '@/lib/polymarket/trading-client'
import { cn } from '@/lib/utils'
import { useOrder } from '@/stores/useOrder'
import { useUser } from '@/stores/useUser'

interface PolymarketOrderPanelProps {
  event: Event
  isMobile: boolean
  initialMarket?: Market | null
  className?: string
}

const QUICK_AMOUNTS = [1, 5, 10, 100]
/** Market orders may fill up to this far from the shown price before they are cut off. */
const PRICE_TOLERANCE = 0.03

/**
 * Order panel for venue = 'polymarket' events. Prices are Polymarket's live
 * book, and everyone sees the full order form with what they'd win. On Trade:
 * users the access gate allows place the order on Polymarket from their own
 * wallet (with Prophit's builder code); visitors from countries Polymarket
 * refuses get a "notify me" modal; signed-out visitors elsewhere are sent to
 * sign up; signed-in users who can't trade yet get the "notify me" modal.
 */
export default function PolymarketOrderPanel({ event, isMobile, initialMarket, className }: PolymarketOrderPanelProps) {
  const t = useExtracted()
  const trading = usePolymarketTrading()
  const storeMarket = useOrder((state) => state.market)
  const storeOutcome = useOrder((state) => state.outcome)
  const setStoreOutcome = useOrder((state) => state.setOutcome)

  // Follow the outcome picked from the market list, like the Kuest panel does.
  const market =
    event.markets.find((entry) => entry.condition_id === storeMarket?.condition_id) ??
    initialMarket ??
    event.markets[0] ??
    null
  const outcome =
    market && storeOutcome?.condition_id === market.condition_id
      ? (market.outcomes.find((entry) => entry.token_id === storeOutcome.token_id) ?? market.outcomes[0] ?? null)
      : (market?.outcomes[0] ?? null)
  const isMultiMarket = event.markets.length > 1

  return (
    <div className={cn('grid gap-4 rounded-xl border bg-card p-4', !isMobile && 'lg:w-85', className)}>
      <div className="flex items-center gap-3">
        {isMultiMarket && market?.icon_url && (
          <EventIconImage
            src={market.icon_url}
            alt={market.title}
            sizes="40px"
            containerClassName="size-10 shrink-0 rounded-md"
          />
        )}
        <div className="grid min-w-0 flex-1 gap-0.5">
          {isMultiMarket && <span className="truncate text-xs text-muted-foreground">{event.title}</span>}
          <span className="truncate text-sm font-semibold">
            {market?.short_title || market?.title || event.title}
            {outcome && (
              <span className={cn('ml-1.5', outcome.outcome_index === 0 ? 'text-yes' : 'text-no')}>
                · {outcome.outcome_text}
              </span>
            )}
          </span>
        </div>
        <Badge variant="outline" className="shrink-0">
          {t('On Polymarket')}
        </Badge>
      </div>

      {market && (
        <PolymarketTradeForm
          event={event}
          market={market}
          outcome={outcome}
          onOutcomeChange={setStoreOutcome}
          trading={trading}
        />
      )}
    </div>
  )
}

function PolymarketTradeForm({
  event,
  market,
  outcome,
  onOutcomeChange,
  trading,
}: {
  event: Event
  market: Market
  outcome: Outcome | null
  onOutcomeChange: (outcome: Outcome) => void
  trading: ReturnType<typeof usePolymarketTrading>
}) {
  const t = useExtracted()
  const user = useUser()
  const { open: openAppKit } = useAppKit()
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [isPlacing, setIsPlacing] = useState(false)
  const [depositAddress, setDepositAddress] = useState<string | null>(null)
  const [notifyReason, setNotifyReason] = useState<PolymarketNotifyReason | null>(null)
  const price = outcome ? resolveFallbackOutcomeUnitPrice(market, outcome) : null
  const numericAmount = Number.parseFloat(amount)
  const hasAmount = Number.isFinite(numericAmount) && numericAmount > 0
  const shares =
    side === 'buy' && hasAmount && price ? numericAmount / price : side === 'sell' && hasAmount ? numericAmount : 0
  const toWin = side === 'buy' ? shares : price ? shares * price : 0

  function addAmount(value: number) {
    const current = Number.isFinite(numericAmount) ? numericAmount : 0
    setAmount(String(Math.round((current + value) * 100) / 100))
  }

  function handleTrade() {
    if (trading.tradingEnabled) {
      void placeOrder()
      return
    }
    if (trading.regionRestricted) {
      setNotifyReason('region')
      return
    }
    if (!user) {
      void openAppKit()
      return
    }
    setNotifyReason('coming-soon')
  }

  async function placeOrder() {
    if (!trading.isWalletConnected) {
      void openAppKit()
      return
    }
    if (!outcome || !hasAmount) {
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

  const tradeLabel = !trading.tradingEnabled
    ? t('Trade')
    : !trading.isWalletConnected
      ? t('Connect wallet to trade')
      : side === 'buy'
        ? t('Buy')
        : t('Sell')

  return (
    <div className="grid gap-4">
      <div className="flex gap-4 border-b">
        {(['buy', 'sell'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={cn(
              '-mb-px border-b-2 pb-2 text-sm font-semibold transition-colors',
              side === value ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground',
            )}
            onClick={() => setSide(value)}
          >
            {value === 'buy' ? t('Buy') : t('Sell')}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {market.outcomes.map((entry) => {
          const isSelected = outcome?.token_id === entry.token_id
          const isYes = entry.outcome_index === 0
          return (
            <Button
              key={entry.token_id}
              variant={isYes ? 'yes' : 'no'}
              size="outcomeLg"
              className={cn(
                isSelected && isYes && 'bg-yes text-white hover:bg-yes dark:hover:bg-yes',
                isSelected && !isYes && 'bg-no text-white hover:bg-no dark:hover:bg-no',
              )}
              onClick={() => onOutcomeChange(entry)}
            >
              <span className="truncate">{entry.outcome_text}</span>
              <span className="tabular-nums">{formatCentsLabel(resolveFallbackOutcomeUnitPrice(market, entry))}</span>
            </Button>
          )
        })}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-base font-semibold">{side === 'buy' ? t('Amount') : t('Shares')}</span>
          <div className="flex min-w-0 items-center text-3xl font-bold tabular-nums">
            {side === 'buy' && <span className={cn(!amount && 'text-muted-foreground')}>$</span>}
            <input
              inputMode="decimal"
              placeholder="0"
              aria-label={side === 'buy' ? t('Amount (USD)') : t('Shares to sell')}
              className="w-full max-w-36 min-w-0 bg-transparent text-right outline-none placeholder:text-muted-foreground"
              value={amount}
              onChange={(changeEvent) => setAmount(changeEvent.target.value.replace(/[^\d.]/g, ''))}
            />
          </div>
        </div>
        <div className="flex justify-end gap-1.5">
          {QUICK_AMOUNTS.map((value) => (
            <Button
              key={value}
              size="sm"
              variant="secondary"
              className="h-7 px-2 text-xs"
              onClick={() => addAmount(value)}
            >
              {side === 'buy' ? `+$${value}` : `+${value}`}
            </Button>
          ))}
        </div>
        {side === 'buy' && hasAmount && numericAmount < POLYMARKET_MIN_ORDER_USD && (
          <span className="text-right text-xs text-destructive">{t('The smallest order is $1.')}</span>
        )}
      </div>

      {hasAmount && price ? (
        <div className="flex items-end justify-between gap-3 border-t pt-4">
          <div className="grid gap-0.5">
            <span className="text-base font-semibold">{side === 'buy' ? t('To win') : t('You’ll receive')}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {t('Avg. price {price}', { price: formatCentsLabel(price) })}
            </span>
          </div>
          <span className="text-3xl font-bold text-yes tabular-nums">${toWin.toFixed(2)}</span>
        </div>
      ) : null}

      <Button
        className="h-11 w-full font-semibold"
        onClick={handleTrade}
        disabled={isPlacing || trading.isConfigLoading}
      >
        {isPlacing && <Loader2Icon className="size-4 animate-spin" />}
        {tradeLabel}
      </Button>

      {trading.tradingEnabled && (
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
      )}

      <PolymarketNotifyDialog
        open={notifyReason !== null}
        onOpenChange={(open) => !open && setNotifyReason(null)}
        reason={notifyReason ?? 'coming-soon'}
        country={trading.country}
        event={event}
        pick={
          outcome
            ? {
                label: `${market.short_title || market.title} · ${outcome.outcome_text}`,
                amountUsd: side === 'buy' && hasAmount ? numericAmount : null,
                toWinUsd: side === 'buy' && hasAmount && price ? toWin : null,
              }
            : null
        }
      />
    </div>
  )
}
