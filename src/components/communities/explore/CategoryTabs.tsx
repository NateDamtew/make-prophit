'use client'

import { useExtracted } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { COMMUNITY_CATEGORIES } from '@/lib/communities/categories'
import { cn } from '@/lib/utils'

/** Explore and one tab per category; the category pages share it. */
export function CategoryTabs({ current }: { current: string | null }) {
  const t = useExtracted()
  const tabs = [
    { slug: null, label: t('All'), href: '/communities' as const },
    ...COMMUNITY_CATEGORIES.map((category) => ({
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
