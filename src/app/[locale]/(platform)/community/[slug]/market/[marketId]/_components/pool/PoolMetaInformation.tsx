'use client'

import { useExtracted } from 'next-intl'

import { Countdown } from '@/components/communities/time/Countdown'
import { formatPoolMoney } from '@/lib/pools/format'

/**
 * The "pool · people · closes" strip under the chart, in the pool's local
 * currency, with a calm countdown to close.
 */

interface PoolMetaInformationProps {
  totalMinor: bigint
  stakeCount: number
  currency: string | null
  endDate: Date | string | number | null
}

export default function PoolMetaInformation({ totalMinor, stakeCount, currency, endDate }: PoolMetaInformationProps) {
  const t = useExtracted()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground tabular-nums">
      <span>
        <strong className="font-semibold text-foreground">{formatPoolMoney(totalMinor, currency)}</strong> {t('pool')}
      </span>
      <span aria-hidden="true">·</span>
      <span>
        <strong className="font-semibold text-foreground">{stakeCount}</strong> {t('people in')}
      </span>
      {endDate ? <span aria-hidden="true">·</span> : null}
      {endDate ? <Countdown target={endDate} verb={t('Closes')} /> : null}
    </div>
  )
}
