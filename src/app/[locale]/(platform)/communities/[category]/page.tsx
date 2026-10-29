import type { Metadata } from 'next'

import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import type { SupportedLocale } from '@/i18n/locales'

import { COMMUNITY_CATEGORIES, getCategoryBySlug } from '@/lib/communities/categories'
import { loadExplore } from '@/lib/db/queries/community-explore'
import { UserRepository } from '@/lib/db/queries/user'

import CategoryView from '../_components/CategoryView'

/**
 * One page per community category, driven by the registry in
 * `lib/communities/categories.ts`: add a category there and this route
 * serves it with the default layout until it gets one of its own.
 */
export function generateStaticParams() {
  return COMMUNITY_CATEGORIES.map((category) => ({ category: category.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category: slug } = await params
  const category = getCategoryBySlug(slug)
  if (!category) {
    return { title: 'Communities' }
  }
  return { title: `${category.title} — Communities`, description: category.blurbShort }
}

function CategoryLoadingSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 h-9 w-full max-w-md animate-pulse rounded-full bg-secondary" />
      <div className="mb-8 h-24 w-80 animate-pulse rounded-sm bg-secondary" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-52 animate-pulse rounded-2xl bg-secondary/50" />
        ))}
      </div>
    </div>
  )
}

/** Read after the session lookup (cookies), so the page is dynamic by then. */
function requestTimestamp() {
  return Date.now()
}

async function CategoryContent({ slug }: { slug: string }) {
  const category = getCategoryBySlug(slug)
  if (!category) {
    notFound()
  }
  const viewer = await UserRepository.getCurrentUser({ minimal: true })
  const now = requestTimestamp()
  const data = await loadExplore({ userId: viewer?.id ?? null, leaderType: category.leaderType, now: new Date(now) })
  return <CategoryView category={category} data={data} signedIn={Boolean(viewer)} now={now} />
}

export default async function CommunityCategoryPage({
  params,
}: {
  params: Promise<{ locale: string; category: string }>
}) {
  const { locale, category } = await params
  setRequestLocale(locale as SupportedLocale)
  if (!getCategoryBySlug(category)) {
    notFound()
  }
  return (
    <Suspense fallback={<CategoryLoadingSkeleton />}>
      <CategoryContent slug={category} />
    </Suspense>
  )
}
