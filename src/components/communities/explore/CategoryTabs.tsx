'use client'

import { useExtracted } from 'next-intl'

import type { LeaderType } from '@/lib/communities/rules'

import { Link } from '@/i18n/navigation'
import { COMMUNITY_CATEGORIES } from '@/lib/communities/categories'
import { cn } from '@/lib/utils'

/**
 * Explore and one tab per category that has communities (the current
 * page's own category always shows); the category pages share it.
 */
export function CategoryTabs({
  current,
  typeCounts,
}: {
  current: string | null
  typeCounts: Partial<Record<LeaderType, number>>
}) {
  const t = useExtracted()
  const tabs = [
    { slug: null, label: t('All'), href: '/communities' as const },
    ...COMMUNITY_CATEGORIES.filter(
      (category) => category.slug === current || (typeCounts[category.leaderType] ?? 0) > 0,
    ).map((category) => ({
      slug: category.slug,
      label: category.label,
      href: `/communities/${category.slug}` as const,
    })),
  ]
  return (
    <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label={t('Community categories')}>
      {tabs.map((tab) => (
        <Link
          key={tab.slug ?? 'all'}
          href={tab.href}
          aria-current={tab.slug === current ? 'page' : undefined}
          className={cn(
            'h-9 shrink-0 rounded-full px-3.5 text-sm/9 font-semibold transition-colors',
            tab.slug === current
              ? 'bg-foreground text-background'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
