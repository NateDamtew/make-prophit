'use client'

import { useExtracted, useLocale } from 'next-intl'

import type { CommunityTrust } from '@/components/communities/types'

import { formatCloseLabel } from '@/components/communities/format'
import { JuryProgress } from '@/components/communities/lifecycle/JuryProgress'
import { VerdictCard } from '@/components/communities/lifecycle/VerdictCard'
import { EvidencePanel } from '@/components/community-engagement/EvidencePanel'

import type { MarketLifecycle } from './market-lifecycle'
import type { PoolJuryVote } from './pool-market-types'

/**
 * The jury's verdicts: each juror's call, why, and the source they read.
 * While the market is open the seats are listed as waiting; after the
 * reveal every verdict is on the page for anyone to check.
 */

interface MarketVerdictsProps {
  marketId: string
  lifecycle: MarketLifecycle
  votes: PoolJuryVote[]
  trust: CommunityTrust | null
  outcomeLabels: { yes: string; no: string }
  canManageEvidence: boolean
}

export default function MarketVerdicts({
  marketId,
  lifecycle,
  votes,
  trust,
  outcomeLabels,
  canManageEvidence,
}: MarketVerdictsProps) {
  const t = useExtracted()
  const locale = useLocale()
  if (lifecycle.source === 'imported') {
    return null
  }
  const revealed = lifecycle.jury.revealed
  const jurorsById = new Map((trust?.jurors ?? []).map((juror) => [juror.userId, juror]))
  const votedIds = new Set(votes.map((vote) => vote.juror_id).filter(Boolean))
  const waiting = (trust?.jurors ?? []).filter((juror) => !votedIds.has(juror.userId))
  const majority = votes.filter((vote) => vote.vote === lifecycle.outcome).length
  const minority = votes.length - majority

  return (
    <section className="flex flex-col gap-4" id="verdicts">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-bold">{t('Verdicts')}</h2>
        {lifecycle.phase === 'open' || lifecycle.phase === 'closing' ? (
          <span className="text-xs text-muted-foreground">{t('Jurors vote after close')}</span>
        ) : null}
      </div>

      {!revealed && (
        <JuryProgress
          seats={lifecycle.jury.size}
          voted={lifecycle.jury.voted}
          required={lifecycle.jury.required}
          caption={
            lifecycle.juryDueAt !== null
              ? t('Due by {time}', { time: formatCloseLabel(lifecycle.juryDueAt, locale) })
              : null
          }
        />
      )}

      {votes.length === 0 && waiting.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {lifecycle.phase === 'open' || lifecycle.phase === 'closing'
            ? t('The jury reads the source after close and posts each verdict with a reason.')
            : t('No verdicts yet.')}
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {votes.map((vote) => {
            const juror = vote.juror_id ? jurorsById.get(vote.juror_id) : undefined
            const side = vote.vote === 'yes' ? 'yes' : vote.vote === 'no' ? 'no' : null
            const outvoted = revealed && lifecycle.outcome !== null && side !== null && side !== lifecycle.outcome
            return (
              <VerdictCard
                key={vote.id}
                state={revealed ? 'revealed' : 'sealed'}
                juror={{
                  userId: vote.juror_id ?? vote.id,
                  username: vote.juror_username,
                  image: vote.juror_image,
                  rating: juror?.rating ?? null,
                  markets: juror?.markets ?? null,
                }}
                vote={
                  revealed
                    ? vote.vote === 'yes'
                      ? outcomeLabels.yes.toUpperCase()
                      : vote.vote === 'no'
                        ? outcomeLabels.no.toUpperCase()
                        : t('Void').toUpperCase()
                    : null
                }
                side={revealed ? side : null}
                reason={revealed ? vote.reasoning : null}
                source={revealed && vote.evidence_url ? { type: 'link', url: vote.evidence_url } : null}
                votedAt={vote.voted_at}
                dissent={
                  outvoted
                    ? t('{majority} to {minority}', { majority: String(majority), minority: String(minority) })
                    : null
                }
              />
            )
          })}
          {!revealed &&
            waiting.map((juror) => (
              <VerdictCard
                key={juror.userId}
                state="waiting"
                juror={{
                  userId: juror.userId,
                  username: juror.username,
                  image: juror.image,
                  rating: juror.rating,
                  markets: juror.markets,
                }}
                dueAt={lifecycle.juryDueAt}
              />
            ))}
        </div>
      )}

      <EvidencePanel marketId={marketId} canManage={canManageEvidence} />
    </section>
  )
}
