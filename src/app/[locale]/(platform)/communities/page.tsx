import type { SupportedLocale } from '@/i18n/locales'
import { setRequestLocale } from 'next-intl/server'
import { CommunityRepository } from '@/lib/db/queries/community'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'
import CommunitiesBrowse from './_components/CommunitiesBrowse'

export async function generateStaticParams() {
  return [{ locale: STATIC_PARAMS_PLACEHOLDER }]
}

export default async function CommunitiesPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale as SupportedLocale)

  const [
    { data: communities },
    { data: featuredMarkets },
  ] = await Promise.all([
    CommunityRepository.listPublic({ limit: 30, sort: 'popular' }),
    CommunityRepository.listFeaturedMarkets(8),
  ])

  return (
    <CommunitiesBrowse
      initialCommunities={communities ?? []}
      featuredMarkets={featuredMarkets ?? []}
    />
  )
}
