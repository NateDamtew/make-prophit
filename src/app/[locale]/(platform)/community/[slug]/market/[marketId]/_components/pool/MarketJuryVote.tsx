'use client'

import { AlertCircleIcon, GavelIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'

import { castJuryVoteAction } from '@/app/[locale]/(platform)/community/[slug]/_actions/community-actions'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

import type { PoolCommunityRecord, PoolJuryVote, PoolMarketRecord } from './pool-market-types'

/**
 * The vote form a seated juror sees once the market has closed: Yes / No /
 * Void, a written reason, and the source they read. Votes stay editable
 * until the market resolves. (The sealed-vote flow with seats and a
 * deadline lands with the jury step; this keeps jurors able to resolve
 * markets until then.)
 */

type VoteChoice = 'yes' | 'no' | 'disputed'

const MIN_REASON_CHARS = 80

interface MarketJuryVoteProps {
  market: PoolMarketRecord
  community: PoolCommunityRecord
  votes: PoolJuryVote[]
  currentUserId: string | null
  outcomeLabels: { yes: string; no: string }
}

export default function MarketJuryVote({
  market,
  community,
  votes,
  currentUserId,
  outcomeLabels,
}: MarketJuryVoteProps) {
  const t = useExtracted()
  const [voteChoice, setVoteChoice] = useState<VoteChoice | null>(null)
  const [reasoning, setReasoning] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [isSubmitting, startTransition] = useTransition()
  const myVote = useMemo(
    () => (currentUserId ? votes.find((vote) => vote.juror_id === currentUserId) : undefined),
    [votes, currentUserId],
  )
  const remaining = Math.max(0, MIN_REASON_CHARS - reasoning.trim().length)

  function handleSubmit() {
    if (!voteChoice) {
      toast.error(t('Pick a verdict first.'))
      return
    }
    if (remaining > 0) {
      toast.error(
        t('Write at least {count} characters so stakers can follow your reasoning.', {
          count: String(MIN_REASON_CHARS),
        }),
      )
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
        toast.success(t('Verdict posted.'))
        setReasoning('')
        setEvidenceUrl('')
      }
    })
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4" aria-label={t('Your verdict')}>
      <div className="flex items-center gap-2">
        <GavelIcon className="size-4" aria-hidden="true" />
        <h2 className="text-[17px] font-bold">{myVote ? t('Update your verdict') : t('Your verdict')}</h2>
        {myVote && (
          <span className="text-xs text-muted-foreground">
            {t('You voted {vote}', {
              vote: myVote.vote === 'yes' ? outcomeLabels.yes : myVote.vote === 'no' ? outcomeLabels.no : t('Void'),
            })}
          </span>
        )}
      </div>
      <div role="radiogroup" aria-label={t('Verdict')} className="grid grid-cols-2 gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={voteChoice === 'yes'}
          onClick={() => setVoteChoice('yes')}
          className={cn(
            'h-12 rounded-md text-base font-bold transition-colors',
            voteChoice === 'yes' ? 'bg-yes text-background' : 'bg-yes/15 text-yes',
          )}
        >
          {outcomeLabels.yes}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={voteChoice === 'no'}
          onClick={() => setVoteChoice('no')}
          className={cn(
            'h-12 rounded-md text-base font-bold transition-colors',
            voteChoice === 'no' ? 'bg-no text-background' : 'bg-no/15 text-no-text',
          )}
        >
          {outcomeLabels.no}
        </button>
      </div>
      <button
        type="button"
        role="radio"
        aria-checked={voteChoice === 'disputed'}
        onClick={() => setVoteChoice('disputed')}
        className={cn(
          'flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors',
          voteChoice === 'disputed' ? 'bg-foreground text-background' : 'bg-secondary text-secondary-foreground',
        )}
      >
        <AlertCircleIcon className="size-4" aria-hidden="true" />
        {t('Void this market (refund everyone)')}
      </button>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted-foreground">
        {t('Why')}
        <textarea
          value={reasoning}
          onChange={(event) => setReasoning(event.target.value)}
          placeholder={t('What did the source say, and how did you read it?')}
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground"
          rows={4}
          maxLength={1000}
        />
        <span className="text-xs tabular-nums">
          {remaining > 0 ? t('{count} more characters', { count: String(remaining) }) : t('Good to go')}
        </span>
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted-foreground">
        {t('Source link')}
        <input
          type="url"
          value={evidenceUrl}
          onChange={(event) => setEvidenceUrl(event.target.value)}
          placeholder="https://"
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground"
        />
      </label>
      <Button
        type="button"
        size="lg"
        className="h-12 rounded-md text-base font-bold"
        onClick={handleSubmit}
        disabled={!voteChoice || isSubmitting}
      >
        {isSubmitting ? t('Posting…') : myVote ? t('Update verdict') : t('Post verdict')}
      </Button>
      <p className="text-xs/relaxed text-muted-foreground">
        {t(
          'Your verdict and reason are public. The market resolves when a majority agrees; stakers can appeal within the hold.',
        )}
      </p>
    </section>
  )
}
