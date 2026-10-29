'use client'

import { useExtracted, useLocale } from 'next-intl'

import type { ExploreCommunityRow } from '@/lib/db/queries/community-explore'

import { RecordBars } from '@/components/communities/explore/RecordBars'
import { formatCloseLabel, formatMoney, initials } from '@/components/communities/format'
import { Link } from '@/i18n/navigation'
import { getCategoryForLeaderType } from '@/lib/communities/categories'
import { cn } from '@/lib/utils'

/**
 * A community on Explore: who it is, what it is asking right now with
 * the odds, how much is in it and when it closes, and its record. A
 * group without open questions says members see them.
 */
export function QuestionCard({
  community,
  now,
  className,
}: {
  community: ExploreCommunityRow
  now: number
  className?: string
}) {
  const t = useExtracted()
  const locale = useLocale()
  const category = getCategoryForLeaderType(community.leaderType)
  const market = community.topMarket
  const yes = market ? Math.round(market.yesChance * 100) : null
  const members = t('{count} members', { count: community.memberCount.toLocaleString('en-US') })
  const meta = category ? `${category.countNoun.one} · ${members}` : members
  const full = community.joinsPaused || community.memberCount >= community.maxMembers

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/30',
        className,
      )}
    >
      <Link href={`/community/${community.slug}`} className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary text-xs font-bold text-muted-foreground">
          {community.iconUrl ? (
            <img src={community.iconUrl} alt="" className="size-full object-cover" />
          ) : (
            initials(community.name)
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[15px]/snug font-bold">
            <span className="truncate">{community.name}</span>
            {community.isVerified ? (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">✓</span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground capitalize">{meta}</span>
        </span>
        <RecordBars record={community.record} />
      </Link>

      {market ? (
        <>
          <Link
            href={`/community/${community.slug}/market/${market.id}`}
            className="text-[15px]/snug font-semibold text-foreground hover:underline"
          >
            {market.title}
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={`/community/${community.slug}/market/${market.id}?stake=yes`}
              className="flex h-10 items-center justify-between rounded-[10px] bg-yes/15 px-3 text-sm font-bold text-yes"
            >
              <span>{t('Yes')}</span>
              <span className="tabular-nums">{yes}%</span>
            </Link>
            <Link
              href={`/community/${community.slug}/market/${market.id}?stake=no`}
              className="flex h-10 items-center justify-between rounded-[10px] bg-no/15 px-3 text-sm font-bold text-no-text"
            >
              <span>{t('No')}</span>
              <span className="tabular-nums">{100 - (yes ?? 0)}%</span>
            </Link>
          </div>
          <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular-nums">
            <span>{t('{amount} pool', { amount: formatMoney(market.totalMinor, market.currency) })}</span>
            {market.closesAt ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{t('closes {when}', { when: formatCloseLabel(market.closesAt, locale, now) })}</span>
              </>
            ) : null}
          </p>
        </>
      ) : (
        <p className="rounded-[10px] border border-dashed border-muted-foreground/40 px-3 py-2.5 text-xs text-muted-foreground">
          {community.leaderType === 'group'
            ? t("Members see this group's questions")
            : community.openMarkets > 0
              ? t('{count} open questions', { count: String(community.openMarkets) })
              : t('Nothing open right now')}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted-foreground">
          {community.level > 0
            ? t('Level {level} · {name}', { level: String(community.level), name: community.levelName })
            : t('New')}
        </span>
        <Link
          href={`/community/${community.slug}`}
          className={cn(
            'inline-flex h-8 items-center rounded-[10px] px-3 text-xs font-bold',
            community.joined
              ? 'bg-secondary text-secondary-foreground'
              : full
                ? 'bg-secondary text-muted-foreground'
                : 'bg-primary text-primary-foreground',
          )}
        >
          {community.joined ? t('Open') : full ? t('Full') : t('Join')}
        </Link>
      </div>
    </article>
  )
}
