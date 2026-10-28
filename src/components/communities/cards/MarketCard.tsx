'use client'

import type { ReactNode } from 'react'

import { GlobeIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'

import type { MarketCardFooterState } from '@/components/communities/cards/MarketCardFooter'
import type { OutcomeRow } from '@/components/communities/odds/MultiOutcomeRows'

import { MarketCardFooter } from '@/components/communities/cards/MarketCardFooter'
import { formatChance, formatCloseLabel, formatMoney, formatRating } from '@/components/communities/format'
import { MultiOutcomeRows } from '@/components/communities/odds/MultiOutcomeRows'
import { LeadersCall } from '@/components/communities/trust/LeadersCall'
import { Button } from '@/components/ui/button'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * The community market card: icon tile, question, the odds, the leader's
 * call, Yes/No (or the outcome rows), then pool · people · closes, and who
 * resolves it. Once a market is past open, the buttons give way to a
 * lifecycle footer. Imported markets say where they come from.
 */

export interface MarketCardProps {
  href: string
  title: string
  iconUrl?: string | null
  /** Shown as the icon tile when there is no image. */
  icon?: ReactNode
  shape?: 'binary' | 'multi'
  source?: 'community' | 'imported'
  sourcePlatform?: string | null
  /** 0–1 chance for Yes (binary). Null = no stakes yet. */
  chance: number | null
  outcomes?: OutcomeRow[]
  labels?: { yes: string; no: string }
  poolMinor: string | bigint
  stakeCount: number
  currency: string | null
  closesAt?: Date | string | number | null
  leadersCall?: { name: string; image?: string | null; call: string } | null
  /** Links for the Yes / No buttons. Omit to link both to `href`. */
  stakeHrefs?: { yes: string; no: string }
  /** Lifecycle strip that replaces the buttons once the market is not open. */
  footer?: MarketCardFooterState | null
  jurySize?: number | null
  juryRating?: number | null
  className?: string
}

export function MarketCard({
  href,
  title,
  iconUrl,
  icon,
  shape = 'binary',
  source = 'community',
  sourcePlatform,
  chance,
  outcomes = [],
  labels,
  poolMinor,
  stakeCount,
  currency,
  closesAt,
  leadersCall,
  stakeHrefs,
  footer = null,
  jurySize,
  juryRating,
  className,
}: MarketCardProps) {
  const t = useExtracted()
  const locale = useLocale()
  const now = useNowTimestamp()
  const yesLabel = labels?.yes ?? t('Yes')
  const noLabel = labels?.no ?? t('No')
  const isOpen = footer === null
  const imported = source === 'imported'

  return (
    <article
      className={cn(
        'group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/40',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Link
          href={href}
          className={cn(
            'flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary',
            imported && 'opacity-70',
          )}
          aria-hidden="true"
          tabIndex={-1}
        >
          {iconUrl ? (
            <img src={iconUrl} alt="" className="size-full object-cover" />
          ) : (
            (icon ?? <span className="size-5 rounded-sm bg-(--community-accent,var(--color-muted-foreground))" />)
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={href} className="line-clamp-3 text-[15px]/snug font-semibold hover:underline">
            {title}
          </Link>
          {imported && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span className="inline-flex h-5 items-center gap-1 rounded-[6px] bg-secondary px-1.5 text-[11px] font-semibold">
                <GlobeIcon className="size-3" aria-hidden="true" />
                {t('From Prophit')}
              </span>
              {sourcePlatform && (
                <span className="inline-flex h-5 items-center rounded-[6px] border border-border px-1.5 text-[11px] font-semibold text-muted-foreground">
                  {t('Source: {platform}', { platform: sourcePlatform })}
                </span>
              )}
            </div>
          )}
        </div>
        {shape === 'binary' && chance !== null && (
          <span className="shrink-0 text-[15px] font-bold tabular-nums">{formatChance(chance)}</span>
        )}
      </div>

      {leadersCall && (
        <LeadersCall leaderName={leadersCall.name} leaderImage={leadersCall.image} call={leadersCall.call} />
      )}

      {isOpen && shape === 'multi' && <MultiOutcomeRows outcomes={outcomes} currency={currency} limit={3} size="sm" />}

      {isOpen && shape === 'binary' && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="yes" size="outcomeLg" nativeButton={false} render={<Link href={stakeHrefs?.yes ?? href} />}>
            <span className="truncate">
              {yesLabel}
              {chance !== null ? ` ${formatChance(chance)}` : ''}
            </span>
          </Button>
          <Button variant="no" size="outcomeLg" nativeButton={false} render={<Link href={stakeHrefs?.no ?? href} />}>
            <span className="truncate">
              {noLabel}
              {chance !== null ? ` ${formatChance(1 - chance)}` : ''}
            </span>
          </Button>
        </div>
      )}

      {footer && <MarketCardFooter state={footer} />}

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span className="truncate">
          {t('{amount} pool · {count} in', { amount: formatMoney(poolMinor, currency), count: String(stakeCount) })}
        </span>
        {closesAt && isOpen && (
          <span className="shrink-0">{t('Closes {when}', { when: formatCloseLabel(closesAt, locale, now) })}</span>
        )}
      </div>

      <div className="border-t border-border pt-2 text-xs text-muted-foreground">
        {imported
          ? t('Resolves automatically from the source · no jury, no hold')
          : jurySize
            ? t('Resolved by {count} jurors{rating}', {
                count: String(jurySize),
                rating: juryRating !== null && juryRating !== undefined ? ` · ${formatRating(juryRating)}` : '',
              })
            : t('Resolved by the community jury')}
      </div>
    </article>
  )
}
