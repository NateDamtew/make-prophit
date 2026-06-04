import type { Metadata } from 'next'
import { ArrowUpRightIcon, BotIcon, ExternalLinkIcon, ZapIcon } from 'lucide-react'
import { setRequestLocale } from 'next-intl/server'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { AgentRepository } from '@/lib/db/queries/agents'
import { buildPublicProfilePath } from '@/lib/platform-routing'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

interface AgentProfileRouteParams {
  params: Promise<{ locale: string, slug: string }>
}

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
}

export async function generateMetadata({ params }: AgentProfileRouteParams): Promise<Metadata> {
  const { locale, slug } = await params
  setRequestLocale(locale)

  if (slug === STATIC_PARAMS_PLACEHOLDER) {
    return { title: 'Agent' }
  }

  const { data: agent } = await AgentRepository.getBySlugPublic(slug)
  if (!agent) {
    return { title: 'Agent' }
  }
  return {
    title: `${agent.name} · Agent profile`,
    description: agent.description ?? `${agent.name} on Prophit`,
  }
}

function formatStat(value: string | number) {
  const num = typeof value === 'string' ? Number.parseFloat(value) : value
  if (!Number.isFinite(num)) {
    return '—'
  }
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatUsd(value: string) {
  const num = Number.parseFloat(value)
  if (!Number.isFinite(num)) {
    return '—'
  }
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: num >= 100 ? 0 : 2 })
}

export default async function AgentProfilePage({ params }: AgentProfileRouteParams) {
  const { locale, slug } = await params
  setRequestLocale(locale)

  if (slug === STATIC_PARAMS_PLACEHOLDER) {
    notFound()
  }

  const { data: agent } = await AgentRepository.getBySlugPublic(slug)
  if (!agent) {
    notFound()
  }

  const ownerProfilePath = agent.owner_username
    ? buildPublicProfilePath(agent.owner_username)
    : null

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 lg:py-10">
      {/* Hero */}
      <section className="grid gap-5">
        <div className="flex flex-wrap items-start gap-4">
          {/* Avatar */}
          <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-primary/10">
            {agent.avatar_url
              ? (
                  <Image
                    src={agent.avatar_url}
                    alt=""
                    fill
                    sizes="80px"
                    unoptimized
                    className="object-cover"
                  />
                )
              : (
                  <div className="flex size-full items-center justify-center">
                    <BotIcon className="size-10 text-primary" />
                  </div>
                )}
          </div>

          {/* Identity */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="
                rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-bold tracking-wide text-primary uppercase
              "
              >
                <ZapIcon className="-mt-0.5 mr-0.5 inline-block size-3" />
                Agent
              </span>
              {agent.status !== 'active' && (
                <span className="
                  rounded-full bg-muted px-2 py-0.5 text-2xs font-bold tracking-wide text-muted-foreground uppercase
                "
                >
                  {agent.status}
                </span>
              )}
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{agent.name}</h1>
            {agent.description && (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{agent.description}</p>
            )}

            {/* Owner attribution — clickable through to the owner's public profile */}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">Operated by</span>
              {ownerProfilePath
                ? (
                    <Link
                      href={ownerProfilePath as never}
                      className="
                        group inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 font-medium ring-1
                        ring-border transition-colors
                        hover:bg-accent
                      "
                    >
                      {agent.owner_image
                        ? (
                            <span className="relative size-5 overflow-hidden rounded-full bg-muted">
                              <Image
                                src={agent.owner_image}
                                alt=""
                                fill
                                sizes="20px"
                                unoptimized
                                className="object-cover"
                              />
                            </span>
                          )
                        : (
                            <span className="
                              flex size-5 items-center justify-center rounded-full bg-muted text-2xs font-bold
                              text-muted-foreground
                            "
                            >
                              {(agent.owner_username ?? 'U').slice(0, 1).toUpperCase()}
                            </span>
                          )}
                      <span>
                        @
                        {agent.owner_username}
                      </span>
                      <ArrowUpRightIcon className="
                        size-3.5 text-muted-foreground transition-colors
                        group-hover:text-foreground
                      "
                      />
                    </Link>
                  )
                : (
                    <span className="text-muted-foreground">Anonymous</span>
                  )}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Volume" value={formatUsd(agent.total_volume_usd)} />
          <StatCard label="P/L" value={formatUsd(agent.total_pnl_usd)} />
          <StatCard label="Trades" value={formatStat(agent.total_trades)} />
          <StatCard label="Wins" value={formatStat(agent.win_count)} />
        </div>
      </section>

      {/* Activity placeholder — real once mainnet trading is live */}
      <section className="mt-10">
        <h2 className="mb-3 text-base font-semibold tracking-tight">Recent activity</h2>
        <div className="
          grid place-items-center gap-2 rounded-xl border border-dashed bg-card/40 px-6 py-12 text-center text-sm
          text-muted-foreground
        "
        >
          <BotIcon className="size-8 text-muted-foreground/50" />
          <p>Trade history will appear here once agent trading goes live at mainnet.</p>
        </div>
      </section>

      {/* Footer CTA — discover other agents + register your own */}
      <section className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
        <p className="text-muted-foreground">
          See how
          {' '}
          {agent.name}
          {' '}
          ranks against other agents.
        </p>
        <Link
          href={'/leaderboard' as never}
          className="
            inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground
          "
        >
          Agent leaderboard
          <ExternalLinkIcon className="size-3.5" />
        </Link>
      </section>
    </main>
  )
}

function StatCard({ label, value }: { label: string, value: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl border bg-card p-3">
      <span className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-base font-extrabold tabular-nums">{value}</span>
    </div>
  )
}
