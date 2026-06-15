import type { SupportedLocale } from '@/i18n/locales'
import { notFound, redirect } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityThemeRepository } from '@/lib/db/queries/community-theme'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'
import { ThemeEditor } from './_components/ThemeEditor'

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
}

async function ThemeContent({ slug }: { slug: string }) {
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

  const [theme, markets] = await Promise.all([
    CommunityThemeRepository.get(community.id),
    CommunityRepository.listMarkets(community.id),
  ])

  return (
    <ThemeEditor
      communityId={community.id}
      communitySlug={community.slug}
      communityName={community.name}
      communityIconUrl={community.icon_url}
      communityBannerUrl={community.banner_url}
      initial={theme}
      markets={(markets.data ?? []).map(m => ({ id: m.id, title: m.title, status: m.status }))}
    />
  )
}

export default async function CommunityThemePage({
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
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Suspense fallback={<Skeleton className="h-96 rounded-sm" />}>
        <ThemeContent slug={slug} />
      </Suspense>
    </div>
  )
}
