'use client'

import { useExtracted } from 'next-intl'

import type { HomeFeedLiveItem } from '@/lib/home-feed-types'

import { useDirectionLabel } from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedPrimitives'
import { Link } from '@/i18n/navigation'
import { resolveLeadingDirection } from '@/lib/home-feed-types'
import { cn } from '@/lib/utils'

interface HomeFeedLiveStripProps {
  items: HomeFeedLiveItem[]
}

export default function HomeFeedLiveStrip({ items }: HomeFeedLiveStripProps) {
  const t = useExtracted()
  const directionLabel = useDirectionLabel()

  if (items.length === 0) {
    return null
  }

  return (
    <div
      className="flex min-h-13 items-center gap-6 overflow-x-auto border-y whitespace-nowrap"
      role="region"
      aria-label={t('Live now')}
    >
      <span className="inline-flex shrink-0 items-center gap-2 text-[11px] font-bold tracking-[0.1em] text-primary uppercase">
        <span className="size-1.5 rounded-full bg-no-text" aria-hidden="true" />
        {t('Live now')}
      </span>
      {items.map((item) => {
        const leading = item.isUpDown ? resolveLeadingDirection(item.chance) : null

        return (
          <Link
            key={item.id}
            href={item.href}
            className="inline-flex shrink-0 items-center gap-2 text-[13px] transition-colors hover:text-primary"
          >
            <span className="text-muted-foreground">{item.title}</span>
            {leading ? (
              <span className={cn('font-bold tabular-nums', leading.direction === 'up' ? 'text-yes' : 'text-no-text')}>
                {leading.chance}% {directionLabel(leading.direction)}
              </span>
            ) : item.chance != null ? (
              <span className="font-bold tabular-nums">
                {t('{chance}% chance', { chance: String(Math.round(item.chance)) })}
              </span>
            ) : (
              <span className="font-bold">{t('Live')}</span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
