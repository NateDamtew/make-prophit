import { setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'

import type { SupportedLocale } from '@/i18n/locales'

import { isOwnerRole } from '@/lib/communities/roles'
import { CommunityRepository } from '@/lib/db/queries/community'
import { getTrustCard } from '@/lib/db/queries/community-trust'
import { getOwnerDashboard } from '@/lib/db/queries/owner-dashboard'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

import OwnerDashboard from './_components/OwnerDashboard'

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
}

function Loading() {
  return (
    <div className="grid gap-4">
      <div className="h-10 w-64 animate-pulse rounded-sm bg-secondary" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-secondary/50" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-secondary/40" />
    </div>
  )
}

async function DashboardContent({ slug }: { slug: string }) {
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
  const trust = await getTrustCard(community.id).catch(() => null)
  const dashboard = await getOwnerDashboard(community.id, trust)
  return (
    <OwnerDashboard
      community={{
        id: community.id,
        slug: community.slug,
        name: community.name,
        iconUrl: community.icon_url ?? null,
        memberCount: community.member_count,
        jurySize: community.jury_size,
      }}
      trust={trust}
      dashboard={dashboard}
    />
  )
}

export default async function CommunityDashboardPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  setRequestLocale(locale as SupportedLocale)
  if (slug === STATIC_PARAMS_PLACEHOLDER) {
    notFound()
  }
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Suspense fallback={<Loading />}>
        <DashboardContent slug={slug} />
      </Suspense>
    </main>
  )
}
