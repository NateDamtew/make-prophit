import type { Metadata } from 'next'
import type { SupportedLocale } from '@/i18n/locales'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'
import CommunityHeader from './_components/CommunityHeader'
import CommunityTabs from './_components/CommunityTabs'

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { data: community } = await CommunityRepository.getBySlug(slug)
  if (!community) {
    return { title: 'Community Not Found' }
  }
  return {
    title: `${community.name} — Community`,
    description: community.description ?? undefined,
  }
}

function CommunityLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-36 animate-pulse rounded-2xl bg-muted/50 sm:h-48" />
      <div className="flex items-end gap-4 px-1">
        <div className="size-16 animate-pulse rounded-2xl bg-muted" />
        <div className="space-y-2 pb-1">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          <div className="h-3 w-64 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="h-96 animate-pulse rounded-2xl border bg-muted/30" />
    </div>
  )
}

async function CommunityContent({ slug }: { slug: string }) {
  const { data: community } = await CommunityRepository.getBySlug(slug)
  if (!community) {
    notFound()
  }

  const user = await UserRepository.getCurrentUser({ minimal: true })
  const { data: memberRole } = user
    ? await CommunityRepository.getMemberRole(community.id, user.id)
    : { data: null }

  const [
    { data: members },
    { data: markets },
    { data: reviews },
  ] = await Promise.all([
    CommunityRepository.listMembers(community.id),
    CommunityRepository.listMarketsWithVoteTallies(community.id),
    CommunityRepository.listReviews(community.id),
  ])

  return (
    <>
      <CommunityHeader
        community={community}
        memberRole={memberRole}
        currentUserId={user?.id ?? null}
      />
      <div className="mt-6">
        <CommunityTabs
          community={community}
          members={members ?? []}
          markets={markets ?? []}
          reviews={reviews ?? []}
          memberRole={memberRole}
          currentUserId={user?.id ?? null}
        />
      </div>
    </>
  )
}

export default async function CommunityDetailPage({
  params,
}: {
  params: Promise<{ locale: string, slug: string }>
}) {
  const { locale, slug } = await params
  setRequestLocale(locale as SupportedLocale)

  if (slug === STATIC_PARAMS_PLACEHOLDER) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Suspense fallback={<CommunityLoadingSkeleton />}>
        <CommunityContent slug={slug} />
      </Suspense>
    </div>
  )
}
