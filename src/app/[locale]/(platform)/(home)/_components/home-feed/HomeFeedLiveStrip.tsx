'use client'

import type { CSSProperties } from 'react'

import { useExtracted } from 'next-intl'

import type { HomeFeedLiveItem } from '@/lib/home-feed-types'

import { useDirectionLabel } from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedPrimitives'
import EventIconImage from '@/components/EventIconImage'
import { Link } from '@/i18n/navigation'
import { resolveLeadingDirection } from '@/lib/home-feed-types'
import { cn } from '@/lib/utils'

interface HomeFeedLiveStripProps {
  items: HomeFeedLiveItem[]
}

/** Seconds per item, so the strip scrolls at a steady reading speed however long it is. */
const SECONDS_PER_ITEM = 5

function LiveStripValue({ item }: { item: HomeFeedLiveItem }) {
  const t = useExtracted()
  const directionLabel = useDirectionLabel()
  const leading = item.isUpDown ? resolveLeadingDirection(item.chance) : null

  if (leading) {
    return (
      <span className={cn('font-bold tabular-nums', leading.direction === 'up' ? 'text-yes' : 'text-no-text')}>
        {leading.chance}% {directionLabel(leading.direction)}
      </span>
    )
  }

  if (item.chance != null && item.leadLabel) {
    return (
      <span className="font-bold tabular-nums">
        {item.leadLabel} {Math.round(item.chance)}%
      </span>
    )
  }

  if (item.chance != null) {
    return (
      <span className="font-bold tabular-nums">
        {t('{chance}% chance', { chance: String(Math.round(item.chance)) })}
      </span>
    )
  }

  return item.isLive ? <span className="font-bold">{t('Live')}</span> : null
}

interface LiveStripItemsProps {
  items: HomeFeedLiveItem[]
  /** The second copy only exists to make the scroll seamless; keep it out of the a11y tree and tab order. */
  duplicate?: boolean
}

function LiveStripItems({ items, duplicate = false }: LiveStripItemsProps) {
  const t = useExtracted()
  const firstTrendingIndex = items.findIndex((item) => !item.isLive)

  return (
    <div
      className={cn('flex shrink-0 items-center gap-6 pr-6', duplicate && 'motion-reduce:hidden')}
      aria-hidden={duplicate || undefined}
    >
      {items.map((item, index) => (
        <div key={item.id} className="flex shrink-0 items-center gap-6">
          {index === firstTrendingIndex && index > 0 ? (
            <span className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
              {t('Trending')}
            </span>
          ) : null}
          <Link
            href={item.href}
            tabIndex={duplicate ? -1 : undefined}
            className="inline-flex items-center gap-2 text-[13px] transition-colors hover:text-primary"
          >
            {item.iconUrl ? (
              <EventIconImage
                src={item.iconUrl}
                alt=""
                sizes="20px"
                containerClassName="size-5 shrink-0 rounded-md bg-muted"
                imageClassName="object-cover"
              />
            ) : null}
            <span className="text-muted-foreground">{item.title}</span>
            <LiveStripValue item={item} />
          </Link>
        </div>
      ))}
    </div>
  )
}

export default function HomeFeedLiveStrip({ items }: HomeFeedLiveStripProps) {
  const t = useExtracted()

  if (items.length === 0) {
    return null
  }

  const hasLiveItems = items.some((item) => item.isLive)
  const label = hasLiveItems ? t('Live now') : t('Trending')
  const scrollStyle = {
    '--home-feed-live-strip-duration': `${Math.max(30, items.length * SECONDS_PER_ITEM)}s`,
  } as CSSProperties

  return (
    <div
      className="group/strip flex min-h-13 items-center gap-4 border-y whitespace-nowrap"
      role="region"
      aria-label={label}
    >
      <span className="inline-flex shrink-0 items-center gap-2 text-[11px] font-bold tracking-[0.1em] text-primary uppercase">
        {hasLiveItems ? <span className="size-1.5 rounded-full bg-no-text" aria-hidden="true" /> : null}
        {label}
      </span>
      <div className="min-w-0 flex-1 overflow-hidden mask-x-from-95% motion-reduce:overflow-x-auto">
        <div
          className="flex w-max animate-[home-feed-live-strip_var(--home-feed-live-strip-duration)_linear_infinite] group-focus-within/strip:paused group-hover/strip:paused motion-reduce:animate-none"
          style={scrollStyle}
        >
          <LiveStripItems items={items} />
          <LiveStripItems items={items} duplicate />
        </div>
      </div>
    </div>
  )
}
