import type { SupportedLocale } from '@/i18n/locales'
import { notFound, redirect } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'
import CreateMarketPanel from './_components/CreateMarketPanel'

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
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
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link
        href={`/community/${slug}` as any}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back to {community.name}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Create Market</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a market to {community.name} — pull from the platform or create a custom one with AI assistance.
        </p>
      </div>

      <CreateMarketPanel
        communityId={community.id}
        communitySlug={slug}
        drafts={drafts ?? []}
      />
    </div>
  )
}
