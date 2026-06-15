'use client'

import type { PresetMember, PresetProps } from './types'
import { MessageCircleIcon, TrendingUpIcon, UsersIcon } from 'lucide-react'
import { useMemo } from 'react'
import { ActivityTab } from '../community-tabs/ActivityTab'
import CommunityMarketCard from '../CommunityMarketCard'

/**
 * Forum preset — discussion-first, activity-led.
 *
 * Layout:
 *   1. Activity feed PROMOTED to top (the conversation IS the product here).
 *   2. Active markets — compact, secondary.
 *   3. Members spotlight — top contributors, role mix.
 *
 * No big hero, no fixture grouping; this is for niche-interest communities
 * where the discussion matters more than any single market.
 */
export default function ForumPreset({ community, markets, members, memberRole }: PresetProps) {
  const isJuror = memberRole === 'juror' || memberRole === 'admin'

  const activeMarkets = useMemo(
    () => markets.filter(m => m.status === 'active').slice(0, 6),
    [markets],
  )

  const memberStats = useMemo(() => buildMemberStats(members), [members])

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      {/* MAIN: activity + markets */}
      <div className="grid gap-6">
        <section className="rounded-sm border bg-card p-4">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <MessageCircleIcon className="size-4" />
              Activity
            </h2>
            <span className="text-2xs text-muted-foreground">live updates</span>
          </header>
          <div className="-mx-1">
            <ActivityTab communityId={community.id} />
          </div>
        </section>

        {activeMarkets.length > 0 && (
          <section>
            <header className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUpIcon className="size-4" />
                Markets
              </h2>
              <span className="text-2xs text-muted-foreground">{activeMarkets.length} active</span>
            </header>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {activeMarkets.map(market => (
                <CommunityMarketCard
                  key={market.id}
                  communitySlug={community.slug}
                  market={market}
                  yesVotes={market.votes?.yes ?? 0}
                  noVotes={market.votes?.no ?? 0}
                  totalJurors={community.jury_size}
                  isJuror={isJuror}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* SIDE: members spotlight */}
      <aside className="grid gap-4">
        <section className="rounded-sm border bg-card p-4">
          <header className="mb-3 flex items-center gap-2">
            <UsersIcon className="size-4" />
            <h2 className="text-sm font-semibold">Members</h2>
            <span className="ms-auto text-2xs text-muted-foreground">{members.length} total</span>
          </header>
          <ul className="space-y-2">
            {memberStats.spotlight.map(m => (
              <li key={m.user_id} className="flex items-center gap-2 rounded-sm px-1 py-1.5 hover:bg-accent/50">
                <Avatar member={m} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.username ? `@${m.username}` : 'Anonymous'}</p>
                  <p className="text-2xs text-muted-foreground capitalize">{m.role}</p>
                </div>
              </li>
            ))}
          </ul>
          {memberStats.summary && (
            <p className="mt-3 border-t border-border/60 pt-3 text-2xs text-muted-foreground">
              {memberStats.summary}
            </p>
          )}
        </section>

        {community.rules && (
          <section className="rounded-sm border bg-card p-4">
            <h2 className="text-sm font-semibold">House rules</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">{community.rules}</p>
          </section>
        )}
      </aside>
    </div>
  )
}

function Avatar({ member }: { member: PresetMember }) {
  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
      {member.image
        ? <img src={member.image} alt="" className="size-7 rounded-full object-cover" />
        : (member.username?.[0] ?? '?').toUpperCase()}
    </div>
  )
}

function buildMemberStats(members: PresetMember[]) {
  const sorted = [...members].sort((a, b) => {
    // Admins first, then jurors, then by oldest joined (founders surface first).
    const aRank = a.role === 'admin' ? 0 : a.role === 'juror' ? 1 : 2
    const bRank = b.role === 'admin' ? 0 : b.role === 'juror' ? 1 : 2
    if (aRank !== bRank) {
      return aRank - bRank
    }
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
  })
  const spotlight = sorted.slice(0, 8)
  const adminCount = members.filter(m => m.role === 'admin').length
  const jurorCount = members.filter(m => m.role === 'juror').length
  const summary = members.length > 0
    ? `${adminCount} admin · ${jurorCount} juror${jurorCount === 1 ? '' : 's'} · ${members.length - adminCount - jurorCount} member${members.length - adminCount - jurorCount === 1 ? '' : 's'}`
    : null
  return { spotlight, summary }
}
