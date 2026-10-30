'use client'

import { useExtracted, useLocale } from 'next-intl'

import type { ExploreMarket, RecordMark } from '@/lib/db/queries/community-explore'

import { recordSummary } from '@/components/communities/explore/RecordBars'
import { formatCloseLabel, formatMoney, initials } from '@/components/communities/format'
import { Link } from '@/i18n/navigation'
import { getCategoryForLeaderType } from '@/lib/communities/categories'

/**
 * The biggest open question right now, as the board draws it: who is
 * asking, the question, Yes / No you can act on, who decides it and its
 * record, pool and close; on the right the chance in big type and two
 * more live questions as pills.
 */
export function LiveNowHero({
  market,
  record,
  memberCount,
  more,
  now,
  eyebrow,
}: {
  market: ExploreMarket
  record: RecordMark[]
  memberCount: number
  more: ExploreMarket[]
  now: number
  eyebrow?: string
}) {
  const t = useExtracted()
  const locale = useLocale()
  const yes = Math.round(market.yesChance * 100)
  const category = getCategoryForLeaderType(market.leaderType)
  const marketHref = `/community/${market.communitySlug}/market/${market.id}`
  const members = t('{count} members', { count: memberCount.toLocaleString('en-US') })

  return (
    <section
      className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-lg ring-1 shadow-primary/10 ring-primary/20 lg:grid-cols-[minmax(0,1fr)_240px] lg:p-6"
      aria-label={eyebrow ?? t('Live now')}
    >
      <div className="flex flex-col gap-4">
        <Link href={`/community/${market.communitySlug}`} className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary text-sm font-extrabold text-muted-foreground">
            {market.communityIcon ? (
              <img src={market.communityIcon} alt="" className="size-full object-cover" />
            ) : (
              initials(market.communityName)
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-bold">{market.communityName}</span>
            <span className="block text-xs text-muted-foreground tabular-nums">
              {eyebrow ?? (category ? `${category.countNoun.one} · ${members}` : members)}
            </span>
          </span>
        </Link>
        <p className="text-[18px]/snug font-bold text-primary tabular-nums lg:hidden">
          {yes}% <span className="text-[15px] font-semibold text-foreground">{t('chance')}</span>
        </p>
        <h2 className="text-[20px]/snug font-bold sm:text-[22px]/snug">
          <Link href={marketHref} className="hover:underline">
            {market.title}
          </Link>
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <Link
            href={`${marketHref}?stake=yes`}
            className="flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-yes/15 text-[15px] font-bold text-yes tabular-nums"
          >
            {t('Yes')} {yes}%
          </Link>
          <Link
            href={`${marketHref}?stake=no`}
            className="flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-no/15 text-[15px] font-bold text-no-text tabular-nums"
          >
            {t('No')} {100 - yes}%
          </Link>
        </div>
        <p className="text-xs/relaxed text-muted-foreground">
          {t('Decided by {count} named jurors.', { count: String(market.jurySize) })} {recordSummary(record)}
        </p>
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
          <span>{t('{amount} pool', { amount: formatMoney(market.totalMinor, market.currency) })}</span>
          {market.closesAt ? (
            <span>{t('closes {when}', { when: formatCloseLabel(market.closesAt, locale, now) })}</span>
          ) : null}
        </p>
      </div>
      <div className="hidden flex-col justify-between gap-4 border-border lg:flex lg:border-l lg:pl-5">
        <p>
          <span className="text-[40px]/none font-extrabold text-primary tabular-nums">{yes}%</span>
          <span className="ml-1.5 text-[15px] font-semibold">{t('chance')}</span>
        </p>
        {more.length > 0 ? (
          <ul className="flex flex-col items-start gap-2">
            {more.map((item) => (
              <li key={item.id} className="max-w-full">
                <Link
                  href={`/community/${item.communitySlug}/market/${item.id}`}
                  className="inline-block max-w-full truncate rounded-full border border-border px-3 text-xs/[30px] font-semibold hover:border-foreground"
                >
                  {item.communityName}: {item.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
