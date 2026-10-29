'use client'

import { AlertCircleIcon, CameraIcon, CheckIcon, GavelIcon, LinkIcon, LockIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'
import { useRef, useState } from 'react'

import type { getVotePageData } from '@/lib/communities/jury-service'

import { uploadJuryEvidenceAction } from '@/app/[locale]/(platform)/_actions/jury'
import { castJuryVoteAction } from '@/app/[locale]/(platform)/community/[slug]/_actions/community-actions'
import { formatCloseLabel, formatMoney, formatShortCountdown, initials } from '@/components/communities/format'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * A juror's sealed vote: the rule, the other seats and where they stand,
 * Yes / No (or void), a reason with a live counter, and the source read,
 * as a link or a photo. After submitting: sealed, what happens next, and
 * the pay this market carries.
 */

type VotePageData = NonNullable<Awaited<ReturnType<typeof getVotePageData>>>
type Choice = 'yes' | 'no' | 'disputed'

interface VoteFormProps {
  data: VotePageData
  username: string | null
  nextDue: { marketId: string; title: string; dueAt: string | null } | null
  serverNow: number
}

function Seat({ seat, isYou, writing }: { seat: VotePageData['seats'][number]; isYou: boolean; writing: boolean }) {
  const t = useExtracted()
  const state = seat.votedAt ? t('Sealed') : isYou && writing ? t('Writing') : t('Not yet')
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-[11px] font-semibold">
        {seat.image ? <img src={seat.image} alt="" className="size-full object-cover" /> : initials(seat.username)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {isYou ? t('You') : seat.username ? `@${seat.username}` : t('Juror')}
      </span>
      <span
        className={cn(
          'inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold',
          seat.votedAt
            ? 'bg-secondary text-secondary-foreground'
            : 'border border-dashed border-muted-foreground/40 text-muted-foreground',
        )}
      >
        {seat.votedAt ? <LockIcon className="size-3" aria-hidden="true" /> : null}
        {state}
      </span>
    </li>
  )
}

export default function VoteForm({ data, username, nextDue, serverNow }: VoteFormProps) {
  const t = useExtracted()
  const locale = useLocale()
  const tick = useNowTimestamp()
  const now = tick ?? serverNow
  const { market, community, seats, myVote, minReasonChars } = data
  const [choice, setChoice] = useState<Choice | null>(myVote?.vote ?? null)
  const [reason, setReason] = useState(myVote?.reasoning ?? '')
  const [sourceKind, setSourceKind] = useState<'link' | 'photo'>(myVote?.sourceType === 'photo' ? 'photo' : 'link')
  const [sourceUrl, setSourceUrl] = useState(myVote?.sourceType === 'photo' ? '' : (myVote?.sourceUrl ?? ''))
  const [photoUrl, setPhotoUrl] = useState(myVote?.sourceType === 'photo' ? (myVote?.sourceUrl ?? '') : '')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sealed, setSealed] = useState(false)
  const [votedCount, setVotedCount] = useState(seats.filter((seat) => seat.votedAt).length)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const remaining = Math.max(0, minReasonChars - reason.trim().length)
  const dueMs = market.dueAt ? new Date(market.dueAt).getTime() - now : null
  const closed = market.closesAt !== null && new Date(market.closesAt).getTime() <= now
  const decided = market.status !== 'active' || market.revealedAt !== null
  const source = sourceKind === 'photo' ? photoUrl : sourceUrl.trim()
  const canSubmit = Boolean(choice) && remaining === 0 && source.length > 0 && !submitting && !uploading
  const yesLabel = market.outcomeYes ?? t('Yes')
  const noLabel = market.outcomeNo ?? t('No')
  const marketHref = `/community/${community.slug}/market/${market.id}`

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.set('file', file)
      const result = await uploadJuryEvidenceAction(form)
      if (result.error || !result.data) {
        toast.error(result.error ?? t('Could not upload the image.'))
        return
      }
      setPhotoUrl(result.data.url)
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    if (!choice || !canSubmit) {
      return
    }
    setSubmitting(true)
    try {
      const result = await castJuryVoteAction(market.id, community.id, community.slug, {
        vote: choice,
        reasoning: reason.trim(),
        evidence_url: source,
        source_type: sourceKind,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (!myVote) {
        setVotedCount((count) => count + 1)
      }
      setSealed(true)
    } finally {
      setSubmitting(false)
    }
  }

  const header = (
    <header className="flex flex-col gap-2">
      <Link href="/jury" className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
        <GavelIcon className="size-4" aria-hidden="true" />
        {t('Jury duty')}
      </Link>
      <p className="text-xs font-semibold text-muted-foreground">{community.name}</p>
      <h1 className="text-[22px]/tight font-bold sm:text-[26px]/tight">{market.title}</h1>
    </header>
  )

  if (!data.seated) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <p className="rounded-xl border border-border bg-card p-4 text-sm">
          {t('You are not seated on this market’s jury.')}{' '}
          <Link href={marketHref} className="font-semibold underline underline-offset-[3px]">
            {t('See the market')}
          </Link>
        </p>
      </div>
    )
  }

  if (decided) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <p className="rounded-xl border border-border bg-card p-4 text-sm">
          {t('The votes on this market are open and the result is in.')}{' '}
          <Link href={marketHref} className="font-semibold underline underline-offset-[3px]">
            {t('Read every verdict')}
          </Link>
        </p>
      </div>
    )
  }

  if (!closed) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <p className="rounded-xl border border-border bg-card p-4 text-sm tabular-nums">
          {market.closesAt
            ? t('Voting opens when this market closes, {time}.', {
                time: formatCloseLabel(market.closesAt, locale, now),
              })
            : t('Voting opens when this market closes.')}
        </p>
      </div>
    )
  }

  if (sealed) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex size-11 items-center justify-center rounded-full bg-secondary">
            <CheckIcon className="size-6" strokeWidth={2.5} aria-hidden="true" />
          </div>
          <h2 className="text-[22px]/tight font-bold">{t('Your vote is in and sealed')}</h2>
          <p className="text-sm/relaxed text-muted-foreground tabular-nums">
            {t('{voted} of {seats} jurors have voted. All votes open together when the last one is in{deadline}.', {
              voted: String(votedCount),
              seats: String(market.seatCount),
              deadline: market.dueAt ? t(', or at {time}', { time: formatCloseLabel(market.dueAt, locale) }) : '',
            })}
          </p>
          <p className="text-sm font-semibold">
            {t('You voted {vote}, with 1 source', {
              vote: choice === 'yes' ? yesLabel.toUpperCase() : choice === 'no' ? noLabel.toUpperCase() : t('VOID'),
            })}
          </p>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">{t('What happens next')}</p>
            <ol className="mt-1 flex flex-col gap-1 text-sm/relaxed">
              <li>
                {t('All {seats} verdicts are revealed together, with names, reasons and sources.', {
                  seats: String(market.seatCount),
                })}
              </li>
              <li>
                {t('If {required} agree, stakers are told the result and payouts are held for 24 hours.', {
                  required: String(market.requiredVotes),
                })}
              </li>
              <li>{t('If no appeal is backed in that time, winners are paid, and so are you.')}</li>
            </ol>
          </div>
          <div className="rounded-xl bg-secondary p-4 tabular-nums">
            <p className="text-xs font-semibold text-muted-foreground">{t('Your pay for this market')}</p>
            <p className="text-[22px]/tight font-bold">
              {t('about {amount}', { amount: formatMoney(data.payEstimateMinor, community.currency) })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                'Your share of the jury’s slice of the pool fee. Paid with the winners; lost if the verdict is overturned.',
              )}
            </p>
          </div>
          {nextDue ? (
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href={`/jury/${nextDue.marketId}`} />}
              className="h-12 rounded-md text-base font-bold"
            >
              {t('Next vote: {title}', { title: nextDue.title })}
            </Button>
          ) : (
            <Button
              size="lg"
              variant="secondary"
              nativeButton={false}
              render={<Link href="/jury" />}
              className="h-12 rounded-md text-base font-bold"
            >
              {t('Back to jury duty')}
            </Button>
          )}
          <button
            type="button"
            onClick={() => setSealed(false)}
            className="self-center text-xs font-semibold underline underline-offset-[3px]"
          >
            {t('Change your vote')}
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {header}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-5">
          <section className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground">{t('The rule')}</p>
            <p className="mt-1 text-sm/relaxed">{market.resolutionRules ?? t('Resolve as the question is written.')}</p>
            {market.resolutionSource ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('Source named at creation: {source}', { source: market.resolutionSource })}
              </p>
            ) : null}
          </section>

          <section
            className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
            aria-label={t('Your verdict')}
          >
            <h2 className="text-[17px] font-bold">{myVote ? t('Change your verdict') : t('Your verdict')}</h2>
            <div role="radiogroup" aria-label={t('Verdict')} className="grid grid-cols-2 gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={choice === 'yes'}
                onClick={() => setChoice('yes')}
                className={cn(
                  'h-12 rounded-md text-base font-bold transition-colors',
                  choice === 'yes' ? 'bg-yes text-background' : 'bg-yes/15 text-yes',
                )}
              >
                {yesLabel}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={choice === 'no'}
                onClick={() => setChoice('no')}
                className={cn(
                  'h-12 rounded-md text-base font-bold transition-colors',
                  choice === 'no' ? 'bg-no text-background' : 'bg-no/15 text-no-text',
                )}
              >
                {noLabel}
              </button>
            </div>
            <button
              type="button"
              role="radio"
              aria-checked={choice === 'disputed'}
              onClick={() => setChoice('disputed')}
              className={cn(
                'flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors',
                choice === 'disputed' ? 'bg-foreground text-background' : 'bg-secondary text-secondary-foreground',
              )}
            >
              <AlertCircleIcon className="size-4" aria-hidden="true" />
              {t('Void this market (refund everyone)')}
            </button>

            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted-foreground">
              {t('Why? Say what the source shows')}
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('What did the source say, and how did you read it?')}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground"
                rows={5}
                maxLength={1500}
              />
              <span className="text-xs tabular-nums">
                {remaining > 0
                  ? t('At least {min} characters, {count} so far.', {
                      min: String(minReasonChars),
                      count: String(reason.trim().length),
                    })
                  : t('{count} characters. Minimum {min}.', {
                      count: String(reason.trim().length),
                      min: String(minReasonChars),
                    })}
              </span>
            </label>

            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-medium text-muted-foreground">{t('Source')}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSourceKind('link')}
                  className={cn(
                    'flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors',
                    sourceKind === 'link' ? 'bg-foreground text-background' : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  <LinkIcon className="size-4" aria-hidden="true" />
                  {t('Link')}
                </button>
                <button
                  type="button"
                  onClick={() => setSourceKind('photo')}
                  className={cn(
                    'flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors',
                    sourceKind === 'photo' ? 'bg-foreground text-background' : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  <CameraIcon className="size-4" aria-hidden="true" />
                  {t('Photo or screenshot')}
                </button>
              </div>
              {sourceKind === 'link' ? (
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://"
                  className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground"
                />
              ) : (
                <div className="flex items-center gap-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void handleUpload(file)
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? t('Uploading…') : photoUrl ? t('Replace photo') : t('Choose a photo')}
                  </Button>
                  {photoUrl ? (
                    <a
                      href={photoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-xs font-semibold underline underline-offset-[3px]"
                    >
                      {t('Photo attached')}
                    </a>
                  ) : null}
                </div>
              )}
            </div>

            <p className="text-xs/relaxed text-muted-foreground">
              {t(
                'Sealed until all {seats} jurors vote. Then it’s public with your name and can’t be edited; corrections go in a dated note.',
                { seats: String(market.seatCount) },
              )}
            </p>

            <Button
              type="button"
              size="lg"
              className="h-13 rounded-md text-base font-bold shadow-lg shadow-primary/20"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
            >
              <LockIcon className="size-4" aria-hidden="true" />
              {submitting ? t('Sealing…') : t('Submit sealed vote')}
            </Button>
            {!canSubmit && !submitting ? (
              <p className="text-center text-xs text-muted-foreground tabular-nums">
                {!choice
                  ? t('Pick a verdict first.')
                  : remaining > 0
                    ? t('Write {count} more characters to submit.', { count: String(remaining) })
                    : source.length === 0
                      ? t('Add the source you read.')
                      : ''}
              </p>
            ) : null}
          </section>

          <p className="text-xs text-muted-foreground tabular-nums">
            {t('Voting as {name}.', { name: username ? `@${username}` : t('you') })}{' '}
            {market.dueAt ? t('Due {time}.', { time: formatCloseLabel(market.dueAt, locale) }) : ''}
          </p>
        </div>

        <aside className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-border bg-card p-4 text-sm tabular-nums">
            <dt className="text-muted-foreground">{t('Closed')}</dt>
            <dd>{market.closesAt ? formatCloseLabel(market.closesAt, locale) : '—'}</dd>
            <dt className="text-muted-foreground">{t('Due')}</dt>
            <dd>{market.dueAt ? formatCloseLabel(market.dueAt, locale) : '—'}</dd>
            <dt className="text-muted-foreground">{t('Time left')}</dt>
            <dd className={cn(dueMs !== null && dueMs < 2 * 60 * 60 * 1000 && 'font-semibold text-no-text')}>
              {dueMs === null ? '—' : formatShortCountdown(Math.max(0, dueMs))}
            </dd>
            <dt className="text-muted-foreground">{t('Pool')}</dt>
            <dd>{formatMoney(data.poolMinor, community.currency)}</dd>
          </dl>
          <section className="rounded-xl border border-border bg-card p-4" aria-label={t('Jury')}>
            <p className="text-xs font-semibold text-muted-foreground">{t('Jury')}</p>
            <ul className="mt-1 divide-y divide-border">
              {seats.map((seat) => (
                <Seat
                  key={seat.userId}
                  seat={seat}
                  isYou={username !== null && seat.username === username}
                  writing={reason.length > 0}
                />
              ))}
            </ul>
            <p className="mt-2 text-xs/relaxed text-muted-foreground tabular-nums">
              {t(
                '{required} of {seats} must agree. If the jury misses the deadline, every staker is refunded and nobody is paid.',
                {
                  required: String(market.requiredVotes),
                  seats: String(market.seatCount),
                },
              )}
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
