import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

import type { SupportedLocale } from '@/i18n/locales'

import { loadExplore } from '@/lib/db/queries/community-explore'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

import ExploreHome from './_components/ExploreHome'

export async function generateStaticParams() {
  return [{ locale: STATIC_PARAMS_PLACEHOLDER }]
}

function CommunitiesLoadingSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 h-10 w-64 animate-pulse rounded-sm bg-secondary" />
      <div className="mb-8 h-56 animate-pulse rounded-2xl bg-secondary/50" />
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

async function CommunitiesContent() {
  const viewer = await UserRepository.getCurrentUser({ minimal: true })
  const now = requestTimestamp()
  const data = await loadExplore({ userId: viewer?.id ?? null, now: new Date(now) })
  return <ExploreHome data={data} signedIn={Boolean(viewer)} now={now} />
}

export default async function CommunitiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale as SupportedLocale)

  return (
    <Suspense fallback={<CommunitiesLoadingSkeleton />}>
      <CommunitiesContent />
    </Suspense>
  )
}
