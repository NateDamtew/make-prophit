'use client'

import { useExtracted, useLocale } from 'next-intl'

import type { ExploreCommunityRow, ExploreMarket, YourCommunity } from '@/lib/db/queries/community-explore'

import { formatCloseLabel, formatMoney, initials } from '@/components/communities/format'
import { Link } from '@/i18n/navigation'

/**
 * The smaller blocks on Explore and the category pages: who is busiest
 * this week, what is live, the viewer's own communities, what closes
 * today.
 */

export function BusiestList({
  communities,
  title,
  subtitle,
}: {
  communities: ExploreCommunityRow[]
  title: string
  subtitle: string
}) {
  const t = useExtracted()
  const ranked = [...communities]
    .filter((community) => BigInt(community.staked7dMinor) > 0n)
    .sort((a, b) => (BigInt(b.staked7dMinor) > BigInt(a.staked7dMinor) ? 1 : -1))
    .slice(0, 5)
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label={title}>
      <h3 className="text-[16px] font-bold">{title}</h3>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      {ranked.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{t('Nothing staked this week yet.')}</p>
      ) : (
        <ol className="mt-3 grid gap-2.5">
          {ranked.map((community, index) => (
            <li key={community.id}>
              <Link href={`/community/${community.slug}`} className="flex items-center gap-2.5 text-sm tabular-nums">
                <span className="w-3.5 text-xs text-muted-foreground">{index + 1}</span>
                <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary text-[9px] font-extrabold text-muted-foreground">
                  {community.iconUrl ? (
                    <img src={community.iconUrl} alt="" className="size-full object-cover" />
                  ) : (
                    initials(community.name)
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{community.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatMoney(community.staked7dMinor, community.currency)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** The one-line promise, then every live question with its odds. */
export function LiveTicker({ markets }: { markets: ExploreMarket[] }) {
  const t = useExtracted()
  const live = markets.slice(0, 6)
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label={t('Live now')}>
      <p className="text-[13px]/relaxed text-muted-foreground">
        {t('Every community names who decides its results. Payouts wait 24 hours so anyone who staked can appeal.')}
      </p>
      {live.length > 0 ? (
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {live.map((market, index) => (
            <li key={market.id} className="flex items-center gap-3 py-2.5 text-[13px]">
              {index === 0 ? <span className="shrink-0 font-bold">{t('Live now')}</span> : null}
              <Link
                href={`/community/${market.communitySlug}/market/${market.id}`}
                className="min-w-0 flex-1 truncate text-foreground/80 hover:text-foreground"
              >
                {market.title}
              </Link>
              <strong className="shrink-0 text-yes tabular-nums">
                {t('Yes {pct}%', { pct: String(Math.round(market.yesChance * 100)) })}
              </strong>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

export function YourCommunities({ items, signedIn, now }: { items: YourCommunity[]; signedIn: boolean; now: number }) {
  const t = useExtracted()
  const locale = useLocale()
  return (
    <section className="flex flex-col gap-3" aria-label={t('Your communities')}>
      <h2 className="text-[17px] font-bold">{t('Your communities')}</h2>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-muted-foreground/40 px-4 py-3 text-[13px] text-muted-foreground">
          {signedIn ? t('Join one below to see it here') : t('Sign up, join one, and your stakes show up here')}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.slug}>
              <Link
                href={`/community/${item.slug}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-foreground/30"
              >
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-secondary text-[13px] font-extrabold text-muted-foreground">
                  {item.iconUrl ? (
                    <img src={item.iconUrl} alt="" className="size-full object-cover" />
                  ) : (
                    initials(item.name)
                  )}
                </span>
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
            </li>
          ))}
        </ul>
      )}
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
    .slice(0, 6)
  if (today.length === 0) {
    return null
  }
  return (
    <section className={className} aria-label={t('Closing today')}>
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-[16px] font-bold">{t('Closing today')}</h3>
        <ul className="mt-3 grid gap-3">
          {today.map((market) => (
            <li key={market.id}>
              <Link href={`/community/${market.communitySlug}/market/${market.id}`} className="block">
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {market.communityName}, {formatCloseLabel(market.closesAt!, locale, now)}
                </span>
                <span className="line-clamp-2 text-sm font-semibold">{market.title}</span>
                <span className="text-xs font-semibold text-yes tabular-nums">
                  {t('Yes {pct}%', { pct: String(Math.round(market.yesChance * 100)) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
