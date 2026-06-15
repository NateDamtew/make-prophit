'use client'

import {
  Activity,
  Award,
  Clock,
  Globe,
  Lock,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
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

type Sort = 'popular' | 'trending' | 'newest' | 'top-rated' | 'most-active'

const FILTERS: { id: Sort, label: string, icon: React.ElementType }[] = [
  { id: 'trending', label: 'Trending', icon: Activity },
  { id: 'popular', label: 'Popular', icon: TrendingUp },
  { id: 'newest', label: 'Newest', icon: Sparkles },
  { id: 'top-rated', label: 'Top Rated', icon: Award },
]

function FeaturedMarketCard({ market }: { market: FeaturedMarket }) {
  const href = `/community/${market.community_slug}` as const

  return (
    <Link href={href as any} className="block w-80 shrink-0">
      <Card
        className={cn(`
          group flex h-45 flex-col overflow-hidden rounded-xl shadow-md shadow-black/4 transition-all
          hover:-translate-y-0.5 hover:shadow-black/8
          dark:hover:bg-secondary
        `)}
      >
        <CardContent className="flex h-full flex-col p-3 md:pb-1">
          <div className="mb-3 flex items-start gap-2 pr-2">
            <div className="
              flex size-10 shrink-0 items-center justify-center self-start rounded-sm bg-primary/10 text-base
            "
            >
              {market.community_icon
                ? <img src={market.community_icon} alt="" className="size-full rounded-sm object-cover" />
                : '🏛️'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                {market.community_name}
              </p>
              <h3 className="
                line-clamp-2 w-full text-sm/5 font-semibold underline-offset-2 transition-colors duration-200
                group-hover:text-foreground group-hover:underline
              "
              >
                {market.title}
              </h3>
            </div>
          </div>

          {/*
            Honest pre-launch state: rather than fake a 50/50 chance ring,
            surface the real status until live trading is wired through Kuest.
          */}
          <div className="
            mt-auto mb-2 flex items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-3
            py-2
          "
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
              </span>
              Trading opens soon
            </span>
          </div>

          {/* FOOTER */}
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-2 animate-ping rounded-full bg-amber-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
              </span>
              <span className="leading-none font-medium text-amber-600 uppercase">
                Live
              </span>
            </span>
            {market.resolution_date && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {new Date(market.resolution_date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function CommunityCard({ community }: { community: Community }) {
  const rating = Number(community.average_rating ?? 0)

  return (
    <Link
      href={`/community/${community.slug}` as any}
      className="
        group block overflow-hidden rounded-2xl border bg-card transition-all
        hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5
      "
    >
      {/* Banner accent */}
      <div className="relative h-16 overflow-hidden bg-linear-to-br from-primary/20 via-primary/10 to-background">
        {community.banner_url
          ? <img src={community.banner_url} alt="" className="size-full object-cover" />
          : null}
        {/* Type pill in top-right */}
        <div className="absolute top-3 right-3">
          <span className="
            flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-2xs font-medium tracking-wide
            text-foreground uppercase backdrop-blur-sm
          "
          >
            {community.type === 'private'
              ? <Lock className="size-2.5" />
              : <Globe className="size-2.5" />}
            {community.type}
          </span>
        </div>
      </div>

      <div className="-mt-6 px-5 pb-5">
        {/* Icon overlapping banner */}
        <div className="mb-3 flex items-end gap-3">
          <div className="
            flex size-12 shrink-0 items-center justify-center rounded-2xl border-4 border-background bg-card text-xl
            shadow-sm
          "
          >
            {community.icon_url
              ? <img src={community.icon_url} alt={community.name} className="size-full rounded-xl object-cover" />
              : '🏛️'}
          </div>
        </div>

        <h3 className="truncate text-base font-semibold transition-colors group-hover:text-primary">
          {community.name}
        </h3>
        {community.description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {community.description}
          </p>
        )}

        {/* Stats */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="size-3" />
            <strong className="text-foreground">{community.member_count}</strong>
            <span>{community.member_count === 1 ? 'member' : 'members'}</span>
          </span>
          <span className="flex items-center gap-1">
            <TrendingUp className="size-3" />
            <strong className="text-foreground">{community.market_count}</strong>
            <span>{community.market_count === 1 ? 'market' : 'markets'}</span>
          </span>
          {community.review_count > 0 && (
            <span className="flex items-center gap-1">
              <Star className="size-3 fill-amber-400 text-amber-400" />
              <strong className="text-foreground">{rating.toFixed(1)}</strong>
              <span>
                (
                {community.review_count}
                )
              </span>
            </span>
          )}
        </div>

        {community.creator_username && (
          <div className="mt-3 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
            <span>by</span>
            <span className="font-medium text-foreground">
              @
              {community.creator_username}
            </span>
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-2xs font-medium">
              Jury size:
              {' '}
              {community.jury_size}
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}

interface CategoryFacet {
  slug: string
  community_count: number
  market_count: number
}

interface Props {
  initialCommunities: Community[]
  featuredMarkets: FeaturedMarket[]
  /** IDs of communities the viewer has already joined. */
  joinedCommunityIds?: string[]
  /** Phase 3 — communities sorted by last-7-day activity. */
  trendingCommunities?: Community[]
  /** Phase 3 — category facets from community_markets.main_category_slug. */
  categories?: CategoryFacet[]
}

export default function CommunitiesBrowse({
  initialCommunities,
  featuredMarkets,
  joinedCommunityIds = [],
  trendingCommunities = [],
  categories = [],
}: Props) {
  const [filter, setFilter] = useState<Sort>('popular')
  const [search, setSearch] = useState('')
  const [onlyJoined, setOnlyJoined] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const joinedSet = useMemo(() => new Set(joinedCommunityIds), [joinedCommunityIds])

  const filteredCommunities = useMemo(() => {
    // Trending uses the server-ranked list; everything else uses the default list.
    let result = filter === 'trending'
      ? [...trendingCommunities]
      : [...initialCommunities]

    if (onlyJoined) {
      result = result.filter(c => joinedSet.has(c.id))
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(q)
        || c.description?.toLowerCase().includes(q),
      )
    }

    // Category filter is applied as an extra constraint on whichever list
    // we ended up with — for now we use the activeCategory client-side
    // against the (already joined) main_category_slug field on the community.
    // Since the community list itself doesn't carry per-market category data,
    // we currently use the trending/popular source-of-truth as filtered server-
    // side via listByCategory for v2; the client-side fallback simply highlights.
    // (See task #53.) No-op here keeps the chip selection lossless.

    if (filter === 'trending') {
      // Order preserved from server (engagement-ranked).
    }
    else if (filter === 'newest') {
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
  }, [initialCommunities, trendingCommunities, search, filter, onlyJoined, joinedSet])

  const hasJoinedAny = joinedCommunityIds.length > 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Featured markets carousel */}
      {featuredMarkets.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Featured Markets
            </h2>
            <span className="text-xs text-muted-foreground">
              From community-governed markets
            </span>
          </div>
          <div className="
            -mx-4 flex scrollbar-none gap-3 overflow-x-auto px-4 pb-2 [-ms-overflow-style:none]
            sm:-mx-6 sm:px-6
            [&::-webkit-scrollbar]:hidden
          "
          >
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
              const isActive = filter === f.id && !onlyJoined
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setFilter(f.id)
                    setOnlyJoined(false)
                  }}
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
            {hasJoinedAny && (
              <button
                type="button"
                onClick={() => setOnlyJoined(v => !v)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                  onlyJoined
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Users className="size-4" />
                Joined by you
                <span className="ml-1 rounded-full bg-muted px-1.5 text-2xs font-medium">
                  {joinedCommunityIds.length}
                </span>
              </button>
            )}
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
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search communities..."
                className="pl-9"
              />
            </div>
          </div>

          {/* Category facets — visual taxonomy of what's being predicted on the platform */}
          {categories.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  !activeCategory ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                All
              </button>
              {categories.map(c => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setActiveCategory(activeCategory === c.slug ? null : c.slug)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    activeCategory === c.slug ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                  title={`${c.community_count} ${c.community_count === 1 ? 'community' : 'communities'} · ${c.market_count} markets`}
                >
                  <span className="capitalize">{c.slug.replace(/-/g, ' ')}</span>
                  <span className="text-2xs opacity-70">{c.market_count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Grid */}
          {filteredCommunities.length === 0
            ? (
                <div className="
                  flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed py-24 text-center
                "
                >
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
