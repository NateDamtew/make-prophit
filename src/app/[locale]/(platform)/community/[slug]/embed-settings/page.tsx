import type { SupportedLocale } from '@/i18n/locales'
import { notFound, redirect } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityEmbedRepository } from '@/lib/db/queries/community-monetization'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'
import { EmbedSettingsForm } from './_components/EmbedSettingsForm'

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
}

async function EmbedSettingsContent({ slug }: { slug: string }) {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    redirect(`/community/${slug}` as any)
  }

  const { data: community } = await CommunityRepository.getBySlug(slug)
  if (!community) {
    notFound()
  }

  const { data: role } = await CommunityRepository.getMemberRole(community.id, user.id)
  if (role !== 'admin' && !user.is_admin) {
    redirect(`/community/${slug}` as any)
  }

  const config = await CommunityEmbedRepository.get(community.id)

  return (
    <EmbedSettingsForm
      communityId={community.id}
      communityName={community.name}
      communitySlug={community.slug}
      initial={config ?? null}
    />
  )
}

function EmbedSettingsSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-8 w-64 rounded-sm" />
      <Skeleton className="h-32 w-full rounded-sm" />
      <Skeleton className="h-48 w-full rounded-sm" />
    </div>
  )
}

export default async function CommunityEmbedSettingsPage({
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
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <Suspense fallback={<EmbedSettingsSkeleton />}>
        <EmbedSettingsContent slug={slug} />
      </Suspense>
    </div>
  )
}
