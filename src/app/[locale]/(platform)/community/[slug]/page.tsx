import type { Metadata } from 'next'
import type { SupportedLocale } from '@/i18n/locales'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { CommunityThemeStyle } from '@/components/community-themes/CommunityThemeStyle'
import { WhiteLabelBrandBar } from '@/components/community-themes/WhiteLabelBrandBar'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityIntegrityRepository } from '@/lib/db/queries/community-integrity'
import { CommunityMonetizationRepository } from '@/lib/db/queries/community-monetization'
import { CommunityThemeRepository } from '@/lib/db/queries/community-theme'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'
import CommunityHeader from './_components/CommunityHeader'
import { CommunityPresetSwitch } from './_components/presets/PresetDispatcher'

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { data: community } = await CommunityRepository.getBySlug(slug)
  if (!community) {
    return { title: 'Community Not Found' }
  }
  const ogUrl = `/og/community/${community.slug}`
  return {
    title: `${community.name} — Community`,
    description: community.description ?? undefined,
    openGraph: {
      title: community.name,
      description: community.description ?? undefined,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: community.name }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: community.name,
      description: community.description ?? undefined,
      images: [ogUrl],
    },
  }
}

function CommunityLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-36 animate-pulse rounded-2xl bg-muted/50 sm:h-48" />
      <div className="flex items-end gap-4 px-1">
        <div className="size-16 animate-pulse rounded-2xl bg-muted" />
        <div className="space-y-2 pb-1">
          <div className="h-5 w-40 animate-pulse rounded-sm bg-muted" />
          <div className="h-3 w-64 animate-pulse rounded-sm bg-muted" />
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
    monetization,
    theme,
    whiteLabel,
  ] = await Promise.all([
    CommunityRepository.listMembers(community.id),
    CommunityRepository.listMarketsWithVoteTallies(community.id),
    CommunityRepository.listReviews(community.id),
    CommunityMonetizationRepository.getFields(community.id).catch(() => null),
    CommunityThemeRepository.get(community.id),
    CommunityIntegrityRepository.getWhiteLabelFlag(community.id),
  ])

  const isVerified = monetization?.is_verified ?? false
  const communityWithVerified = {
    ...community,
    is_verified: isVerified,
  }
  // White-label only takes effect for verified communities (defense in depth —
  // even if the flag leaks on, an unverified brand can't ride the look).
  const showWhiteLabel = isVerified && whiteLabel

  const themeScopeId = `community-theme-${community.id}`

  return (
    <div id={themeScopeId}>
      <CommunityThemeStyle scopeId={themeScopeId} theme={theme} />
      {showWhiteLabel && (
        <div className="mb-4">
          <WhiteLabelBrandBar
            communityName={community.name}
            communityIcon={community.icon_url ?? null}
          />
        </div>
      )}
      <CommunityHeader
        community={communityWithVerified}
        memberRole={memberRole}
        currentUserId={user?.id ?? null}
      />
      <div className="mt-6">
        <CommunityPresetSwitch
          preset={theme.layout_preset}
          community={community as any}
          members={(members ?? []) as any}
          markets={(markets ?? []) as any}
          reviews={(reviews ?? []) as any}
          memberRole={memberRole}
          currentUserId={user?.id ?? null}
          theme={theme}
        />
      </div>
    </div>
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
    <div className="mx-auto max-w-7xl px-2 py-6 sm:px-4 lg:px-8">
      <Suspense fallback={<CommunityLoadingSkeleton />}>
        <CommunityContent slug={slug} />
      </Suspense>
    </div>
  )
}
