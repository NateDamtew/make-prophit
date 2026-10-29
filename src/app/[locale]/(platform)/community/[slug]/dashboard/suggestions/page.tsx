import { ChevronLeftIcon } from 'lucide-react'
import { setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'

import type { SupportedLocale } from '@/i18n/locales'

import SuggestionsPicker from '@/components/communities/suggestions/SuggestionsPicker'
import { Link } from '@/i18n/navigation'
import { isOwnerRole } from '@/lib/communities/roles'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
}

async function SuggestionsContent({ slug }: { slug: string }) {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    redirect(`/community/${slug}`)
  }
  const { data: community } = await CommunityRepository.getBySlug(slug)
  if (!community) {
    notFound()
  }
  const { data: role } = await CommunityRepository.getMemberRole(community.id, user.id)
  if (!isOwnerRole(role) && !user.is_admin) {
    redirect(`/community/${slug}`)
  }
  return (
    <>
      <Link
        href={`/community/${slug}/dashboard`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" aria-hidden="true" />
        {community.name}
      </Link>
      <div className="mb-6">
        <h1 className="text-[24px]/tight font-bold">Suggested markets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drafts Prophit prepared from the news and fixtures. Add one as written or edit it first; it then goes through
          the usual review.
        </p>
      </div>
      <SuggestionsPicker communityId={community.id} communitySlug={community.slug} />
    </>
  )
}

export default async function SuggestionsPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  setRequestLocale(locale as SupportedLocale)
  if (slug === STATIC_PARAMS_PLACEHOLDER) {
    notFound()
  }
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-secondary/40" />}>
        <SuggestionsContent slug={slug} />
      </Suspense>
    </main>
  )
}
