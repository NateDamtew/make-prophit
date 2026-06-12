'use client'

import type { CommunityMarketSummary, CommunityMemberSummary, CommunitySummary } from './types'
import { Gavel } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { castJuryVoteAction } from '../../_actions/community-actions'
import { VoteButton } from './shared'

interface JuryTabProps {
  community: CommunitySummary
  members: CommunityMemberSummary[]
  markets: CommunityMarketSummary[]
  isJuror: boolean
}

export function JuryTab({ community, members, markets, isJuror }: JuryTabProps) {
  const [voteMap, setVoteMap] = useState<Record<string, string>>({})
  const [reasoningMap, setReasoningMap] = useState<Record<string, string>>({})
  const [isVoting, startVoteTransition] = useTransition()

  const jurors = members.filter(m => m.role === 'juror' || m.role === 'admin')
  const activeMarkets = markets.filter(m => m.status === 'active')

  function handleCastVote(marketId: string) {
    const vote = voteMap[marketId]
    const reasoning = reasoningMap[marketId]
    if (!vote || !reasoning) {
      toast.error('Please select a vote and provide reasoning.')
      return
    }
    startVoteTransition(async () => {
      const result = await castJuryVoteAction(
        marketId,
        community.id,
        community.slug,
        { vote: vote as 'yes' | 'no' | 'disputed', reasoning },
      )
      if (result.error) {
        toast.error(result.error)
      }
      else {
        toast.success('Vote cast successfully!')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-muted/30 p-4 text-sm">
        <p className="font-medium">
          {jurors.length}
          {' '}
          of
          {' '}
          {community.jury_size}
          {' '}
          jury seats filled
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {community.jury_size <= 2
            ? 'Unanimous vote required to resolve markets.'
            : `${Math.ceil(community.jury_size * 0.75)} of ${community.jury_size} votes needed (>75%).`}
        </p>
      </div>

      <div className="space-y-2">
        {jurors.map(juror => (
          <div key={juror.user_id} className="flex items-center gap-3 rounded-xl border p-3">
            <div className="
              flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-sm font-medium
              text-amber-600
            "
            >
              {juror.image
                ? <img src={juror.image} alt="" className="size-9 rounded-full object-cover" />
                : <Gavel className="size-4" />}
            </div>
            <div>
              <p className="text-sm font-medium">
                {juror.username ? `@${juror.username}` : 'Anonymous'}
              </p>
              <p className="text-xs text-muted-foreground capitalize">{juror.role}</p>
            </div>
          </div>
        ))}
      </div>

      {isJuror && activeMarkets.length > 0 && (
        <div className="space-y-4 border-t pt-4">
          <p className="text-sm font-medium">Pending Markets to Vote On</p>
          {activeMarkets.map(market => (
            <div key={market.id} className="space-y-3 rounded-xl border p-4">
              <p className="font-medium">{market.title}</p>
              <div className="flex gap-2">
                {(['yes', 'no', 'disputed'] as const).map(v => (
                  <VoteButton
                    key={v}
                    vote={v}
                    current={voteMap[market.id] ?? ''}
                    onClick={() => setVoteMap(prev => ({ ...prev, [market.id]: v }))}
                  />
                ))}
              </div>
              <textarea
                placeholder="Provide reasoning for your vote (required)..."
                value={reasoningMap[market.id] ?? ''}
                onChange={e => setReasoningMap(prev => ({ ...prev, [market.id]: e.target.value }))}
                className="
                  w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none
                  focus:ring-1 focus:ring-primary
                "
                rows={2}
              />
              <Button size="sm" onClick={() => handleCastVote(market.id)} disabled={isVoting}>
                {isVoting ? 'Submitting...' : 'Submit Vote'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
