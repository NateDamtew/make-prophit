'use client'

import { CheckIcon, LinkIcon, ScaleIcon, XIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'
import { useMemo, useRef, useState } from 'react'

import type { AppealView } from '@/lib/communities/appeals-service'

import {
  backAppealAction,
  fileAppealAction,
  withdrawAppealAction,
} from '@/app/[locale]/(platform)/_actions/appeal-actions'
import { uploadJuryEvidenceAction } from '@/app/[locale]/(platform)/_actions/jury'
import { formatCloseLabel, formatMoney, formatShortCountdown, initials } from '@/components/communities/format'
import { AppealProgress } from '@/components/communities/lifecycle/AppealProgress'
import { CommunitySheet } from '@/components/communities/sheet/CommunitySheet'
import { AmountChips } from '@/components/communities/stake/AmountChips'
import { AmountInput } from '@/components/communities/stake/AmountInput'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useAppKit } from '@/hooks/useAppKit'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { Link, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

import type { AppealViewerState } from '../../_components/pool/pool-market-types'

import { ClaimPill } from '../../_components/pool/MarketAppealSection'

/**
 * The appeal page in every state: file one (any staker, during the hold),
 * an open appeal gathering backers with the back-this-appeal sheet, Prophit
 * reviewing, and the ruling with where the money went.
 */

const MIN_BACK_MAJOR = 200

interface AppealPageProps {
  market: {
    id: string
    title: string
    resolvedOutcome: string | null
    outcomeYes: string | null
    outcomeNo: string | null
    jurySeatCount: number | null
  }
  community: { id: string; slug: string; name: string }
  appeal: AppealView | null
  viewer: AppealViewerState | null
  pool: {
    state: string
    settledOutcome: string | null
    holdUntil: string | null
    holdExtendedUntil: string | null
    payoutsFrozen: boolean
    totalMinor: string
    currency: string
  } | null
  votes: Array<{ id: string; vote: string; username: string | null; image: string | null }>
  signedIn: boolean
  serverNow: number
}

function Avatar({ username, image }: { username: string | null; image: string | null }) {
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-[11px] font-semibold">
      {image ? <img src={image} alt="" className="size-full object-cover" /> : initials(username)}
    </span>
  )
}

function Header({
  community,
  market,
  title,
}: {
  community: AppealPageProps['community']
  market: AppealPageProps['market']
  title: string
}) {
  const t = useExtracted()
  return (
    <header className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link href={`/community/${community.slug}`} className="hover:underline">
          {community.name}
        </Link>
        <span>/</span>
        <Link href={`/community/${community.slug}/market/${market.id}`} className="truncate hover:underline">
          {market.title}
        </Link>
        <span>/</span>
        <span>{t('Appeal')}</span>
      </p>
      <h1 className="flex items-center gap-2 text-[22px]/tight font-bold sm:text-[26px]/tight">
        <ScaleIcon className="size-5 shrink-0" aria-hidden="true" />
        {title}
      </h1>
    </header>
  )
}

