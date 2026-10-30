'use client'

import { useExtracted } from 'next-intl'

import type { ExploreCommunityRow } from '@/lib/db/queries/community-explore'

import { RecordBars, recordLabel } from '@/components/communities/explore/RecordBars'
import { initials } from '@/components/communities/format'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * A community on Explore, as the board draws it: tile, name, members;
 * what it is asking right now with Yes / No you can act on (or, for a
 * group, "Members see this group's questions"); then its record, in bars
 * and in words, and Join / Joined / Ask to join.
 */
export function QuestionCard({ community, className }: { community: ExploreCommunityRow; className?: string }) {
  const t = useExtracted()
  const market = community.topMarket
  const yes = market ? Math.round(market.yesChance * 100) : null
  const members = t('{count} members', { count: community.memberCount.toLocaleString('en-US') })
  const meta = community.runByProphit
    ? t('Run by Prophit · {members}', { members })
    : community.level === 0
      ? t('New · {members}', { members })
      : members
  const full = community.joinsPaused || community.memberCount >= community.maxMembers
  const locked = community.leaderType === 'group' && !community.joined
  const marketHref = market ? `/community/${community.slug}/market/${market.id}` : null

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/30',
        className,
      )}
    >
      <Link href={`/community/${community.slug}`} className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-secondary text-[13px] font-extrabold text-muted-foreground">
          {community.iconUrl ? (
            <img src={community.iconUrl} alt="" className="size-full object-cover" />
          ) : (
            initials(community.name)
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[14px]/snug font-bold">
            <span className="truncate">{community.name}</span>
            {community.isVerified ? (
              <span
                className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary"
                aria-label={t('Verified')}
              >
                ✓
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground tabular-nums">{meta}</span>
        </span>
      </Link>

      {market && marketHref && !locked ? (
        <>
          <Link href={marketHref} className="line-clamp-2 min-h-[38px] text-[14px]/snug font-semibold hover:underline">
            {market.title}
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={`${marketHref}?stake=yes`}
              className="flex h-[38px] items-center justify-center gap-1.5 rounded-[10px] bg-yes/15 text-[13px] font-bold text-yes tabular-nums"
            >
              {t('Yes')} {yes}%
            </Link>
            <Link
              href={`${marketHref}?stake=no`}
              className="flex h-[38px] items-center justify-center gap-1.5 rounded-[10px] bg-no/15 text-[13px] font-bold text-no-text tabular-nums"
            >
              {t('No')} {100 - (yes ?? 0)}%
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="line-clamp-2 min-h-[38px] text-[14px]/snug font-semibold text-muted-foreground">
            {locked
              ? t('A private group for {count} members.', { count: community.memberCount.toLocaleString('en-US') })
              : community.openMarkets > 0
                ? t('{count} open questions', { count: String(community.openMarkets) })
                : t('Nothing open right now')}
          </p>
          <p className="flex h-[38px] items-center justify-center rounded-[10px] border border-dashed border-muted-foreground/40 text-xs text-muted-foreground">
            {locked ? t("Members see this group's questions") : t('Join to be first in')}
          </p>
        </>
      )}

      <div className="mt-auto flex items-center gap-2.5 pt-1">
        <RecordBars record={community.record} />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground tabular-nums">
          {recordLabel(community.record)}
        </span>
        <Link
          href={`/community/${community.slug}`}
          className={cn(
            'inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-semibold',
            community.joined
              ? 'text-muted-foreground'
              : full
                ? 'border border-border text-muted-foreground'
                : 'border border-foreground text-foreground',
          )}
        >
          {community.joined ? t('Joined') : full ? t('Full') : locked ? t('Ask to join') : t('Join')}
        </Link>
      </div>
    </article>
  )
}
