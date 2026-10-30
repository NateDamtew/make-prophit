'use client'

import { ChevronRightIcon, PlusIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'

import type { ExploreCommunityRow, ExploreMarket, YourCommunity } from '@/lib/db/queries/community-explore'

import { HomeFeedSectionHeading } from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedPrimitives'
import { CommunityTile } from '@/components/communities/explore/CommunityTile'
import { formatCloseLabel, formatMoney } from '@/components/communities/format'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * The panels around the Explore feed, in the Trending page's panel style:
 * who is busiest this week (beside the hero), the viewer's own
 * communities, what closes today and the call to start a community.
 */

const EXPLORE_PANEL_CLASS = 'rounded-2xl border bg-card p-5 text-card-foreground'

/** On phones a row of cards scrolls sideways; from `sm` up it is a grid. */
export const EXPLORE_ROW_CLASS =
  '-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0'
export const EXPLORE_ROW_ITEM_CLASS = 'w-[260px] shrink-0 snap-start sm:w-auto'

const YOUR_COMMUNITIES_SLOTS = 3

export function BusiestList({
  communities,
  title,
  subtitle,
  note,
}: {
  communities: ExploreCommunityRow[]
  title: string
  subtitle: string
  note?: string
}) {
  const t = useExtracted()
  const ranked = [...communities]
    .filter((community) => BigInt(community.staked7dMinor) > 0n)
    .sort((a, b) => (BigInt(b.staked7dMinor) > BigInt(a.staked7dMinor) ? 1 : -1))
    .slice(0, 5)
  return (
    <section className={cn(EXPLORE_PANEL_CLASS, 'flex w-full flex-col')} aria-label={title}>
      <h2 className="text-lg leading-6 font-bold tracking-tight">{title}</h2>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      {ranked.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('Nothing staked this week yet.')}</p>
      ) : (
        <ol className="m-0 mt-1 flex list-none flex-col p-0">
          {ranked.map((community, index) => (
            <li
              key={community.id}
              className={cn('flex items-center gap-3 py-3', index < ranked.length - 1 && 'border-b')}
            >
              <span className="w-3.5 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
              <CommunityTile
                name={community.name}
                iconUrl={community.iconUrl}
                accent={community.accent}
                className="size-6 rounded-md text-[9px]"
              />
              <Link
                href={`/community/${community.slug}`}
                className="min-w-0 flex-1 truncate text-[13px] leading-[18px] font-semibold hover:text-primary"
              >
                {community.name}
              </Link>
              <span className="text-[13px] text-muted-foreground tabular-nums">
                {formatMoney(community.staked7dMinor, community.currency)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {note ? <p className="mt-auto pt-4 text-[13px] leading-[18px] text-muted-foreground">{note}</p> : null}
    </section>
  )
}

export function YourCommunities({ items, signedIn, now }: { items: YourCommunity[]; signedIn: boolean; now: number }) {
  const t = useExtracted()
  const locale = useLocale()
  const shown = items.slice(0, YOUR_COMMUNITIES_SLOTS)
  const fillers = Math.max(0, YOUR_COMMUNITIES_SLOTS - shown.length)
  return (
    <section aria-labelledby="explore-your-communities">
      <div className="mb-4 flex items-center justify-between gap-3">
        <HomeFeedSectionHeading id="explore-your-communities" href={signedIn ? '/me/stakes' : undefined}>
          {t('Your communities')}
        </HomeFeedSectionHeading>
        {items.length > YOUR_COMMUNITIES_SLOTS ? (
          <Link href="/me/stakes" className="text-[13px] font-semibold hover:text-primary">
            {t('See all')}
          </Link>
        ) : null}
      </div>
      <div className={EXPLORE_ROW_CLASS}>
        {shown.map((item) => (
          <Link
            key={item.slug}
            href={`/community/${item.slug}`}
            className={cn(
              EXPLORE_ROW_ITEM_CLASS,
              'flex items-center gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-foreground/25',
            )}
          >
            <CommunityTile name={item.name} iconUrl={item.iconUrl} className="size-10" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{item.name}</span>
              <span className="block truncate text-xs text-muted-foreground tabular-nums">
                {item.nextCloseAt
                  ? t('Your {amount} closes {when}', {
                      amount: formatMoney(item.stakedMinor, item.currency),
                      when: formatCloseLabel(item.nextCloseAt, locale, now),
                    })
                  : t('{count} open stakes', { count: String(item.openStakes) })}
              </span>
            </span>
          </Link>
        ))}
        {Array.from({ length: fillers }).map((_, index) => (
          <p
            key={`filler-${index}`}
            className={cn(
              EXPLORE_ROW_ITEM_CLASS,
              'flex items-center gap-3 rounded-2xl border border-dashed border-muted-foreground/40 p-3 text-[13px] text-muted-foreground',
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-muted-foreground/40">
              <PlusIcon className="size-4" aria-hidden="true" />
            </span>
            {index === 0 && shown.length === 0 && !signedIn
              ? t('Sign up, join one, and it shows up here')
              : t('Join one below to see it here')}
          </p>
        ))}
      </div>
    </section>
  )
}

export function ClosingToday({
  markets,
  now,
  className,
}: {
  markets: ExploreMarket[]
  now: number
  className?: string
}) {
  const t = useExtracted()
  const locale = useLocale()
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const today = markets
    .filter((market) => market.closesAt && new Date(market.closesAt).getTime() <= end.getTime())
    .sort((a, b) => (a.closesAt ?? '').localeCompare(b.closesAt ?? ''))
    .slice(0, 3)
  if (today.length === 0) {
    return null
  }
  return (
    <section className={cn(EXPLORE_PANEL_CLASS, className)} aria-label={t('Closing today')}>
      <h2 className="text-lg leading-6 font-bold tracking-tight">{t('Closing today')}</h2>
      <ol className="m-0 mt-1 flex list-none flex-col p-0">
        {today.map((market, index) => {
          const lead = market.outcomes?.[0]
          return (
            <li key={market.id} className={cn('flex flex-col gap-1 py-3', index < today.length - 1 && 'border-b')}>
              <span className="text-xs text-muted-foreground tabular-nums">
                {market.communityName}, {formatCloseLabel(market.closesAt!, locale, now)}
              </span>
              <Link
                href={`/community/${market.communitySlug}/market/${market.id}`}
                className="text-sm leading-5 font-semibold hover:text-primary"
              >
                {market.title}
              </Link>
              {lead ? (
                <span className="text-xs font-semibold tabular-nums">
                  {lead.label} {Math.round(lead.chance * 100)}%
                </span>
              ) : market.yesChance >= 0.5 ? (
                <span className="text-xs font-semibold text-yes tabular-nums">
                  {t('Yes {pct}%', { pct: String(Math.round(market.yesChance * 100)) })}
                </span>
              ) : (
                <span className="text-xs font-semibold text-no-text tabular-nums">
                  {t('No {pct}%', { pct: String(Math.round((1 - market.yesChance) * 100)) })}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export function LeadPanel({ title, body, action }: { title: string; body: string; action: string }) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3.5 rounded-2xl border border-primary/25 bg-card p-5 text-card-foreground shadow-[0_0_60px_-10px_var(--home-feed-glow)]"
    >
      <h2 className="m-0 text-lg leading-6 font-bold tracking-tight">{title}</h2>
      <p className="m-0 text-[13px] leading-[18px] text-muted-foreground">{body}</p>
      <Link
        href="/communities/apply"
        className="flex h-11 items-center justify-center gap-1 rounded-[10px] bg-primary font-bold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {action}
        <ChevronRightIcon className="size-4" aria-hidden="true" />
      </Link>
    </section>
  )
}
