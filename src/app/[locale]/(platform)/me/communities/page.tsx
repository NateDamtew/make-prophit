import type { SupportedLocale } from '@/i18n/locales'
import { Crown, Gavel, UsersIcon } from 'lucide-react'
import { setRequestLocale } from 'next-intl/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { EmptyState } from '@/components/admin-ui/EmptyState'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { MyCommunitiesRepository } from '@/lib/db/queries/my-communities'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'
import { cn } from '@/lib/utils'

export function generateStaticParams() {
  return [{ locale: STATIC_PARAMS_PLACEHOLDER }]
}

export default async function MyCommunitiesPage({ params }: PageProps<'/[locale]/me/communities'>) {
  const { locale } = await params
  setRequestLocale(locale as SupportedLocale)

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">My Communities</h1>
        <p className="text-sm text-muted-foreground">
          Communities you've joined, started, or moderate.
        </p>
      </div>

      <Suspense fallback={<Loading />}>
        <CommunitiesList />
      </Suspense>
    </main>
  )
}

async function CommunitiesList() {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    redirect('/communities')
  }

  const items = await MyCommunitiesRepository.listForUser(user.id)
  if (items.length === 0) {
    return (
      <EmptyState
        icon={UsersIcon}
        title="You haven't joined any communities yet"
        description="Browse public communities and join one to start trading and discussing."
        action={(
          <Link
            href="/communities"
            className="
              rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground
              hover:bg-primary/90
            "
          >
            Browse communities →
          </Link>
        )}
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(community => (
        <Link
          key={community.id}
          href={`/community/${community.slug}` as any}
          className="block"
        >
          <Card className="gap-0 overflow-hidden p-0 transition-colors hover:border-primary/40">
            <div className="aspect-4/1 bg-linear-to-br from-primary/15 to-primary/5">
              {community.banner_url && (
                <img src={community.banner_url} alt="" className="size-full object-cover" />
              )}
            </div>
            <div className="-mt-6 flex items-start gap-3 p-4">
              <div className="
                flex size-12 shrink-0 items-center justify-center rounded-xl bg-card text-lg ring-2 ring-background
              "
              >
                {community.icon_url
                  ? <img src={community.icon_url} alt="" className="size-12 rounded-lg object-cover" />
                  : '🏛️'}
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <p className="truncate font-semibold">{community.name}</p>
                {community.description && (
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {community.description}
                  </p>
                )}
              </div>
            </div>
            <div className="
              flex items-center justify-between gap-2 border-t border-border/50 px-4 py-2.5 text-xs
              text-muted-foreground
            "
            >
              <span>
                {community.member_count}
                {' '}
                members ·
                {' '}
                {community.market_count}
                {' '}
                markets
              </span>
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                community.role === 'admin' && 'bg-primary/15 text-primary',
                community.role === 'juror' && 'bg-amber-500/15 text-amber-600',
                community.role === 'member' && 'bg-muted text-muted-foreground',
              )}
              >
                {community.role === 'admin' && <Crown className="size-3" />}
                {community.role === 'juror' && <Gavel className="size-3" />}
                {community.role[0].toUpperCase() + community.role.slice(1)}
              </span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}

function Loading() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-40 rounded-sm" />
      ))}
    </div>
  )
}
