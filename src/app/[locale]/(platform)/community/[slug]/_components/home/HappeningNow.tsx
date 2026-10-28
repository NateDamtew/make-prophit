'use client'

import { useExtracted } from 'next-intl'

import { formatChance, formatMoney } from '@/components/communities/format'
import { Countdown } from '@/components/communities/time/Countdown'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

import type { PresetMarket } from '../presets/types'

import { poolTotal } from './market-groups'

/**
 * The strip of what is live right now: markets closing within two days and
 * markets the jury is deciding. Horizontal on phones, a row on desktop.
 */

interface HappeningNowProps {
  closing: PresetMarket[]
  deciding: PresetMarket[]
  communitySlug: string
  className?: string
}

export default function HappeningNow({ closing, deciding, communitySlug, className }: HappeningNowProps) {
  const t = useExtracted()
  const items = [
    ...closing.slice(0, 4).map((market) => ({ market, kind: 'closing' as const })),
    ...deciding.slice(0, 2).map((market) => ({ market, kind: 'deciding' as const })),
  ]
  if (items.length === 0) {
    return null
  }
  return (
    <section className={cn('flex flex-col gap-3', className)} aria-label={t('Happening now')}>
      <div className="flex items-center gap-2">
        <span className="relative inline-flex size-2" aria-hidden="true">
          <span className="absolute inset-0 rounded-full bg-foreground/15" />
          <span className="absolute inset-0.5 rounded-full bg-foreground" />
        </span>
        <h2 className="text-[15px] font-bold">{t('Happening now')}</h2>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {items.map(({ market, kind }) => {
          const pool = market.pool ?? null
          const total = poolTotal(market)
          const chance = pool && total > 0n ? pool.yesChance / 100 : null
          return (
            <Link
              key={market.id}
              href={`/community/${communitySlug}/market/${market.id}`}
              className="flex w-64 shrink-0 flex-col gap-2 rounded-xl border border-border bg-card p-3.5 hover:bg-secondary/40 sm:w-auto"
            >
              <span className="line-clamp-2 text-sm font-semibold">{market.title}</span>
              <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                <span>
                  {chance === null ? t('No stakes yet') : t('{chance} Yes', { chance: formatChance(chance) })}
                  {' · '}
                  {formatMoney(total, pool?.currency ?? null)}
                </span>
                {kind === 'closing' ? (
                  <Countdown target={market.resolution_date} verb={t('Closes')} compact />
                ) : (
                  <span className="font-semibold text-foreground">{t('Jury deciding')}</span>
                )}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
