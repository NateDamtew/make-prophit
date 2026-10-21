'use client'

import { AlertCircleIcon, CheckCircleIcon, ExternalLinkIcon, GavelIcon, XCircleIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'

import { castJuryVoteAction } from '@/app/[locale]/(platform)/community/[slug]/_actions/community-actions'
import { EvidencePanel } from '@/components/community-engagement/EvidencePanel'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
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

function VoteBadge({ vote, labels }: { vote: string; labels: { yes: string; no: string; disputed: string } }) {
  if (vote === 'yes') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-yes/15 px-1.5 py-0.5 text-2xs font-medium text-yes-foreground">
        <CheckCircleIcon className="size-2.5" />
        {labels.yes.toUpperCase()}
      </span>
    )
  }
  if (vote === 'no') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-no/15 px-1.5 py-0.5 text-2xs font-medium text-no-foreground">
        <XCircleIcon className="size-2.5" />
        {labels.no.toUpperCase()}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-2xs font-medium text-amber-600">
      <AlertCircleIcon className="size-2.5" />
      {labels.disputed.toUpperCase()}
    </span>
  )
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

  const isJuror = memberRole === 'juror' || memberRole === 'admin'
  const canManageEvidence = memberRole === 'admin' || memberRole === 'juror'
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
  const consensusLabel =
    community.jury_size <= 2
      ? t('Unanimous')
      : t('{required} of {total}', {
          required: String(Math.ceil(community.jury_size * 0.75)),
          total: String(community.jury_size),
        })
  const labels = { yes: outcomeLabels.yes, no: outcomeLabels.no, disputed: t('Disputed') }

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

        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{t('Jury votes')}</span>
            <span className="text-xs text-muted-foreground">
              {tally.yes} {outcomeLabels.yes} · {tally.no} {outcomeLabels.no}
              {tally.disputed > 0 ? ` · ${tally.disputed} ${t('Disputed')}` : ''}
            </span>
          </div>
          {votes.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              {isJuror ? t('No votes yet. Be the first to cast yours.') : t('Jury members vote near resolution time.')}
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-border border-t">
              {votes.map((vote) => (
                <li key={vote.id} className="flex items-start gap-3 py-3">
                  <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium">
                    {vote.juror_image ? (
                      <img src={vote.juror_image} alt="" className="size-8 object-cover" />
                    ) : (
                      (vote.juror_username?.[0] ?? '?').toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">
                        {vote.juror_username ? `@${vote.juror_username}` : t('Anonymous')}
                      </span>
                      <VoteBadge vote={vote.vote} labels={labels} />
                      <span className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
                          new Date(vote.voted_at),
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{vote.reasoning}</p>
                    {vote.evidence_url && (
                      <a
                        href={vote.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLinkIcon className="size-3" />
                        {t('Evidence')}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <EvidencePanel marketId={market.id} canManage={canManageEvidence} />
      </div>
    </PoolAccordionPanel>
  )
}
