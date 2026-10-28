'use client'

import { AlertCircleIcon, GavelIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'

import { castJuryVoteAction } from '@/app/[locale]/(platform)/community/[slug]/_actions/community-actions'
import { JuryProgress } from '@/components/communities/lifecycle/JuryProgress'
import { VerdictCard } from '@/components/communities/lifecycle/VerdictCard'
import { EvidencePanel } from '@/components/community-engagement/EvidencePanel'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { isJurorRole } from '@/lib/communities/roles'
import { majorityOf } from '@/lib/communities/rules'
import { cn } from '@/lib/utils'

import type { PoolCommunityRecord, PoolJuryVote, PoolMarketRecord } from './pool-market-types'

import PoolAccordionPanel from './PoolAccordionPanel'

/**
 * Jury resolution for pool markets, presented as a second accordion under
 * the rules so the page keeps the platform event layout. Jurors cast and
 * update their vote here; everyone sees the public tally, reasoning and
 * evidence.
 */

type VoteChoice = 'yes' | 'no' | 'disputed'

interface PoolJuryPanelProps {
  market: PoolMarketRecord
  community: PoolCommunityRecord
  votes: PoolJuryVote[]
  memberRole: string | null
  currentUserId: string | null
  outcomeLabels: { yes: string; no: string }
}

export default function PoolJuryPanel({
  market,
  community,
  votes,
  memberRole,
  currentUserId,
  outcomeLabels,
}: PoolJuryPanelProps) {
  const t = useExtracted()
  const locale = useLocale()
  const nowTimestamp = useNowTimestamp()
  const [voteChoice, setVoteChoice] = useState<VoteChoice | null>(null)
  const [reasoning, setReasoning] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [isSubmitting, startTransition] = useTransition()

  const isJuror = isJurorRole(memberRole)
  const canManageEvidence = isJuror
  const isResolved = market.status === 'resolved' || market.status === 'cancelled'
  const resolutionDue =
    market.resolution_date && nowTimestamp !== null ? new Date(market.resolution_date).getTime() <= nowTimestamp : false
  const myVote = useMemo(
    () => (currentUserId ? votes.find((vote) => vote.juror_id === currentUserId) : undefined),
    [votes, currentUserId],
  )
  const tally = useMemo(() => {
    const yes = votes.filter((vote) => vote.vote === 'yes').length
    const no = votes.filter((vote) => vote.vote === 'no').length
    const disputed = votes.filter((vote) => vote.vote === 'disputed').length
    return { yes, no, disputed, total: yes + no + disputed }
  }, [votes])
  const required = majorityOf(community.jury_size)
  const consensusLabel = t('{required} of {total}', {
    required: String(required),
    total: String(community.jury_size),
  })

  function handleSubmit() {
    if (!voteChoice) {
      toast.error(t('Please select a vote.'))
      return
    }
    if (reasoning.trim().length < 10) {
      toast.error(t('Please provide at least 10 characters of reasoning.'))
      return
    }
    startTransition(async () => {
      const result = await castJuryVoteAction(market.id, community.id, community.slug, {
        vote: voteChoice,
        reasoning: reasoning.trim(),
        evidence_url: evidenceUrl.trim() || undefined,
      })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('Vote cast!'))
        setReasoning('')
        setEvidenceUrl('')
      }
    })
  }

  const adornment = (
    <span className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 text-xs font-semibold text-muted-foreground tabular-nums">
      <GavelIcon className="size-3.5" aria-hidden="true" />
      {tally.total}/{community.jury_size}
    </span>
  )

  return (
    <PoolAccordionPanel
      initialExpanded={!isResolved && (resolutionDue || (isJuror && !myVote))}
      title={t('Jury Resolution')}
      titleAdornment={adornment}
    >
      <div className="space-y-4 p-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-foreground">
          <p>
            <span className="font-semibold">{t('Jurors')}:</span> {community.jury_size}
          </p>
          <p>
            <span className="font-semibold">{t('Consensus required')}:</span> {consensusLabel}
          </p>
          <p className="text-muted-foreground">
            {t('Votes are public, include reasoning, and settle the pool automatically once consensus is reached.')}
          </p>
        </div>

        {isResolved ? (
          <div className="rounded-lg border p-3 text-sm">
            <span className="font-semibold">{t('Outcome:')}</span>{' '}
            {market.resolved_outcome === 'yes'
              ? outcomeLabels.yes
              : market.resolved_outcome === 'no'
                ? outcomeLabels.no
                : t('Cancelled')}
            {market.resolved_at && (
              <span className="text-muted-foreground">
                {' · '}
                {new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(
                  new Date(market.resolved_at),
                )}
              </span>
            )}
          </div>
        ) : isJuror ? (
          <div className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <GavelIcon className="size-4 text-primary" />
              <h4 className="text-sm font-semibold">{myVote ? t('Update your vote') : t('Cast your vote')}</h4>
              {myVote && (
                <span className="text-xs text-muted-foreground">
                  {t('You voted {vote}', { vote: myVote.vote.toUpperCase() })}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={voteChoice === 'yes' ? 'yes' : 'outline'}
                size="outcome"
                className={cn(voteChoice === 'yes' && 'bg-yes text-white hover:bg-yes-foreground')}
                onClick={() => setVoteChoice('yes')}
              >
                {outcomeLabels.yes}
              </Button>
              <Button
                type="button"
                variant={voteChoice === 'no' ? 'no' : 'outline'}
                size="outcome"
                className={cn(voteChoice === 'no' && 'bg-no text-white hover:bg-no-foreground')}
                onClick={() => setVoteChoice('no')}
              >
                {outcomeLabels.no}
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setVoteChoice('disputed')}
              className={cn(
                `flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors`,
                voteChoice === 'disputed' ? 'border-amber-500/40 bg-amber-500/10 text-amber-600' : 'hover:bg-muted/30',
              )}
            >
              <AlertCircleIcon className="size-3.5" />
              {t('Mark as disputed')}
            </button>
            <textarea
              value={reasoning}
              onChange={(event) => setReasoning(event.target.value)}
              placeholder={t('Explain your vote based on the resolution source...')}
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
              rows={3}
              maxLength={1000}
            />
            <input
              type="url"
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
              placeholder={t('Evidence URL (optional)')}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
            />
            <Button type="button" onClick={handleSubmit} disabled={!voteChoice || isSubmitting} className="w-full">
              {isSubmitting ? t('Submitting...') : myVote ? t('Update Vote') : t('Submit Vote')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('Only appointed jurors can vote on this market’s outcome.')}
            {!memberRole &&
              community.type === 'public' &&
              ` ${t('Join the community to take part in the discussion.')}`}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {!isResolved && (
            <JuryProgress
              seats={community.jury_size}
              voted={tally.total}
              required={required}
              caption={
                market.resolution_date
                  ? t('Verdicts due by {time}. If the jury is late, everyone is refunded.', {
                      time: new Intl.DateTimeFormat(locale, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      }).format(new Date(market.resolution_date)),
                    })
                  : null
              }
            />
          )}
          {votes.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              {isJuror ? t('No votes yet. Be the first to cast yours.') : t('Jury members vote near resolution time.')}
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {votes.map((vote) => (
                <VerdictCard
                  key={vote.id}
                  state="revealed"
                  juror={{
                    userId: vote.juror_id ?? vote.id,
                    username: vote.juror_username,
                    image: vote.juror_image,
                    rating: null,
                    markets: null,
                  }}
                  vote={
                    vote.vote === 'yes'
                      ? outcomeLabels.yes.toUpperCase()
                      : vote.vote === 'no'
                        ? outcomeLabels.no.toUpperCase()
                        : t('Disputed').toUpperCase()
                  }
                  side={vote.vote === 'yes' ? 'yes' : vote.vote === 'no' ? 'no' : null}
                  reason={vote.reasoning}
                  source={vote.evidence_url ? { type: 'link', url: vote.evidence_url } : null}
                  votedAt={vote.voted_at}
                />
              ))}
            </div>
          )}
        </div>

        <EvidencePanel marketId={market.id} canManage={canManageEvidence} />
      </div>
    </PoolAccordionPanel>
  )
}
