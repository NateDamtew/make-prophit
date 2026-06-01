'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Users,
  Star,
  TrendingUp,
  Search,
  Sparkles,
  Clock,
  Award,
  Activity,
  Lock,
  Globe,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Community {
  id: string
  slug: string
  name: string
  description: string | null
  icon_url: string | null
  banner_url: string | null
  type: string
  member_count: number
  market_count: number
  average_rating: string | null
  review_count: number
  jury_size: number
  created_at: Date
  creator_username: string | null
  creator_image: string | null
}

interface FeaturedMarket {
  id: string
  title: string
  description: string | null
  resolution_date: Date | null
  status: string
  created_at: Date
  community_id: string
  community_slug: string
  community_name: string
  community_icon: string | null
}

type Sort = 'popular' | 'newest' | 'top-rated' | 'most-active'

const FILTERS: { id: Sort, label: string, icon: React.ElementType }[] = [
  { id: 'popular', label: 'Popular', icon: TrendingUp },
  { id: 'newest', label: 'Newest', icon: Sparkles },
  { id: 'top-rated', label: 'Top Rated', icon: Award },
  { id: 'most-active', label: 'Most Active', icon: Activity },
]

function FeaturedMarketCard({ market }: { market: FeaturedMarket }) {
  return (
    <Link
      href={`/community/${market.community_slug}` as any}
      className="group flex w-72 shrink-0 flex-col gap-3 rounded-2xl border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md hover:shadow-primary/5"
    >
      <div className="flex items-center gap-2">
        {market.community_icon
          ? <img src={market.community_icon} alt="" className="size-6 rounded-md object-cover" />
          : (
              <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-xs">
                🏛️
              </div>
            )}
        <span className="truncate text-xs font-medium text-muted-foreground">
          {market.community_name}
        </span>
      </div>

      <p className="line-clamp-3 flex-1 text-sm font-medium leading-snug transition-colors group-hover:text-primary">
        {market.title}
      </p>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3" />
          {market.resolution_date
            ? new Date(market.resolution_date).toLocaleDateString()
            : 'No deadline'}
        </span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
          Live
        </span>
      </div>
    </Link>
  )
}

function CommunityCard({ community }: { community: Community }) {
  const rating = Number(community.average_rating ?? 0)

  return (
    <Link
      href={`/community/${community.slug}` as any}
      className="group flex flex-col gap-4 rounded-2xl border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-md hover:shadow-primary/5"
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
            {community.type === 'private'
              ? <Lock className="size-3 shrink-0 text-muted-foreground" />
              : <Globe className="size-3 shrink-0 text-muted-foreground" />}
          </div>
          {community.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
              {community.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="size-3.5" />
          {community.member_count}
        </span>
        <span className="flex items-center gap-1">
          <TrendingUp className="size-3.5" />
          {community.market_count}
        </span>
        {community.review_count > 0 && (
          <span className="flex items-center gap-1">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            {rating.toFixed(1)}
            <span className="text-xs">
              (
              {community.review_count}
              )
            </span>
          </span>
        )}
      </div>

      {community.creator_username && (
        <div className="flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
          <span>By</span>
          <span className="font-medium text-foreground">
            @
            {community.creator_username}
          </span>
        </div>
      )}
    </Link>
  )
}

interface Props {
  initialCommunities: Community[]
  featuredMarkets: FeaturedMarket[]
}

export default function CommunitiesBrowse({ initialCommunities, featuredMarkets }: Props) {
  const [filter, setFilter] = useState<Sort>('popular')
  const [search, setSearch] = useState('')

  const filteredCommunities = useMemo(() => {
    let result = [...initialCommunities]

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(q)
        || c.description?.toLowerCase().includes(q),
      )
    }

    // Client-side sort
    if (filter === 'newest') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    else if (filter === 'top-rated') {
      result.sort((a, b) => Number(b.average_rating ?? 0) - Number(a.average_rating ?? 0))
    }
    else if (filter === 'most-active') {
      result.sort((a, b) => b.market_count - a.market_count)
    }
    else {
      result.sort((a, b) => b.member_count - a.member_count)
    }

    return result
  }, [initialCommunities, search, filter])

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Featured markets carousel */}
      {featuredMarkets.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Featured Markets
            </h2>
            <span className="text-xs text-muted-foreground">
              From community-governed markets
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {featuredMarkets.map(market => (
              <FeaturedMarketCard key={market.id} market={market} />
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
        {/* Sidebar filters */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <h2 className="mb-3 text-sm font-semibold">Communities</h2>
          <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {FILTERS.map((f) => {
              const Icon = f.icon
              const isActive = filter === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" />
                  {f.label}
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main>
          {/* Header with search */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold">
                {FILTERS.find(f => f.id === filter)?.label}
                {' Communities'}
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {filteredCommunities.length}
                {' '}
                {filteredCommunities.length === 1 ? 'community' : 'communities'}
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search communities..."
                className="pl-9"
              />
            </div>
          </div>

          {/* Grid */}
          {filteredCommunities.length === 0
            ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed py-24 text-center">
                  <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                    <Users className="size-7 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">No communities found</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {search ? 'Try a different search term.' : 'Check back later.'}
                    </p>
                  </div>
                </div>
              )
            : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredCommunities.map(community => (
                    <CommunityCard key={community.id} community={community} />
                  ))}
                </div>
              )}
        </main>
      </div>
    </div>
  )
}
