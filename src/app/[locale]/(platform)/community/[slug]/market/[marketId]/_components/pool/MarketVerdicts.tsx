'use client'

import { useExtracted, useLocale } from 'next-intl'
import { useState } from 'react'

import type { CommunityTrust } from '@/components/communities/types'

import { addCorrectionNoteAction } from '@/app/[locale]/(platform)/_actions/jury'
import { formatCloseLabel } from '@/components/communities/format'
import { JuryProgress } from '@/components/communities/lifecycle/JuryProgress'
import { VerdictCard } from '@/components/communities/lifecycle/VerdictCard'
import { EvidencePanel } from '@/components/community-engagement/EvidencePanel'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

import type { MarketLifecycle } from './market-lifecycle'
import type { MarketSeat, PoolJuryVote } from './pool-market-types'

/**
 * The jury's verdicts. Before the reveal: who has voted (sealed) and who has
 * not (waiting), with the deadline. After it: every verdict with its reason
 * and source, dissent marked, late and overturned votes labelled, and a
 * juror's own dated note where they added one.
 */

interface MarketVerdictsProps {
  marketId: string
  lifecycle: MarketLifecycle
  votes: PoolJuryVote[]
  seats: MarketSeat[]
  trust: CommunityTrust | null
  outcomeLabels: { yes: string; no: string }
  canManageEvidence: boolean
  currentUserId: string | null
}

function NoteForm({ voteId, onSaved }: { voteId: string; onSaved: (note: string) => void }) {
  const t = useExtracted()
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-semibold underline underline-offset-[3px]"
      >
        {t('Add a dated note')}
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        maxLength={600}
        placeholder={t('What you would say now about this verdict. The vote itself never changes.')}
        className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={saving || note.trim().length < 10}
          onClick={async () => {
            setSaving(true)
            const result = await addCorrectionNoteAction({ voteId, note })
            setSaving(false)
            if (result.error) {
              toast.error(result.error)
              return
            }
            onSaved(note.trim())
          }}
        >
          {saving ? t('Saving…') : t('Post note')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t('Cancel')}
        </Button>
      </div>
    </div>
  )
}

export default function MarketVerdicts({
  marketId,
  lifecycle,
  votes,
  seats,
  trust,
  outcomeLabels,
  canManageEvidence,
  currentUserId,
}: MarketVerdictsProps) {
  const t = useExtracted()
  const locale = useLocale()
  // A note posted from this page carries the moment it was posted.
  const [notes, setNotes] = useState<Record<string, { text: string; at: number }>>({})
  if (lifecycle.source === 'imported') {
    return null
  }
  const revealed = lifecycle.jury.revealed
  const jurorsById = new Map((trust?.jurors ?? []).map((juror) => [juror.userId, juror]))
  const votedIds = new Set(votes.map((vote) => vote.juror_id).filter(Boolean))
  // Seated jurors who have not voted; before seats existed, the community's jurors stand in.
  const bench: MarketSeat[] =
    seats.length > 0
      ? seats
      : (trust?.jurors ?? []).map((juror) => ({ userId: juror.userId, username: juror.username, image: juror.image }))
  const waiting = bench.filter((juror) => !votedIds.has(juror.userId))
  const majority = votes.filter((vote) => vote.vote === lifecycle.outcome).length
  const minority = votes.filter((vote) => vote.vote !== 'sealed').length - majority
  const closed = lifecycle.phase !== 'open' && lifecycle.phase !== 'closing'
  const deadlinePassed = lifecycle.juryDueAt !== null && lifecycle.phase !== 'awaiting' && revealed

  return (
    <section className="flex flex-col gap-4" id="verdicts">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-bold">{t('Verdicts')}</h2>
        {!closed ? <span className="text-xs text-muted-foreground">{t('Jurors vote after close')}</span> : null}
      </div>

      {!revealed && closed && (
        <JuryProgress
          seats={lifecycle.jury.size}
          voted={lifecycle.jury.voted}
          required={lifecycle.jury.required}
          caption={
            lifecycle.juryDueAt !== null
              ? t('Votes open together when every juror has voted, or at {time}', {
                  time: formatCloseLabel(lifecycle.juryDueAt, locale),
                })
              : t('Votes open together when every juror has voted')
          }
        />
      )}

      {votes.length === 0 && waiting.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {!closed
            ? t('The jury reads the source after close and posts each verdict with a reason.')
            : t('No verdicts yet.')}
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {votes.map((vote) => {
            const juror = vote.juror_id ? jurorsById.get(vote.juror_id) : undefined
            const voteRevealed = revealed || Boolean(vote.revealed_at) || vote.juror_id === currentUserId
            const sealedForViewer = vote.vote === 'sealed' || !voteRevealed
            const side = vote.vote === 'yes' ? 'yes' : vote.vote === 'no' ? 'no' : null
            const outvoted = revealed && lifecycle.outcome !== null && side !== null && side !== lifecycle.outcome
            const posted = notes[vote.id]
            const note = posted
              ? { text: posted.text, at: posted.at }
              : vote.correction_note
                ? { text: vote.correction_note, at: vote.correction_note_at ?? vote.voted_at }
                : null
            const isMine = vote.juror_id === currentUserId
            return (
              <div key={vote.id} className="flex flex-col gap-2">
                <VerdictCard
                  state={sealedForViewer ? 'sealed' : vote.overturned ? 'overturned' : 'revealed'}
                  juror={{
                    userId: vote.juror_id ?? vote.id,
                    username: vote.juror_username,
                    image: vote.juror_image,
                    rating: juror?.rating ?? null,
                    markets: juror?.markets ?? null,
                  }}
                  vote={
                    sealedForViewer
                      ? null
                      : vote.vote === 'yes'
                        ? outcomeLabels.yes.toUpperCase()
                        : vote.vote === 'no'
                          ? outcomeLabels.no.toUpperCase()
                          : t('Void').toUpperCase()
                  }
                  side={sealedForViewer ? null : side}
                  reason={sealedForViewer ? null : vote.reasoning}
                  source={
                    !sealedForViewer && vote.evidence_url
                      ? { type: vote.source_type === 'photo' ? 'photo' : 'link', url: vote.evidence_url }
                      : null
                  }
                  votedAt={vote.voted_at}
                  wasLate={revealed ? Boolean(vote.was_late) : undefined}
                  dissent={
                    outvoted
                      ? t('{majority} to {minority}', { majority: String(majority), minority: String(minority) })
                      : null
                  }
                  note={note}
                />
                {isMine && revealed && !note && vote.vote !== 'sealed' ? (
                  <NoteForm
                    voteId={vote.id}
                    onSaved={(text) => setNotes((prev) => ({ ...prev, [vote.id]: { text, at: Date.now() } }))}
                  />
                ) : null}
              </div>
            )
          })}
          {waiting.map((juror) => (
            <VerdictCard
              key={juror.userId}
              state={deadlinePassed ? 'late' : 'waiting'}
              juror={{
                userId: juror.userId,
                username: juror.username,
                image: juror.image,
                rating: jurorsById.get(juror.userId)?.rating ?? null,
                markets: jurorsById.get(juror.userId)?.markets ?? null,
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
