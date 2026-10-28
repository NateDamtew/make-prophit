import { setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'

import type { SupportedLocale } from '@/i18n/locales'

import { IMPORT_MIN_LEVEL } from '@/lib/communities/imports'
import { isOwnerRole } from '@/lib/communities/roles'
import { isCommunityLevel, LEVEL_NAMES } from '@/lib/communities/rules'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

import ImportPicker from './_components/ImportPicker'

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
}

async function ImportContent({ slug }: { slug: string }) {
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
  const level = isCommunityLevel(community.level) ? community.level : 0
  return (
    <ImportPicker
      communityId={community.id}
      communitySlug={community.slug}
      communityName={community.name}
      level={level}
      levelName={LEVEL_NAMES[level]}
      minLevel={IMPORT_MIN_LEVEL}
    />
  )
}

export default async function ImportMarketPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  setRequestLocale(locale as SupportedLocale)
  if (slug === STATIC_PARAMS_PLACEHOLDER) {
    notFound()
  }
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-secondary/40" />}>
        <ImportContent slug={slug} />
      </Suspense>
    </main>
  )
}
