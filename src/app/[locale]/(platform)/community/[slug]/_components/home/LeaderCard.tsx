'use client'

import { useExtracted } from 'next-intl'

import type { CommunityTrust } from '@/components/communities/types'

import { initials } from '@/components/communities/format'
import { LeaderTypeBadge } from '@/components/communities/trust/LeaderTypeBadge'
import { Link } from '@/i18n/navigation'

import type { PresetMember } from '../presets/types'

/**
 * Who runs this community, for creator and event pages where the leader
 * is the point: avatar, name, type, record.
 */

interface LeaderCardProps {
  members: PresetMember[]
  trust: CommunityTrust | null
  description: string | null
}

export default function LeaderCard({ members, trust, description }: LeaderCardProps) {
  const t = useExtracted()
  const leader = members.find((member) => member.role === 'admin') ?? null
  if (!leader) {
    return null
  }
  return (
    <section className="flex items-start gap-4 rounded-xl border border-border bg-card p-4" aria-label={t('Leader')}>
      <span className="inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-base font-semibold">
        {leader.image ? (
          <img src={leader.image} alt="" className="size-full object-cover" />
        ) : (
          initials(leader.username)
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-muted-foreground">{t('Led by')}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {leader.username ? (
            <Link href={`/profile/${leader.username}`} className="text-[17px] font-bold hover:underline">
              @{leader.username}
            </Link>
          ) : (
            <span className="text-[17px] font-bold">{t('Leader')}</span>
          )}
          {trust?.leaderType ? <LeaderTypeBadge type={trust.leaderType} className="h-6 text-[11px]" /> : null}
        </div>
        {description ? <p className="mt-1.5 text-sm/relaxed text-muted-foreground">{description}</p> : null}
        {trust ? (
          <p className="mt-2 text-xs text-muted-foreground tabular-nums">
            {t('{resolved} markets resolved · {overturned} overturned', {
              resolved: String(trust.resolved),
              overturned: String(trust.overturned),
            })}
          </p>
        ) : null}
      </div>
    </section>
  )
}
