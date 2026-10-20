'use client'

import { useExtracted } from 'next-intl'
import Image from 'next/image'

import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { formatPoolMoney } from '@/lib/pools/format'
import { cn } from '@/lib/utils'

/**
 * "To win" block for pool stakes, same layout as `EventOrderPanelEarnings`
 * (buy side). The payout is an estimate: a parimutuel pool only fixes it at
 * close, which the sub-line says.
 */

interface PoolOrderPanelEarningsProps {
  isMobile: boolean
  stakeMinor: bigint
  payoutMinor: bigint
  currency: string | null
  rakeBps: number
}

function getWholeDigitCount(minor: bigint) {
  return Math.max(1, (minor / 100n).toString().length)
}

export default function PoolOrderPanelEarnings({
  isMobile,
  stakeMinor,
  payoutMinor,
  currency,
  rakeBps,
}: PoolOrderPanelEarningsProps) {
  const t = useExtracted()
  const payout = payoutMinor > 0n ? payoutMinor : 0n
  const profit = payout - stakeMinor
  const toWinLabel = formatPoolMoney(payout, currency)
  const profitLabel = formatPoolMoney(profit < 0n ? -profit : profit, currency)
  const multiplier = stakeMinor > 0n ? Number(payout) / Number(stakeMinor) : 0
  const changePct = stakeMinor > 0n ? (Number(profit) / Number(stakeMinor)) * 100 : 0
  const impliedChance = payout > 0n ? Math.round((Number(stakeMinor) / Number(payout)) * 100) : null
  const changeLabel = `${changePct >= 0 ? '+' : '-'}${Math.abs(changePct).toFixed(0)}%`
  const multiplierLabel = `${Math.max(0, multiplier).toFixed(2)}x`
  const digitCount = getWholeDigitCount(payout)
  const mobileEarningsClass = cn(
    'font-bold text-yes',
    digitCount >= 9 ? 'text-lg' : digitCount >= 7 ? 'text-xl' : 'text-2xl',
  )
  const desktopEarningsClass = cn(
    'font-bold text-yes',
    digitCount >= 9 ? 'text-xl' : digitCount >= 7 ? 'text-2xl' : 'text-3xl',
  )
  const subLabel =
    impliedChance !== null
      ? t('Est. price {price}% · fixed at close', { price: String(impliedChance) })
      : t('Payout depends on the final pool')

  return (
    <div className={cn(isMobile ? 'mb-4 text-center' : 'mb-4')}>
      {!isMobile && <hr className="mb-3 border" />}
      <div className={cn('flex', isMobile ? 'flex-col' : 'items-center justify-between')}>
        <div className={cn({ 'mb-1': isMobile })}>
          <div
            className={cn(
              'flex items-center gap-1 font-bold text-foreground',
              isMobile ? 'justify-center text-lg' : 'text-sm',
            )}
          >
            {t('To win')}
            <Popover>
              <PopoverTrigger
                openOnHover
                delay={0}
                closeDelay={150}
                render={
                  <button
                    type="button"
                    aria-label={t('Earnings breakdown')}
                    className="inline-flex cursor-help items-center"
                  >
                    <Image
                      src="/images/trade/money.svg"
                      alt=""
                      width={20}
                      height={14}
                      className={cn(isMobile ? 'h-5 w-8' : 'ml-1 h-4 w-6')}
                    />
                  </button>
                }
              />
              <PopoverContent
                side="top"
                className="w-56 border border-border bg-background px-4 py-3 text-sm font-semibold text-muted-foreground shadow-xl"
              >
                <PopoverTitle className="sr-only">{t('Earnings breakdown')}</PopoverTitle>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span>{t('Profit')}</span>
                    <span className="text-base font-bold text-yes">
                      {profit >= 0n ? `+${profitLabel}` : `-${profitLabel}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{t('Change')}</span>
                    <span className="text-base font-bold text-yes">{changeLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{t('Multiplier')}</span>
                    <span className="text-base font-bold text-yes">{multiplierLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t pt-2 text-xs font-medium">
                    <span>{t('Pool fee')}</span>
                    <span>{rakeBps / 100}%</span>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            {isMobile && <span className={mobileEarningsClass}>{toWinLabel}</span>}
          </div>
          <div className={cn('text-muted-foreground', isMobile ? 'text-center text-sm' : 'text-xs')}>{subLabel}</div>
        </div>
        {!isMobile && <div className={desktopEarningsClass}>{toWinLabel}</div>}
      </div>
    </div>
  )
}
