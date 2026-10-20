'use client'

import { CheckIcon, XIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'

import EventIconImage from '@/components/EventIconImage'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { formatPoolVolume } from '@/lib/pools/format'
import { cn } from '@/lib/utils'

import type { PresetMarket } from '../presets/types'

/**
 * Community market card with the home-page `EventCard` look: icon + title,
 * the chance gauge, Yes/No buttons and the volume footer. Odds and volume
 * come from the market's pool; markets linked to a platform event open the
 * event page instead.
 */

interface PoolMarketCardProps {
  market: PresetMarket
  communitySlug: string
  communityIconUrl?: string | null
}

function ChanceGauge({ chance, footerLabel }: { chance: number; footerLabel: string }) {
  const rounded = Math.round(chance)
  return (
    <div className="relative -mt-3 flex flex-col items-center">
      <div className="relative">
        <svg width="72" height="52" viewBox="0 0 72 52" className="rotate-0 transform">
          <path
            d="M 6 46 A 30 30 0 0 1 66 46"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            className="text-slate-200 dark:text-slate-600"
          />
          <path
            d="M 6 46 A 30 30 0 0 1 66 46"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            className={cn(
              'transition-all duration-300',
              rounded < 40 ? 'text-no' : rounded === 50 ? 'text-slate-400' : 'text-yes',
            )}
            strokeDasharray={`${(rounded / 100) * 94.25} 94.25`}
            strokeDashoffset="0"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pt-4">
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{rounded}%</span>
        </div>
      </div>
      <div className="-mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">{footerLabel}</div>
    </div>
  )
}

export default function PoolMarketCard({ market, communitySlug, communityIconUrl }: PoolMarketCardProps) {
  const t = useExtracted()
  const locale = useLocale()
  const pool = market.pool ?? null
  const isResolved = market.status === 'resolved' || market.status === 'cancelled' || market.status === 'disputed'
  const resolvedOutcome = market.resolved_outcome ?? pool?.settledOutcome ?? null
  const href = market.event_id ? `/event/${market.event_id}` : `/community/${communitySlug}/market/${market.id}`
  const iconUrl = market.image_url?.trim() || communityIconUrl?.trim() || ''
  const chance = pool && !isResolved ? pool.yesChance : null
  const volumeLabel = pool
    ? t('{amount} Vol.', {
        amount: formatPoolVolume(BigInt(pool.totalYesMinor) + BigInt(pool.totalNoMinor), pool.currency),
      })
    : null
  const endedLabel =
    isResolved && market.resolved_at
      ? t('Ended {date}', {
          date: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(
            new Date(market.resolved_at),
          ),
        })
      : null
  const yesLabel = t('Yes')
  const noLabel = t('No')

  return (
    <Card
      className={cn(
        `group flex h-45 flex-col overflow-hidden rounded-xl shadow-md shadow-black/4 transition-all hover:-translate-y-0.5 hover:shadow-black/8 dark:hover:bg-secondary [&_img]:pointer-events-none [&_img]:select-none`,
      )}
    >
      <CardContent className={cn('flex h-full flex-col px-3 pt-3', isResolved ? 'pb-3' : 'pb-3 md:pb-1')}>
        <div className="mb-3 flex items-start justify-between">
          <Link href={href} className="flex flex-1 items-center gap-2 pr-2">
            <div className="flex size-10 shrink-0 items-center justify-center self-start rounded-sm">
              {iconUrl ? (
                <EventIconImage
                  src={iconUrl}
                  alt={market.title}
                  sizes="40px"
                  containerClassName="size-full rounded-sm"
                />
              ) : (
                <div aria-hidden="true" className="size-full rounded-sm bg-linear-to-br from-primary/70 to-primary" />
              )}
            </div>
            <h3 className="line-clamp-3 w-full text-sm/5 font-semibold underline-offset-2 transition-colors duration-200 hover:text-foreground hover:underline">
              {market.title}
            </h3>
          </Link>
          {chance !== null && <ChanceGauge chance={chance} footerLabel={t('chance')} />}
        </div>

        <div className="flex flex-1 flex-col">
          <div className={cn(isResolved ? 'mt-6' : 'mt-auto')}>
            {isResolved ? (
              <div className="mt-auto mb-0">
                {resolvedOutcome === 'yes' || resolvedOutcome === 'no' ? (
                  <div className="flex h-12 w-full cursor-default items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold text-foreground transition-colors dark:border-none dark:bg-secondary dark:group-hover:bg-card">
                    <span
                      className={cn(
                        'flex size-4 items-center justify-center rounded-full',
                        resolvedOutcome === 'yes' ? 'bg-yes' : 'bg-no',
                      )}
                    >
                      {resolvedOutcome === 'yes' ? (
                        <CheckIcon className="size-3 text-background" strokeWidth={2.5} />
                      ) : (
                        <XIcon className="size-3 text-background" strokeWidth={2.5} />
                      )}
                    </span>
                    <span className="min-w-8 text-left">{resolvedOutcome === 'yes' ? yesLabel : noLabel}</span>
                  </div>
                ) : (
                  <div className="flex h-10 w-full cursor-default items-center justify-center rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors dark:group-hover:bg-card">
                    {market.status === 'disputed' ? t('Disputed') : t('Resolved')}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-auto mb-2 grid grid-cols-2 gap-2">
                <Button
                  variant="yes"
                  size="outcome"
                  nativeButton={false}
                  render={
                    <Link href={market.event_id ? href : `${href}?outcome=yes`}>
                      <span className="truncate">{yesLabel}</span>
                    </Link>
                  }
                />
                <Button
                  variant="no"
                  size="outcome"
                  nativeButton={false}
                  render={
                    <Link href={market.event_id ? href : `${href}?outcome=no`}>
                      <span className="truncate">{noLabel}</span>
                    </Link>
                  }
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">{volumeLabel ? <span>{volumeLabel}</span> : <span />}</div>
          {endedLabel ? <span>{endedLabel}</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}
