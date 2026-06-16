import type { SupportedLocale } from '@/i18n/locales'
import { ChevronLeft } from 'lucide-react'
import { setRequestLocale } from 'next-intl/server'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'
import CreateMarketPanel from './_components/CreateMarketPanel'

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
}

function NewMarketSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/30" />)}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-muted/30" />
    </div>
  )
}

async function NewMarketContent({ slug }: { slug: string }) {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    redirect(`/community/${slug}` as any)
  }

  const { data: community } = await CommunityRepository.getBySlug(slug)
  if (!community) {
    notFound()
  }

  const { data: memberRole } = await CommunityRepository.getMemberRole(community.id, user.id)
  if (memberRole !== 'admin') {
    redirect(`/community/${slug}` as any)
  }

  const { data: drafts } = await CommunityRepository.listDrafts(community.id)

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href={`/community/${slug}` as any}
        className="
          mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors
          hover:text-foreground
        "
      >
        <ChevronLeft className="size-4" />
        Back to
        {' '}
        {community.name}
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Create a market</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a market to
          {' '}
          {community.name}
          {' '}
          — draft with AI, start from a template, or pull one from the platform.
        </p>
      </div>

      <CreateMarketPanel
        communityId={community.id}
        communitySlug={slug}
        communityName={community.name}
        communityIcon={community.icon_url ?? null}
        drafts={drafts ?? []}
      />
    </div>
  )
}

export default async function NewCommunityMarketPage({
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
    <Suspense fallback={(
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <NewMarketSkeleton />
      </div>
    )}
    >
      <NewMarketContent slug={slug} />
    </Suspense>
  )
}
