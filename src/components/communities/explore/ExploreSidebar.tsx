'use client'

import { useExtracted, useLocale } from 'next-intl'

import type { ExploreCommunityRow, ExploreMarket, YourCommunity } from '@/lib/db/queries/community-explore'

import { formatCloseLabel, formatMoney, initials } from '@/components/communities/format'
import { Link } from '@/i18n/navigation'

/**
 * The side column on Explore and the category pages: the busiest
 * communities this week, the viewer's own, and what closes today.
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
      <h3 className="text-[13px] font-bold">{title}</h3>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      {ranked.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{t('Nothing staked this week yet.')}</p>
      ) : (
        <ol className="mt-3 grid gap-2">
          {ranked.map((community, index) => (
            <li key={community.id}>
              <Link href={`/community/${community.slug}`} className="flex items-center gap-2.5 text-sm">
                <span className="w-4 text-xs font-bold text-muted-foreground tabular-nums">{index + 1}</span>
                <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-[10px] font-bold text-muted-foreground">
                  {community.iconUrl ? (
                    <img src={community.iconUrl} alt="" className="size-full object-cover" />
                  ) : (
                    initials(community.name)
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{community.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
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

export function YourCommunities({ items, signedIn, now }: { items: YourCommunity[]; signedIn: boolean; now: number }) {
  const t = useExtracted()
  const locale = useLocale()
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label={t('Your communities')}>
      <h3 className="text-[13px] font-bold">{t('Your communities')}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {signedIn ? t('Join one below to see it here.') : t('Sign up, join one, and your stakes show up here.')}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {items.map((item) => (
            <li key={item.slug}>
              <Link href={`/community/${item.slug}`} className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-[10px] font-bold text-muted-foreground">
                  {item.iconUrl ? (
                    <img src={item.iconUrl} alt="" className="size-full object-cover" />
                  ) : (
                    initials(item.name)
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.name}</span>
                  <span className="block text-xs text-muted-foreground">
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

export function ClosingToday({ markets, now }: { markets: ExploreMarket[]; now: number }) {
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
    <section className="rounded-2xl border border-border bg-card p-4" aria-label={t('Closing today')}>
      <h3 className="text-[13px] font-bold">{t('Closing today')}</h3>
      <ul className="mt-3 grid gap-2.5">
        {today.map((market) => (
          <li key={market.id}>
            <Link href={`/community/${market.communitySlug}/market/${market.id}`} className="block">
              <span className="block text-xs text-muted-foreground">
                {market.communityName}, {formatCloseLabel(market.closesAt!, locale, now)}
              </span>
              <span className="line-clamp-2 text-sm font-semibold">{market.title}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t('Yes {pct}%', { pct: String(Math.round(market.yesChance * 100)) })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
