'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Plus, Users, Crown, Gavel, Star, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CommunityListItem {
  id: string
  slug: string
  name: string
  description: string | null
  icon_url: string | null
  type: string
  member_count: number
  market_count: number
  average_rating: string | null
  review_count: number
  role: string
  joined_at: string
}

async function fetchProfileCommunities(userId: string): Promise<CommunityListItem[]> {
  const res = await fetch(`/api/profile/communities?userId=${encodeURIComponent(userId)}`)
  if (!res.ok) {
    return []
  }
  return res.json()
}

function CommunityRow({ community }: { community: CommunityListItem }) {
  const rating = Number(community.average_rating ?? 0)
  return (
    <Link
      href={`/community/${community.slug}` as any}
      className="group flex items-center gap-3 rounded-xl border p-3 transition-all hover:border-primary/30 hover:bg-muted/30"
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl">
        {community.icon_url
          ? <img src={community.icon_url} alt="" className="size-11 rounded-xl object-cover" />
          : '🏛️'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium transition-colors group-hover:text-primary">
            {community.name}
          </p>
          <span className={cn(
            'shrink-0 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
            community.role === 'admin' && 'bg-primary/10 text-primary',
            community.role === 'juror' && 'bg-amber-500/10 text-amber-600',
            community.role === 'member' && 'bg-muted text-muted-foreground',
          )}
          >
            {community.role === 'admin' && <Crown className="size-2.5" />}
            {community.role === 'juror' && <Gavel className="size-2.5" />}
            {community.role}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="size-3" />
            {community.member_count}
          </span>
          <span className="flex items-center gap-1">
            <TrendingUp className="size-3" />
            {community.market_count}
          </span>
          {community.review_count > 0 && (
            <span className="flex items-center gap-1">
              <Star className="size-3 fill-amber-400 text-amber-400" />
              {rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function PublicCommunitiesList({ userId }: { userId: string | null }) {
  const { data: communities, isPending } = useQuery({
    queryKey: ['profile-communities', userId],
    queryFn: () => userId ? fetchProfileCommunities(userId) : Promise.resolve([]),
    enabled: !!userId,
  })

  if (!userId) {
    return (
      <div className="px-4 py-12 text-center sm:px-6">
        <Users className="mx-auto mb-3 size-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          This user hasn&apos;t set up a profile yet.
        </p>
      </div>
    )
  }

  if (isPending) {
    return (
      <div className="space-y-3 px-4 sm:px-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
            <div className="size-11 animate-pulse rounded-xl bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3 px-4 sm:px-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {communities?.length === 0
            ? 'Not a member of any communities yet'
            : `${communities?.length ?? 0} ${communities?.length === 1 ? 'community' : 'communities'}`}
        </p>
        <Button size="sm" variant="outline" asChild>
          <Link href={'/communities' as any}>
            <Plus className="mr-1 size-3.5" />
            Explore
          </Link>
        </Button>
      </div>

      {communities && communities.length > 0
        ? (
            <div className="space-y-2">
              {communities.map(c => <CommunityRow key={c.id} community={c} />)}
            </div>
          )
        : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12">
              <Users className="size-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No communities yet</p>
              <Button size="sm" variant="outline" asChild>
                <Link href={'/communities' as any}>
                  Browse Communities
                </Link>
              </Button>
            </div>
          )}
    </div>
  )
}
