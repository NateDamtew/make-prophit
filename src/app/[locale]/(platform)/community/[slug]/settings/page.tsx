import type { SupportedLocale } from '@/i18n/locales'
import { ChevronLeftIcon } from 'lucide-react'
import { setRequestLocale } from 'next-intl/server'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'
import { MembersTab } from '../_components/community-tabs/MembersTab'
import { CommunitySettingsForm } from './_components/CommunitySettingsForm'

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
}

async function SettingsContent({ slug }: { slug: string }) {
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

  const { data: members } = await CommunityRepository.listMembers(community.id)

  return (
    <div className="grid gap-6">
      <header>
        <Link
          href={`/community/${slug}` as any}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
          Back to
          {' '}
          {community.name}
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Community settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your community's identity, jury, and members.
        </p>
      </header>

      <CommunitySettingsForm
        communityId={community.id}
        communitySlug={community.slug}
        initial={{
          name: community.name,
          description: community.description,
          type: community.type,
          jury_size: community.jury_size,
          rules: community.rules,
          terms: community.terms,
          icon_url: community.icon_url,
          banner_url: community.banner_url,
        }}
      />

      <Card className="gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">Members & jury</h2>
          <p className="text-xs text-muted-foreground">
            Click a member's role to promote them to Juror or Admin. Use Invite on the community
            page to add new members.
          </p>
        </div>
        <MembersTab
          community={community as any}
          members={(members ?? []) as any}
          memberRole="admin"
          currentUserId={user.id}
        />
      </Card>
    </div>
  )
}

export default async function CommunitySettingsPage({
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
      <Suspense fallback={<Skeleton className="h-96 rounded-sm" />}>
        <SettingsContent slug={slug} />
      </Suspense>
    </div>
  )
}
