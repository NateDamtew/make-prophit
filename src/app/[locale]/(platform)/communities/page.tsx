import type { SupportedLocale } from '@/i18n/locales'
import Link from 'next/link'
import { setRequestLocale } from 'next-intl/server'
import { Users, Star, TrendingUp, Plus } from 'lucide-react'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

export async function generateStaticParams() {
  return [{ locale: STATIC_PARAMS_PLACEHOLDER }]
}

function CommunityCard({ community }: { community: any }) {
  const rating = Number(community.average_rating ?? 0)
  const stars = Math.round(rating)

  return (
    <Link
      href={`/community/${community.slug}` as any}
      className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-md hover:shadow-primary/5"
    >
      <div className="flex items-start gap-3">
        {community.icon_url
          ? (
              <img
                src={community.icon_url}
                alt={community.name}
                className="size-12 rounded-xl object-cover"
              />
            )
          : (
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-xl">
                🏛️
              </div>
            )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold transition-colors group-hover:text-primary">
              {community.name}
            </h3>
            <Badge variant="outline" className="shrink-0 text-xs capitalize">
              {community.type}
            </Badge>
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {community.description ?? 'No description yet.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="size-3.5" />
          {community.member_count}
          {' '}
          members
        </span>
        <span className="flex items-center gap-1">
          <TrendingUp className="size-3.5" />
          {community.market_count}
          {' '}
          markets
        </span>
        {community.review_count > 0 && (
          <span className="flex items-center gap-1">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            {rating.toFixed(1)}
            {' '}
            (
            {community.review_count}
            )
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>By</span>
        <span className="font-medium text-foreground">
          {community.creator_username ? `@${community.creator_username}` : 'Unknown'}
        </span>
        <span>·</span>
        <span>Jury size: {community.jury_size}</span>
      </div>
    </Link>
  )
}

export default async function CommunitiesPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale as SupportedLocale)

  const user = await UserRepository.getCurrentUser({ minimal: true })
  const { data: communities } = await CommunityRepository.listPublic({ limit: 30 })

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Communities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Join community-governed prediction markets with jury-based resolution
          </p>
        </div>
        {user && (
          <Button asChild>
            <Link href={'/communities/new' as any}>
              <Plus className="mr-2 size-4" />
              Create Community
            </Link>
          </Button>
        )}
      </div>

      {/* Stats bar */}
      <div className="mb-8 grid grid-cols-3 gap-4 rounded-2xl border bg-muted/30 p-4">
        <div className="text-center">
          <p className="text-2xl font-bold">{communities?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground">Communities</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">
            {communities?.reduce((acc, c) => acc + c.member_count, 0) ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">Total Members</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">
            {communities?.reduce((acc, c) => acc + c.market_count, 0) ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">Active Markets</p>
        </div>
      </div>

      {/* Communities grid */}
      {!communities || communities.length === 0
        ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed py-24 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                <Users className="size-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold">No communities yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Be the first to create a community
                </p>
              </div>
              {user && (
                <Button asChild>
                  <Link href={'/communities/new' as any}>
                    <Plus className="mr-2 size-4" />
                    Create Community
                  </Link>
                </Button>
              )}
            </div>
          )
        : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {communities.map(community => (
                <CommunityCard key={community.id} community={community} />
              ))}
            </div>
          )}
    </div>
  )
}
