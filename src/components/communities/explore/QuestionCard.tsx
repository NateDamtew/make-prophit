'use client'

import { useExtracted } from 'next-intl'

import type { ExploreCommunityRow, ExploreMarket } from '@/lib/db/queries/community-explore'

import {
  HOME_FEED_CARD_CLASS,
  HomeFeedOutcomeLink,
} from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedPrimitives'
import { CommunityTile } from '@/components/communities/explore/CommunityTile'
import { RecordBars, recordLabel } from '@/components/communities/explore/RecordBars'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/** Below this many stakers the odds are not shown; the buttons just say Yes and No. */
export const LOW_STAKES_BELOW = 5

export function oddsLabels(market: Pick<ExploreMarket, 'yesChance' | 'stakeCount'>, yesWord: string, noWord: string) {
  const yes = Math.round(market.yesChance * 100)
  if (market.stakeCount < LOW_STAKES_BELOW) {
    return { yes: yesWord, no: noWord }
  }
  return { yes: `${yesWord} ${yes}%`, no: `${noWord} ${100 - yes}%` }
}

/** The top two outcomes of a multi-outcome question, with thin bars. */
export function OutcomeRows({ outcomes }: { outcomes: Array<{ label: string; chance: number }> }) {
  return (
    <ul className="flex flex-col gap-1.5 text-[13px]">
      {outcomes.slice(0, 2).map((outcome) => (
        <li key={outcome.label} className="flex flex-col gap-1">
          <span className="flex items-center justify-between gap-3">
            <span className="truncate">{outcome.label}</span>
            <strong className="tabular-nums">{Math.round(outcome.chance * 100)}%</strong>
          </span>
          <span className="h-[3px] rounded-full bg-muted" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-foreground"
              style={{ width: `${Math.round(outcome.chance * 100)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * A community on Explore: tile in its accent colour, name, Verified tick,
 * type or level and members; its top question with Yes / No and their
 * odds (plain Yes / No under five stakers; two outcomes with bars for a
 * multi-outcome question; a dashed note for a private group); then its
 * record in bars and words, and Join / Joined / Ask to join.
 */
export function QuestionCard({ community, className }: { community: ExploreCommunityRow; className?: string }) {
  const t = useExtracted()
  const market = community.topMarket
  const members = t('{count} members', { count: community.memberCount.toLocaleString('en-US') })
  const meta = community.runByProphit
    ? t('Run by Prophit · {members}', { members })
    : community.level === 0
      ? t('New · {members}', { members })
      : members
  const full = community.joinsPaused || community.memberCount >= community.maxMembers
  const locked = community.leaderType === 'group' && !community.joined
  const marketHref = market ? `/community/${community.slug}/market/${market.id}` : null
  const odds = market ? oddsLabels(market, t('Yes'), t('No')) : null

  return (
    <article className={cn(HOME_FEED_CARD_CLASS, 'gap-3 p-4', className)}>
      <Link href={`/community/${community.slug}`} className="flex items-center gap-3">
        <CommunityTile
          name={community.name}
          iconUrl={community.iconUrl}
          accent={community.accent}
          className="size-10"
        />
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
          <Link
            href={marketHref}
            className="line-clamp-2 min-h-[38px] text-[14px]/snug font-semibold hover:text-primary"
          >
            {market.title}
          </Link>
          {market.outcomes && market.outcomes.length > 0 ? (
            <OutcomeRows outcomes={market.outcomes} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <HomeFeedOutcomeLink
                href={`${marketHref}?stake=yes`}
                tone="yes"
                label={odds!.yes}
                className="h-[38px] tabular-nums"
              />
              <HomeFeedOutcomeLink
                href={`${marketHref}?stake=no`}
                tone="no"
                label={odds!.no}
                className="h-[38px] tabular-nums"
              />
            </div>
          )}
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
            'inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-semibold transition-colors',
            community.joined
              ? 'text-muted-foreground hover:text-foreground'
              : full
                ? 'border text-muted-foreground'
                : 'border border-foreground text-foreground hover:bg-foreground hover:text-background',
          )}
        >
          {community.joined ? t('Joined') : full ? t('Full') : locked ? t('Ask to join') : t('Join')}
        </Link>
      </div>
    </article>
  )
}
