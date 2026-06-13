import type { SupportedLocale } from '@/i18n/locales'
import { ChevronLeftIcon, ClockIcon } from 'lucide-react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'
import { formatAbsolute } from '@/components/admin-ui/format'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityMonetizationRepository } from '@/lib/db/queries/community-monetization'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
}

async function PayoutsContent({ slug }: { slug: string }) {
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

  const [monetization, payouts] = await Promise.all([
    CommunityMonetizationRepository.getFields(community.id),
    CommunityMonetizationRepository.listPayouts(community.id, 100),
  ])

  return (
    <div className="grid gap-6">
      <header>
        <Link
          href={`/community/${community.slug}/insights` as any}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
          Back to Insights
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Payouts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Once trading is live, periodic payouts for {community.name} will be ledgered here.
        </p>
      </header>

      <Card className="gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <h2 className="text-sm font-semibold">Fee config</h2>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ClockIcon className="size-3" />
            Read-only — set by platform admin
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Community fee</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {((monetization?.community_fee_bps ?? 0) / 100).toFixed(2)}
              <span className="text-sm font-normal text-muted-foreground"> %</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Payout address</p>
            <p className="mt-1 truncate font-mono text-sm">
              {monetization?.fee_payout_address || <span className="italic text-muted-foreground">Not set</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Verified</p>
            <p className="mt-1 text-sm font-medium">{monetization?.is_verified ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </Card>

      <Card className="gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <h2 className="text-sm font-semibold">Payout history</h2>
          <span className="text-xs text-muted-foreground">
            {payouts.length === 0 ? 'no payouts yet' : `${payouts.length} entries`}
          </span>
        </div>
        {payouts.length === 0
          ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Payouts launch once trading goes live and the first settlement cycle closes.
              </div>
            )
          : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="px-5 py-3 font-medium">Period</th>
                      <th className="px-5 py-3 font-medium">Volume</th>
                      <th className="px-5 py-3 font-medium">Fee</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Paid at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map(p => (
                      <tr key={p.id} className="border-b border-border/30 last:border-0">
                        <td className="px-5 py-3">
                          {p.period_start.toLocaleDateString()}
                          {' – '}
                          {p.period_end.toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3 tabular-nums">${Number(p.gross_volume_usd).toLocaleString()}</td>
                        <td className="px-5 py-3 tabular-nums">${Number(p.community_fee_usd).toLocaleString()}</td>
                        <td className="px-5 py-3">{p.status}</td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {p.paid_at ? formatAbsolute(p.paid_at) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </Card>
    </div>
  )
}

export default async function PayoutsPage({
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
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <Suspense fallback={<Skeleton className="h-96 rounded-sm" />}>
        <PayoutsContent slug={slug} />
      </Suspense>
    </div>
  )
}
