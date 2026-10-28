'use client'

import { useExtracted } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

import type { CommunityTab } from './community-tabs'

import { COMMUNITY_TABS } from './community-tabs'

/**
 * The tab strip under the header. Tabs are links (`?tab=`), so a tab can be
 * shared and the back button works.
 */

interface CommunityTabNavProps {
  slug: string
  active: CommunityTab
  counts?: Partial<Record<CommunityTab, number>>
}

export default function CommunityTabNav({ slug, active, counts = {} }: CommunityTabNavProps) {
  const t = useExtracted()
  const labels: Record<CommunityTab, string> = {
    markets: t('Markets'),
    activity: t('Activity'),
    members: t('Members'),
    jury: t('Jury'),
    reviews: t('Reviews'),
    about: t('About'),
  }
  return (
    <nav aria-label={t('Community sections')} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {COMMUNITY_TABS.map((tab) => {
          const count = counts[tab]
          const isActive = tab === active
          return (
            <li key={tab}>
              <Link
                href={tab === 'markets' ? `/community/${slug}` : `/community/${slug}?tab=${tab}`}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold transition-colors',
                  isActive
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {labels[tab]}
                {count !== undefined && count > 0 ? (
                  <span className="rounded-full bg-secondary px-1.5 text-[11px] tabular-nums">{count}</span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
