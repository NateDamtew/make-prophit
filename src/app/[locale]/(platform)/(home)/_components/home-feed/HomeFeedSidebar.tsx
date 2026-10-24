'use client'

import type { CSSProperties } from 'react'

import { ChevronRightIcon, NewspaperIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'

import type { HomeFeedRankedMarket } from '@/lib/home-feed-types'

import { HomeFeedSectionHeading } from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedPrimitives'
import { Link } from '@/i18n/navigation'
import { formatVolume } from '@/lib/formatters'
import { cn } from '@/lib/utils'

interface HomeFeedSidebarProps {
  breakingNews: HomeFeedRankedMarket[]
  mostTraded: HomeFeedRankedMarket[]
  telegramUrl: string
}

const PANEL_CLASS = 'rounded-2xl border bg-card p-5 text-card-foreground'

function MostTradedPanel({ items }: { items: HomeFeedRankedMarket[] }) {
  const t = useExtracted()

  if (items.length === 0) {
    return null
  }

  return (
    <section aria-labelledby="home-feed-most-traded" className={PANEL_CLASS}>
      <div className="mb-2">
        <HomeFeedSectionHeading id="home-feed-most-traded" size="panel">
          {t('Most traded')}
        </HomeFeedSectionHeading>
      </div>
      <ol className="m-0 flex list-none flex-col p-0">
        {items.map((item, index) => (
          <li key={item.id} className={cn('flex items-start gap-3 py-3', index < items.length - 1 && 'border-b')}>
            <span className="w-3.5 text-xs leading-5 text-muted-foreground tabular-nums">{index + 1}</span>
            <Link href={item.href} className="flex-1 text-[13px] leading-[18px] font-semibold hover:text-primary">
              {item.title}
            </Link>
            <span className="text-[13px] font-bold tabular-nums">{formatVolume(item.volume)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function BreakingNewsPanel({ items }: { items: HomeFeedRankedMarket[] }) {
  const t = useExtracted()

  return (
    <section aria-labelledby="home-feed-breaking" className={cn(PANEL_CLASS, 'flex flex-col gap-2')}>
      <HomeFeedSectionHeading id="home-feed-breaking" size="panel" href="/new">
        <NewspaperIcon className="size-[18px] text-primary" aria-hidden="true" />
        {t('Breaking news')}
      </HomeFeedSectionHeading>
      {items.length > 0 ? (
        <ol className="m-0 flex list-none flex-col p-0">
          {items.map((item, index) => (
            <li key={item.id} className={cn('flex gap-3 py-3.5', index < items.length - 1 ? 'border-b' : 'pb-1.5')}>
              <span className={cn('w-3 text-sm font-bold', index === 1 ? 'text-primary' : 'text-muted-foreground')}>
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Link href={item.href} className="text-sm leading-5 font-semibold hover:text-primary">
                  {item.title}
                </Link>
                <span className="text-xs font-semibold text-muted-foreground">
                  {item.chance == null ? t('Live') : t('{chance}% chance', { chance: String(item.chance) })}
                  {item.change != null ? (
                    <span className={cn('ml-1.5 tabular-nums', item.change >= 0 ? 'text-yes' : 'text-no-text')}>
                      {item.change >= 0 ? '▲' : '▼'} {Math.abs(item.change)}%
                    </span>
                  ) : null}
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">{t('No market moves to show yet.')}</p>
      )}
      <Link
        href="/new"
        className="mt-2 flex h-12 items-center justify-center gap-1.5 rounded-full border text-sm font-semibold text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
      >
        {t('Explore all markets')}
        <ChevronRightIcon className="size-3.5" aria-hidden="true" />
      </Link>
    </section>
  )
}

function TelegramPanel({ telegramUrl }: { telegramUrl: string }) {
  const t = useExtracted()

  return (
    <section
      aria-labelledby="home-feed-telegram"
      className="flex flex-col gap-3.5 rounded-2xl border border-primary/25 bg-card p-5 text-card-foreground shadow-[0_0_60px_-10px_var(--home-feed-glow)]"
      style={{ '--home-feed-glow': 'color-mix(in oklab, var(--primary) 35%, transparent)' } as CSSProperties}
    >
      <h2 id="home-feed-telegram" className="m-0 text-lg leading-6 font-bold tracking-tight">
        {t('Help shape the future of Prophit')}
      </h2>
      <p className="m-0 text-[13px] leading-[18px] text-muted-foreground">{t('Join our Telegram community today.')}</p>
      <a
        href={telegramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-11 items-center justify-center rounded-[10px] bg-primary font-bold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {t('Join Telegram')}
      </a>
    </section>
  )
}

export default function HomeFeedSidebar({ breakingNews, mostTraded, telegramUrl }: HomeFeedSidebarProps) {
  const t = useExtracted()

  return (
    <aside aria-label={t('Sidebar')} className="flex min-w-0 flex-[1_1_300px] flex-col gap-6 lg:max-w-[340px]">
      <MostTradedPanel items={mostTraded} />
      <BreakingNewsPanel items={breakingNews} />
      <TelegramPanel telegramUrl={telegramUrl} />
    </aside>
  )
}
