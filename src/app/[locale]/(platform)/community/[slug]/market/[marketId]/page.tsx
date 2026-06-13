import type { Metadata } from 'next'
import type { SupportedLocale } from '@/i18n/locales'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { CommunityMarketEmbedButton } from '@/components/community-engagement/EmbedCodeButtonWrapper'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'
import CommunityMarketDetail from './_components/CommunityMarketDetail'

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER, marketId: STATIC_PARAMS_PLACEHOLDER }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ marketId: string, slug: string }>
}): Promise<Metadata> {
  const { marketId } = await params
  const { data } = await CommunityRepository.getMarketWithCommunity(marketId)
  if (!data) {
    return { title: 'Market not found' }
  }
  return {
    title: `${data.market.title} — ${data.community.name}`,
    description: data.market.description ?? undefined,
  }
}

export default async function CommunityMarketDetailPage({
  params,
}: {
  params: Promise<{ locale: string, slug: string, marketId: string }>
}) {
  const { locale, slug, marketId } = await params
  setRequestLocale(locale as SupportedLocale)

  if (slug === STATIC_PARAMS_PLACEHOLDER || marketId === STATIC_PARAMS_PLACEHOLDER) {
    notFound()
  }

  const { data } = await CommunityRepository.getMarketWithCommunity(marketId)
  if (!data || data.community.slug.toLowerCase() !== slug.toLowerCase()) {
    notFound()
  }

  const user = await UserRepository.getCurrentUser({ minimal: true })
  const { data: memberRole } = user
    ? await CommunityRepository.getMemberRole(data.community.id, user.id)
    : { data: null }

  const { data: votes } = await CommunityRepository.getVotes(marketId)

  // The Embed button is only useful for actively-trading markets, and only
  // community admins / super-admins should ever see it (it generates iframes
  // any reader could grab from the network tab otherwise).
  const canManageEmbed
    = (memberRole === 'admin' || (user as any)?.is_admin === true)
      && data.market.status === 'active'
  const embedSlot = canManageEmbed
    ? <CommunityMarketEmbedButton communitySlug={slug} marketId={marketId} />
    : null

  return (
    <CommunityMarketDetail
      market={data.market}
      community={data.community}
      votes={votes ?? []}
      memberRole={memberRole}
      currentUserId={user?.id ?? null}
      embedSlot={embedSlot}
    />
  )
}