function JurySummary({
  votes,
  outcome,
  outcomeLabels,
  seats,
}: {
  votes: AppealPageProps['votes']
  outcome: string | null
  outcomeLabels: { yes: string; no: string }
  seats: number
}) {
  const t = useExtracted()
  const agreed = votes.filter((vote) => vote.vote === outcome).length
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold text-muted-foreground">{t('The result you’re appealing')}</p>
      <div className="mt-2 flex items-center gap-3">
        {outcome === 'yes' || outcome === 'no' ? (
          <ClaimPill claim={outcome} outcomeLabels={outcomeLabels} size="lg" />
        ) : null}
        <span className="text-sm text-muted-foreground tabular-nums">
          {t('{agreed} of {seats} jurors', { agreed: String(agreed), seats: String(seats) })}
        </span>
      </div>
      <ul className="mt-3 divide-y divide-border">
        {votes.map((vote) => (
          <li key={vote.id} className="flex items-center gap-3 py-2 text-sm">
            <Avatar username={vote.username} image={vote.image} />
            <span className="min-w-0 flex-1 truncate font-semibold">
              {vote.username ? `@${vote.username}` : t('Juror')}
              {vote.vote !== outcome ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">{t('dissent')}</span>
              ) : null}
            </span>
            {vote.vote === 'yes' || vote.vote === 'no' ? (
              <ClaimPill claim={vote.vote} outcomeLabels={outcomeLabels} />
            ) : (
              <span className="text-xs text-muted-foreground">
                {vote.vote === 'disputed' ? t('Void') : t('Sealed')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function FileForm({
  market,
  community,
  viewer,
  pool,
  now,
}: Pick<AppealPageProps, 'market' | 'community' | 'viewer' | 'pool'> & { now: number }) {
  const t = useExtracted()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const outcomeLabels = { yes: market.outcomeYes ?? t('Yes'), no: market.outcomeNo ?? t('No') }
  const original = pool?.settledOutcome === 'no' ? 'no' : 'yes'
  const flipTo = original === 'yes' ? 'no' : 'yes'
  const [claim, setClaim] = useState<'yes' | 'no' | 'cancelled'>(flipTo)
  const [reason, setReason] = useState('')
  const [links, setLinks] = useState<Array<{ type: 'link' | 'photo'; url: string; label?: string | null }>>([])
  const [linkInput, setLinkInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const remaining = pool?.holdUntil ? Math.max(0, new Date(pool.holdUntil).getTime() - now) : null
  const poolMinor = BigInt(pool?.totalMinor ?? '0')
  const tenPercent = poolMinor / 10n
  const escrowTarget = tenPercent > BigInt(MIN_BACK_MAJOR * 100) ? tenPercent : BigInt(MIN_BACK_MAJOR * 100)
  const canSubmit = reason.trim().length >= 40 && !submitting && !uploading

  function addLink() {
    const url = linkInput.trim()
    if (!/^https?:\/\//.test(url)) {
      toast.error(t('Paste a full link, starting with https://'))
      return
    }
    setLinks((prev) => [...prev, { type: 'link' as const, url }].slice(0, 5))
    setLinkInput('')
  }

  async function upload(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.set('file', file)
      const result = await uploadJuryEvidenceAction(form)
      if (result.error || !result.data) {
        toast.error(result.error ?? t('Could not upload the image.'))
        return
      }
      const url = result.data.url
      setLinks((prev) => [...prev, { type: 'photo' as const, url, label: t('Photo') }].slice(0, 5))
    } finally {
      setUploading(false)
    }
  }

  async function submit() {
    setSubmitting(true)
    try {
      const result = await fileAppealAction({
        marketId: market.id,
        communitySlug: community.slug,
        claimedOutcome: claim,
        reason: reason.trim(),
        evidence: links,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('Your appeal is on the market page.'))
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <p className="text-sm/relaxed text-muted-foreground tabular-nums">
          {viewer?.staked
            ? t('You staked {amount} on {side}.', {
                amount: formatMoney(viewer.stakeMinor, pool?.currency),
                side:
                  viewer.stakeSide === 'yes'
                    ? outcomeLabels.yes
                    : viewer.stakeSide === 'no'
                      ? outcomeLabels.no
                      : t('both sides'),
              })
            : ''}{' '}
          {remaining !== null
            ? t('Payouts are held for {time} more, so there’s time.', { time: formatShortCountdown(remaining) })
            : ''}
        </p>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-medium text-muted-foreground">{t('What should the result be?')}</legend>
          {(
            [
              { value: flipTo, label: outcomeLabels[flipTo], hint: t('the jury read the source wrong') },
              { value: 'cancelled', label: t('Void it'), hint: t('the question was unclear') },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm',
                claim === option.value ? 'border-foreground' : 'border-border',
              )}
            >
              <input
                type="radio"
                name="claim"
                checked={claim === option.value}
                onChange={() => setClaim(option.value)}
                className="accent-primary"
              />
              <span className="font-semibold">{option.label}</span>
              <span className="text-muted-foreground">{option.hint}</span>
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted-foreground">
          {t('Why is the jury wrong?')}
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={5}
            maxLength={2000}
            placeholder={t('Point at the rule and the source. Say what they show.')}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground"
          />
          <span className="text-xs tabular-nums">
            {reason.trim().length < 40
              ? t('At least 40 characters, {count} so far.', { count: String(reason.trim().length) })
              : t('{count} characters.', { count: String(reason.trim().length) })}
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-muted-foreground">{t('Evidence')}</p>
          {links.map((item, index) => (
            <p
              key={`${item.url}-${index}`}
              className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs"
            >
              <LinkIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{item.label ?? item.url}</span>
              <button
                type="button"
                aria-label={t('Remove')}
                onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}
              >
                <XIcon className="size-3.5" aria-hidden="true" />
              </button>
            </p>
          ))}
          <div className="flex gap-2">
            <input
              type="url"
              value={linkInput}
              onChange={(event) => setLinkInput(event.target.value)}
              placeholder="https://"
              className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground"
            />
            <Button type="button" variant="secondary" onClick={addLink} disabled={links.length >= 5}>
              {t('Add')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  void upload(file)
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || links.length >= 5}
            >
              {uploading ? t('Uploading…') : t('Photo')}
            </Button>
          </div>
        </div>

        <div className="rounded-xl bg-secondary p-3.5 text-sm/relaxed tabular-nums">
          <p className="font-semibold">{t('Free to file. Here’s what happens next.')}</p>
          <p className="mt-1 text-muted-foreground">
            {t(
              'Your appeal goes on the market page. Other people who staked on this market can back it with money. If 12 people or {amount} back it within the window, every payout is paused and Prophit reviews it.',
              { amount: formatMoney(escrowTarget, pool?.currency) },
            )}
          </p>
        </div>

        <Button
          size="lg"
          className="h-13 rounded-md text-base font-bold shadow-lg shadow-primary/20"
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {submitting ? t('Filing…') : t('File appeal')}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t('Only stakers on this market can appeal. One appeal is reviewed at a time.')}
        </p>
      </section>
    </div>
  )
}

function BackSheet({
  open,
  onOpenChange,
  appeal,
  market,
  community,
  viewer,
  outcomeLabels,
  onBacked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  appeal: AppealView
  market: AppealPageProps['market']
  community: AppealPageProps['community']
  viewer: AppealViewerState
  outcomeLabels: { yes: string; no: string }
  onBacked: (result: {
    amountMinor: bigint
    backerCount: number
    escrowTotalMinor: string
    thresholdMet: boolean
  }) => void
}) {
  const t = useExtracted()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [amount, setAmount] = useState(String(MIN_BACK_MAJOR))
  const [submitting, setSubmitting] = useState(false)
  const amountNumber = Number.parseInt(amount, 10) || 0
  const amountMinor = BigInt(Math.max(0, amountNumber)) * 100n
  const available = BigInt(viewer.availableMinor)
  const belowMin = amountMinor > 0n && amountMinor < BigInt(MIN_BACK_MAJOR * 100)
  const short = amountMinor > available
  const canSubmit = amountMinor > 0n && !belowMin && !short && !submitting
  const nextBackers = appeal.backerCount + 1
  const nextEscrow = BigInt(appeal.escrowTotalMinor) + amountMinor

  async function submit() {
    setSubmitting(true)
    try {
      const result = await backAppealAction({
        appealId: appeal.id,
        marketId: market.id,
        communitySlug: community.slug,
        amountInput: String(amountNumber),
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(
        result.data?.thresholdMet
          ? t('That filled the line. Prophit is reviewing the result.')
          : t('Thanks. Your escrow is held until the ruling.'),
      )
      onOpenChange(false)
      if (result.data) {
        onBacked({ amountMinor, ...result.data })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CommunitySheet open={open} onOpenChange={onOpenChange} title={t('Back this appeal')}>
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{t('Back this appeal')}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              {appeal.filedBy.username ? `@${appeal.filedBy.username}` : t('A staker')} {t('says the result should be')}
              <ClaimPill claim={appeal.claimedOutcome} outcomeLabels={outcomeLabels} />
            </p>
          </div>
          <button
            type="button"
            aria-label={t('Close')}
            onClick={() => onOpenChange(false)}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary"
          >
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <AmountInput
            value={amount}
            onChange={setAmount}
            currency={appeal.currency}
            inputRef={inputRef}
            label={t('Amount to hold in escrow')}
            attention={short}
            message={
              belowMin
                ? t('Minimum {min}.', { min: formatMoney(BigInt(MIN_BACK_MAJOR * 100), appeal.currency) })
                : short
                  ? t('That is more than your balance of {balance}.', {
                      balance: formatMoney(available, appeal.currency),
                    })
                  : null
            }
          />
          <AmountChips
            values={[200, 500, 1000]}
            selected={amountNumber > 0 ? amountNumber : null}
            onPick={(value) => {
              setAmount(String(value))
              inputRef.current?.focus()
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {t('Minimum {min}. You staked {stake} on {side}. Balance {balance}.', {
            min: formatMoney(BigInt(MIN_BACK_MAJOR * 100), appeal.currency),
            stake: formatMoney(viewer.stakeMinor, appeal.currency),
            side:
              viewer.stakeSide === 'yes' ? outcomeLabels.yes : viewer.stakeSide === 'no' ? outcomeLabels.no : t('both'),
            balance: formatMoney(available, appeal.currency),
          })}
        </p>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 rounded-xl bg-secondary p-3.5 text-sm tabular-nums">
          <dt className="text-muted-foreground">{t('If the appeal wins or is voided')}</dt>
          <dd className="font-semibold">{t('{amount} back', { amount: formatMoney(amountMinor, appeal.currency) })}</dd>
          <dt className="text-muted-foreground">{t('If it is rejected')}</dt>
          <dd className="font-semibold">{t('{amount} lost', { amount: formatMoney(amountMinor, appeal.currency) })}</dd>
        </dl>
        <Button
          size="lg"
          className="h-13 rounded-md text-base font-bold shadow-lg shadow-primary/20"
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {submitting ? t('Holding…') : t('Back with {amount}', { amount: formatMoney(amountMinor, appeal.currency) })}
        </Button>
        <p className="text-center text-xs/relaxed text-muted-foreground tabular-nums">
          {t(
            'Yours would make {backers} of {needed} backers and {escrow} of {target}. Lost escrow goes to the jurors and owner who were right.',
            {
              backers: String(nextBackers),
              needed: String(appeal.backersNeeded),
              escrow: formatMoney(nextEscrow, appeal.currency),
              target: formatMoney(appeal.escrowTargetMinor, appeal.currency),
            },
          )}
        </p>
      </div>
    </CommunitySheet>
  )
}

function OpenAppeal({
  appeal: initialAppeal,
  market,
  community,
  viewer: initialViewer,
  votes,
  outcomeLabels,
  now,
  signedIn,
}: Pick<AppealPageProps, 'market' | 'community' | 'viewer' | 'votes' | 'signedIn'> & {
  appeal: AppealView
  outcomeLabels: { yes: string; no: string }
  now: number
}) {
  const t = useExtracted()
  const locale = useLocale()
  const router = useRouter()
  const { open: openAppKit } = useAppKit()
  // Backing updates the page at once; the refresh behind it brings the full backer list.
  const [appeal, setAppeal] = useState(initialAppeal)
  const [viewer, setViewer] = useState(initialViewer)
  const [backOpen, setBackOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const remaining = Math.max(0, new Date(appeal.windowEndsAt).getTime() - now)
  const reviewing = appeal.status !== 'open'
  const shownBackers = appeal.backers.slice(0, 3)
  const rest = appeal.backers.slice(3)
  const restMinor = rest.reduce((sum, backer) => sum + BigInt(backer.amountMinor), 0n)

  async function withdraw() {
    setWithdrawing(true)
    try {
      const result = await withdrawAppealAction({
        appealId: appeal.id,
        marketId: market.id,
        communitySlug: community.slug,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('Appeal withdrawn. Every backer’s escrow is back.'))
      router.refresh()
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">{t('The jury says')}</p>
              <div className="mt-1.5">
                <ClaimPill claim={appeal.originalOutcome} outcomeLabels={outcomeLabels} size="lg" />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                {t('{agreed} of {seats} jurors', {
                  agreed: String(votes.filter((vote) => vote.vote === appeal.originalOutcome).length),
                  seats: String(market.jurySeatCount ?? votes.length),
                })}
              </p>
            </div>
            <span className="self-center text-xs font-bold text-muted-foreground uppercase">{t('vs')}</span>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                {appeal.filedBy.username ? `@${appeal.filedBy.username} ${t('says')}` : t('The appeal says')}
              </p>
              <div className="mt-1.5">
                <ClaimPill claim={appeal.claimedOutcome} outcomeLabels={outcomeLabels} size="lg" />
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">{t('The claim')}</p>
            <p className="mt-1 text-sm/relaxed">“{appeal.reason}”</p>
          </div>
          {appeal.evidence.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">{t('Evidence')}</p>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {appeal.evidence.map((item, index) => (
                  <li key={`${item.url}-${index}`}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline underline-offset-[3px]"
                    >
                      {item.label || (item.type === 'photo' ? t('Photo') : item.url.replace(/^https?:\/\//, ''))}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label={t('Backers')}>
          <h2 className="text-[15px] font-bold">{t('Backers')}</h2>
          {appeal.backers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('Nobody has backed it yet.')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {shownBackers.map((backer) => (
                <li key={backer.userId} className="flex items-center gap-3 py-2 text-sm">
                  <Avatar username={backer.username} image={backer.image} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {backer.username ? `@${backer.username}` : t('Staker')}
                      {backer.isFiler ? (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">{t('filed it')}</span>
                      ) : null}
                    </span>
                    {backer.stakeSide ? (
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {t('staked {amount} on {side}', {
                          amount: formatMoney(backer.stakeMinor, appeal.currency),
                          side:
                            backer.stakeSide === 'yes'
                              ? outcomeLabels.yes
                              : backer.stakeSide === 'no'
                                ? outcomeLabels.no
                                : t('both'),
                        })}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-semibold tabular-nums">{formatMoney(backer.amountMinor, appeal.currency)}</span>
                </li>
              ))}
              {rest.length > 0 ? (
                <li className="py-2 text-xs text-muted-foreground tabular-nums">
                  {t('and {count} more, {amount} between them', {
                    count: String(rest.length),
                    amount: formatMoney(restMinor, appeal.currency),
                  })}
                </li>
              ) : null}
            </ul>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold">{t('Backing so far')}</h2>
            {!reviewing ? (
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {t('{time} left', { time: formatShortCountdown(remaining) })}
              </span>
            ) : null}
          </div>
          <AppealProgress
            backers={appeal.backerCount}
            backersNeeded={appeal.backersNeeded}
            escrowMinor={appeal.escrowTotalMinor}
            escrowTargetMinor={appeal.escrowTargetMinor}
            currency={appeal.currency}
            state={reviewing ? 'met' : 'open'}
          />
          <p className="text-xs/relaxed text-muted-foreground tabular-nums">
            {reviewing
              ? t(
                  'Enough stakers backed it. Every payout on this market is paused until Prophit rules. Prophit aims to rule within 3 days.',
                )
              : t(
                  'When either line fills, every payout on this market pauses and Prophit reviews it. The window is extended to {time} because an appeal is live.',
                  { time: formatCloseLabel(appeal.windowEndsAt, locale) },
                )}
          </p>
          <p className="text-xs/relaxed text-muted-foreground">
            {t('Escrow is returned if the appeal wins or the market is voided, and lost if it is rejected.')}
          </p>
          {!reviewing && viewer?.canBack ? (
            <Button
              size="lg"
              className="h-12 rounded-md text-base font-bold shadow-lg shadow-primary/20"
              onClick={() => setBackOpen(true)}
            >
              {t('Back this appeal')}
            </Button>
          ) : !reviewing && !signedIn ? (
            <Button size="lg" className="h-12 rounded-md text-base font-bold" onClick={() => void openAppKit()}>
              {t('Sign in to back it')}
            </Button>
          ) : null}
          {viewer && BigInt(viewer.backedMinor) > 0n ? (
            <p className="text-sm font-semibold tabular-nums">
              {t('You backed it with {amount}.', { amount: formatMoney(viewer.backedMinor, appeal.currency) })}
            </p>
          ) : viewer?.staked && !reviewing && !viewer.canBack ? null : viewer && !viewer.staked && signedIn ? (
            <p className="text-xs text-muted-foreground">{t('Only stakers on this market can back it.')}</p>
          ) : viewer?.staked ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              {t('You staked {amount} on {side}, so you can back it.', {
                amount: formatMoney(viewer.stakeMinor, appeal.currency),
                side:
                  viewer.stakeSide === 'yes'
                    ? outcomeLabels.yes
                    : viewer.stakeSide === 'no'
                      ? outcomeLabels.no
                      : t('both'),
              })}
            </p>
          ) : null}
          {!reviewing && viewer?.isFiler ? (
            <Button variant="ghost" className="self-center" disabled={withdrawing} onClick={() => void withdraw()}>
              {withdrawing ? t('Withdrawing…') : t('Withdraw the appeal')}
            </Button>
          ) : null}
        </section>
        <JurySummary
          votes={votes}
          outcome={appeal.originalOutcome}
          outcomeLabels={outcomeLabels}
          seats={market.jurySeatCount ?? votes.length}
        />
      </aside>

      {viewer?.canBack ? (
        <BackSheet
          open={backOpen}
          onOpenChange={setBackOpen}
          appeal={appeal}
          market={market}
          community={community}
          viewer={viewer}
          outcomeLabels={outcomeLabels}
          onBacked={(result) => {
            setAppeal((prev) => ({
              ...prev,
              backerCount: result.backerCount,
              escrowTotalMinor: result.escrowTotalMinor,
              status: result.thresholdMet ? 'threshold_met' : prev.status,
            }))
            setViewer((prev) => (prev ? { ...prev, backedMinor: result.amountMinor.toString(), canBack: false } : prev))
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function Ruling({
  appeal,
  market,
  community,
  viewer,
  votes,
  outcomeLabels,
}: Pick<AppealPageProps, 'market' | 'community' | 'viewer' | 'votes'> & {
  appeal: AppealView
  outcomeLabels: { yes: string; no: string }
}) {
  const t = useExtracted()
  const locale = useLocale()
  const ruling = appeal.ruling ?? 'rejected'
  // What the market became under the ruling: an upheld claim nobody staked on refunds instead.
  const finalOutcome =
    market.resolvedOutcome === 'yes' || market.resolvedOutcome === 'no' ? market.resolvedOutcome : 'cancelled'
  const headline =
    ruling === 'rejected'
      ? t('The result stands')
      : finalOutcome === 'cancelled'
        ? t('The market was voided')
        : t('The result is now {outcome}', {
            outcome: finalOutcome === 'yes' ? outcomeLabels.yes : outcomeLabels.no,
          })
  const backed = viewer ? BigInt(viewer.backedMinor) : 0n
  const youLine =
    backed > 0n
      ? ruling === 'rejected'
        ? t('Your {amount} escrow was lost. It went to the jurors and owner who were right.', {
            amount: formatMoney(backed, appeal.currency),
          })
        : t('Your {amount} escrow is back in your balance.', { amount: formatMoney(backed, appeal.currency) })
      : viewer?.staked
        ? finalOutcome === 'cancelled'
          ? t('Your stake is back in your balance.')
          : t('Payouts have been released on the ruled result.')
        : null
  const opinions = appeal.opinions.filter((opinion) => opinion.opinion !== null)

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <span
            className={cn(
              'inline-flex h-7 w-fit items-center rounded-full px-3 text-xs font-bold uppercase',
              ruling === 'rejected' && 'bg-secondary text-secondary-foreground',
              ruling === 'upheld' && 'bg-yes/15 text-yes',
              ruling === 'voided' && 'border border-border text-foreground',
            )}
          >
            {ruling === 'rejected' ? t('Appeal rejected') : ruling === 'upheld' ? t('Appeal upheld') : t('Voided')}
          </span>
          <h2 className="text-[22px]/tight font-bold">{headline}</h2>
          {appeal.ruledAt ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              {t('Ruled {time}', { time: formatCloseLabel(appeal.ruledAt, locale) })}
            </p>
          ) : null}
          {youLine ? (
            <div className="rounded-xl bg-secondary p-3.5 text-sm">
              <p className="text-xs font-semibold text-muted-foreground">{t('For you')}</p>
              <p className="mt-1">{youLine}</p>
            </div>
          ) : null}
          <div>
            <p className="text-xs font-semibold text-muted-foreground">{t('Why')}</p>
            <p className="mt-1 text-sm/relaxed">{appeal.rulingText}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">{t('Who decided')}</p>
            <p className="mt-1 text-sm/relaxed text-muted-foreground">
              {opinions.length > 0
                ? t(
                    'Prophit’s appeals desk, with {count} jurors drawn from other communities. None of them had a stake.',
                    {
                      count: String(opinions.length),
                    },
                  )
                : t('Prophit’s appeals desk.')}
            </p>
            {opinions.length > 0 ? (
              <ul className="mt-2 divide-y divide-border">
                {opinions.map((opinion, index) => (
                  <li key={`${opinion.username}-${index}`} className="flex items-center gap-3 py-2 text-sm">
                    <Avatar username={opinion.username} image={opinion.image} />
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {opinion.username ? `@${opinion.username}` : t('Juror')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {opinion.opinion === 'stand'
                        ? t('result stands')
                        : opinion.opinion === 'flip'
                          ? t('flip it')
                          : t('void it')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {ruling === 'upheld'
              ? t('Trust: the community drops a level. The jurors who were overturned carry it on their record.')
              : ruling === 'rejected'
                ? t('Trust: no change for the community or its jurors.')
                : t('Trust: no fee was earned on this market.')}
            {finalOutcome === 'cancelled' && ruling === 'upheld'
              ? ` ${t('Nobody had staked on the claimed side, so every stake went back instead.')}`
              : ''}
          </p>
          <Button
            variant="secondary"
            nativeButton={false}
            render={<Link href={`/community/${community.slug}/market/${market.id}`} />}
            className="h-11 self-start rounded-md"
          >
            {t('Back to the market')}
          </Button>
        </section>
      </div>
      <aside className="flex flex-col gap-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">{t('The appeal')}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">
              {appeal.filedBy.username ? `@${appeal.filedBy.username}` : t('A staker')}
            </span>
            <span className="text-muted-foreground">{t('claimed')}</span>
            <ClaimPill claim={appeal.claimedOutcome} outcomeLabels={outcomeLabels} />
          </p>
          <p className="mt-2 text-sm/relaxed text-muted-foreground">“{appeal.reason}”</p>
          <p className="mt-2 text-xs text-muted-foreground tabular-nums">
            {t('{backers} backers · {escrow} in escrow', {
              backers: String(appeal.backerCount),
              escrow: formatMoney(appeal.escrowTotalMinor, appeal.currency),
            })}
          </p>
        </section>
        <JurySummary
          votes={votes}
          outcome={appeal.originalOutcome}
          outcomeLabels={outcomeLabels}
          seats={market.jurySeatCount ?? votes.length}
        />
      </aside>
    </div>
  )
}

export default function AppealPage(props: AppealPageProps) {
  const t = useExtracted()
  const tick = useNowTimestamp()
  const now = tick ?? props.serverNow
  const { market, community, appeal, viewer, pool, votes, signedIn } = props
  const outcomeLabels = useMemo(
    () => ({ yes: market.outcomeYes ?? t('Yes'), no: market.outcomeNo ?? t('No') }),
    [market.outcomeYes, market.outcomeNo, t],
  )
  const live =
    appeal !== null &&
    (appeal.status === 'open' || appeal.status === 'threshold_met' || appeal.status === 'under_review')

  if (appeal && appeal.ruling) {
    return (
      <div className="flex flex-col gap-5">
        <Header community={community} market={market} title={t('Appeal ruling')} />
        <Ruling
          appeal={appeal}
          market={market}
          community={community}
          viewer={viewer}
          votes={votes}
          outcomeLabels={outcomeLabels}
        />
      </div>
    )
  }
  if (appeal && live) {
    return (
      <div className="flex flex-col gap-5">
        <Header
          community={community}
          market={market}
          title={
            appeal.status === 'open' ? t('An appeal is open on this result') : t('Prophit is reviewing this result')
          }
        />
        <OpenAppeal
          appeal={appeal}
          market={market}
          community={community}
          viewer={viewer}
          votes={votes}
          outcomeLabels={outcomeLabels}
          now={now}
          signedIn={signedIn}
        />
      </div>
    )
  }
  if (appeal && (appeal.status === 'expired' || appeal.status === 'withdrawn')) {
    return (
      <div className="flex flex-col gap-5">
        <Header community={community} market={market} title={t('Appeal closed')} />
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <div className="flex size-11 items-center justify-center rounded-full bg-secondary">
            <CheckIcon className="size-6" strokeWidth={2.5} aria-hidden="true" />
          </div>
          <p className="text-sm/relaxed">
            {appeal.status === 'expired'
              ? t(
                  'Not enough backers in time. The result stands, payouts were released, and every backer’s escrow is back.',
                )
              : t('The appeal was withdrawn. Every backer’s escrow is back.')}
          </p>
          <Button
            variant="secondary"
            nativeButton={false}
            render={<Link href={`/community/${community.slug}/market/${market.id}`} />}
            className="h-11 self-start rounded-md"
          >
            {t('Back to the market')}
          </Button>
        </section>
      </div>
    )
  }
  if (viewer?.canFile) {
    return (
      <div className="flex flex-col gap-5">
        <Header community={community} market={market} title={t('Appeal this result')} />
        <FileForm market={market} community={community} viewer={viewer} pool={pool} now={now} />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      <Header community={community} market={market} title={t('Appeal this result')} />
      <section className="rounded-xl border border-border bg-card p-5 text-sm/relaxed">
        {!signedIn
          ? t('Sign in. Only stakers on this market can appeal its result, during the 24-hour hold.')
          : !viewer?.staked
            ? t('Only stakers on this market can appeal its result.')
            : pool?.state === 'held'
              ? t('The appeal window on this market has closed.')
              : pool?.state === 'settled' || pool?.state === 'cancelled'
                ? t('This market has been paid out. Appeals are open only during the 24-hour hold after a result.')
                : t('There is no result to appeal yet. Appeals open during the 24-hour hold after the jury decides.')}
      </section>
      <Button
        variant="secondary"
        nativeButton={false}
        render={<Link href={`/community/${community.slug}/market/${market.id}`} />}
        className="h-11 self-start rounded-md"
      >
        {t('Back to the market')}
      </Button>
    </div>
  )
}
