'use client'

import type { CommunityMemberSummary, CommunitySummary } from './types'
import { Crown, Gavel } from 'lucide-react'
import { useMemo } from 'react'
import { ResolverBadge } from '@/components/community-engagement/ResolverBadge'
import { useResolverStats } from '@/components/community-engagement/useResolverStats'
import { cn } from '@/lib/utils'
import MemberRoleManager from '../MemberRoleManager'

interface MembersTabProps {
  community: CommunitySummary
  members: CommunityMemberSummary[]
  memberRole: string | null
  currentUserId: string | null
}

export function MembersTab({ community, members, memberRole, currentUserId }: MembersTabProps) {
  const jurors = members.filter(m => m.role === 'juror' || m.role === 'admin')
  // Resolver badges are only meaningful for jurors + admins — they're the
  // ones who actually cast resolution votes. Skip the rest to keep the batch
  // request small and the UI clean.
  const jurorIds = useMemo(() => jurors.map(j => j.user_id), [jurors])
  const resolverStats = useResolverStats(jurorIds)

  return (
    <div className="space-y-3">
      {memberRole === 'admin' && (
        <div className="rounded-xl border bg-primary/5 p-3 text-xs">
          <p className="font-medium text-primary">Admin Tip</p>
          <p className="mt-0.5 text-muted-foreground">
            Click the role badge next to a member to promote them to Juror or Admin. The jury has
            {' '}
            <strong className="text-foreground">
              {jurors.length}
              /
              {community.jury_size}
            </strong>
            {' '}
            seats filled.
          </p>
        </div>
      )}
      <div className="space-y-2">
        {members.map(member => (
          <div key={member.user_id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-muted/30">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {member.image
                ? <img src={member.image} alt="" className="size-9 rounded-full object-cover" />
                : (member.username?.[0] ?? '?').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {member.username ? `@${member.username}` : 'Anonymous'}
                {member.user_id === currentUserId && (
                  <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                )}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Joined
                  {' '}
                  {new Date(member.joined_at).toLocaleDateString()}
                </span>
                <JurorBadgeFromStats
                  role={member.role}
                  stats={resolverStats.get(member.user_id)}
                />
              </div>
            </div>
            {memberRole === 'admin'
              ? (
                  <MemberRoleManager
                    communityId={community.id}
                    communitySlug={community.slug}
                    targetUserId={member.user_id}
                    currentRole={member.role}
                    jurySize={community.jury_size}
                    currentJurorCount={jurors.length}
                    isSelf={member.user_id === currentUserId}
                  />
                )
              : (
                  <span className={cn(
                    'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                    member.role === 'admin' && 'bg-primary/10 text-primary',
                    member.role === 'juror' && 'bg-amber-500/10 text-amber-600',
                    member.role === 'member' && 'bg-muted text-muted-foreground',
                  )}
                  >
                    {member.role === 'admin' && <Crown className="size-3" />}
                    {member.role === 'juror' && <Gavel className="size-3" />}
                    {member.role === 'admin' ? 'Admin' : member.role === 'juror' ? 'Juror' : 'Member'}
                  </span>
                )}
          </div>
        ))}
      </div>
    </div>
  )
}

function JurorBadgeFromStats({
  role,
  stats,
}: {
  role: string
  stats: { markets_resolved: number, upheld_rate: number | null } | null
}) {
  if (role !== 'admin' && role !== 'juror') {
    return null
  }
  if (!stats) {
    return null
  }
  return <ResolverBadge marketsResolved={stats.markets_resolved} upheldRate={stats.upheld_rate} />
}
