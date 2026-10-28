'use client'

import { useExtracted } from 'next-intl'

import type { CommunityLevel, LeaderType } from '@/lib/communities/rules'

import { formatMoney, formatRating } from '@/components/communities/format'
import { LeaderTypeBadge } from '@/components/communities/trust/LeaderTypeBadge'
import { LevelBadge } from '@/components/communities/trust/LevelBadge'
import { VerifiedBadge } from '@/components/community-engagement/VerifiedBadge'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * A community on the explore page: icon, name, level, who leads it, and
 * the three numbers that say whether it is alive: members, open markets,
 * money staked in the last 30 days.
 */

export interface CommunityCardProps {
  slug: string
  name: string
  description: string | null
  iconUrl: string | null
  level: CommunityLevel
  levelName: string
  isVerified: boolean
  leaderType: LeaderType | null
  memberCount: number
  maxMembers: number
  openMarkets: number
  volume30dMinor: string
  currency: string | null
  rating: number | null
  joined?: boolean
  joinsPaused?: boolean
  className?: string
}

export function CommunityCard({
  slug,
  name,
  description,
  iconUrl,
  level,
  levelName,
  isVerified,
  leaderType,
  memberCount,
  maxMembers,
  openMarkets,
  volume30dMinor,
  currency,
  rating,
  joined = false,
  joinsPaused = false,
  className,
}: CommunityCardProps) {
  const t = useExtracted()
  return (
    <Link
      href={`/community/${slug}`}
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/40',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary">
          {iconUrl ? (
            <img src={iconUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="size-5 rounded-sm bg-muted-foreground/60" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[15px]/snug font-bold">
            <span className="truncate">{name}</span>
            <VerifiedBadge isVerified={isVerified} />
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <LevelBadge level={level} name={levelName} size="sm" />
            {leaderType ? <LeaderTypeBadge type={leaderType} className="h-5 text-[11px]" /> : null}
            {joined ? (
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {t('Joined')}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {description ? <p className="line-clamp-2 text-sm/relaxed text-muted-foreground">{description}</p> : null}
      <dl className="grid grid-cols-3 gap-2 text-xs text-muted-foreground tabular-nums">
        <div>
          <dt>{t('Members')}</dt>
          <dd className="text-sm font-semibold text-foreground">
            {memberCount.toLocaleString('en-US')}
            {joinsPaused || memberCount >= maxMembers ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">{t('full')}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>{t('Open')}</dt>
          <dd className="text-sm font-semibold text-foreground">{openMarkets}</dd>
        </div>
        <div>
          <dt>{t('30 days')}</dt>
          <dd className="text-sm font-semibold text-foreground">
            {BigInt(volume30dMinor) > 0n ? formatMoney(volume30dMinor, currency) : '—'}
          </dd>
        </div>
      </dl>
      {rating !== null ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          {t('Rated {rating} by losers', { rating: formatRating(rating) })}
        </p>
      ) : null}
    </Link>
  )
}
