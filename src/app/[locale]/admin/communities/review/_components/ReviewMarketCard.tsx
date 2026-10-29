'use client'

import { CalendarIcon, CheckIcon, ExternalLinkIcon, Loader2Icon, PencilLineIcon, UserIcon, XIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import {
  approveMarketAction,
  rejectMarketAction,
} from '@/app/[locale]/(platform)/community/[slug]/_actions/review-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { assessSuggestion } from '@/lib/communities/suggestion-rules'
import { cn } from '@/lib/utils'

/**
 * One market waiting for Prophit's review: the question as written, the
 * same three checks the suggestion pool runs (dated, public source, closes
 * before the event), the rules and source, and three ways out: approve
 * (edited or not), send back with a note, or reject with a note. Pool
 * communities' markets open a pool on approval; orderbook ones go on-chain.
 */

interface Market {
  id: string
  title: string
  description: string | null
  resolution_source: string | null
  resolution_rules: string | null
  resolution_date: Date | null
  main_category_slug: string | null
  category_slugs: string[] | null
  submitted_at: Date | null
  created_at: Date
  community_slug: string
  community_name: string
  community_icon: string | null
  community_tier: string
  community_level: number
  creator_username: string | null
}

type Mode = 'view' | 'edit' | 'note'

function CheckPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        ok ? 'bg-yes/15 text-yes' : 'bg-no/15 text-no-text',
      )}
    >
      {ok ? <CheckIcon className="size-3" aria-hidden="true" /> : <XIcon className="size-3" aria-hidden="true" />}
      {label}
    </span>
  )
}

export default function ReviewMarketCard({ market, reviewedAt }: { market: Market; reviewedAt: number }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('view')
  const [isPending, startTransition] = useTransition()
  const loadedAt = new Date(reviewedAt)

  const [title, setTitle] = useState(market.title)
  const [description, setDescription] = useState(market.description ?? '')
  const [source, setSource] = useState(market.resolution_source ?? '')
  const [rules, setRules] = useState(market.resolution_rules ?? '')
  const [resolutionDate, setResolutionDate] = useState(
    market.resolution_date ? new Date(market.resolution_date).toISOString().slice(0, 10) : '',
  )
  const [note, setNote] = useState('')
  const [noteKind, setNoteKind] = useState<'change' | 'reject'>('change')

  const isPool = market.community_tier !== 'orderbook'
  const checks = assessSuggestion({
    title,
    resolutionRules: rules,
    resolutionSource: source,
    sourceUrl: null,
    closesAt: resolutionDate ? new Date(resolutionDate) : null,
    eventAt: null,
    now: loadedAt,
  })

  function hasEdits() {
    return (
      title !== market.title ||
      description !== (market.description ?? '') ||
      source !== (market.resolution_source ?? '') ||
      rules !== (market.resolution_rules ?? '') ||
      (resolutionDate && new Date(resolutionDate).getTime() !== market.resolution_date?.getTime())
    )
  }

  function handleApprove() {
    startTransition(async () => {
      const edits = hasEdits()
        ? {
            title,
            description: description || undefined,
            resolution_source: source || undefined,
            resolution_rules: rules,
            resolution_date: resolutionDate || undefined,
          }
        : {}
      const result = await approveMarketAction(market.id, market.community_slug, edits)
      if (result.error) {
        toast.error(result.error)
        return
      }
      const draftId = result.data?.eventCreationDraftId
      if (draftId) {
        toast.success('Approved. Continuing to Pre-sign + Sign & Create...')
        const params = new URLSearchParams({ draftId, mode: 'single', edit: '1' })
        window.location.href = `/admin/events/calendar/new?${params.toString()}`
        return
      }
      toast.success(isPool ? 'Approved. The pool is open.' : 'Market approved')
      router.refresh()
    })
  }

  function handleSendBack() {
    if (!note.trim()) {
      toast.error('Write the note the leader will read.')
      return
    }
    startTransition(async () => {
      const text = noteKind === 'reject' ? `Rejected. ${note.trim()}` : note.trim()
      const result = await rejectMarketAction(market.id, market.community_slug, text)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(noteKind === 'reject' ? 'Rejected with a note' : 'Sent back with a note')
      router.refresh()
    })
  }

  const fieldClass =
    'mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground'

  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {market.community_icon ? (
          <img src={market.community_icon} alt="" className="size-6 rounded-md object-cover" />
        ) : (
          <span className="flex size-6 items-center justify-center rounded-md bg-secondary text-xs">🏛️</span>
        )}
        <Link href={`/community/${market.community_slug}`} className="font-semibold text-foreground hover:underline">
          {market.community_name}
          <ExternalLinkIcon className="ml-1 inline-block size-3" aria-hidden="true" />
        </Link>
        <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">
          {isPool ? `Pool · Level ${market.community_level}` : 'Order book'}
        </span>
        {market.creator_username ? (
          <span className="inline-flex items-center gap-1">
            <UserIcon className="size-3" aria-hidden="true" />@{market.creator_username}
          </span>
        ) : null}
        {market.submitted_at ? <span>submitted {new Date(market.submitted_at).toLocaleString()}</span> : null}
      </header>

      <div className="mt-3">
        {mode === 'edit' ? (
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-base font-semibold" />
        ) : (
          <h3 className="text-[17px]/snug font-bold">{title}</h3>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <CheckPill ok={checks.checks.dated} label="Dated" />
          <CheckPill ok={checks.checks.publicSource} label="Public source" />
          <CheckPill ok={checks.checks.closesBeforeEvent} label="Closes in the future" />
          <span className="ml-1 text-[11px] font-semibold text-muted-foreground tabular-nums">
            {Math.round(checks.confidence * 100)}% ready
          </span>
          {market.main_category_slug ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {market.main_category_slug}
              {market.category_slugs && market.category_slugs.length > 0 ? ` +${market.category_slugs.length}` : ''}
            </span>
          ) : (
            <span className="rounded-full bg-no/15 px-2 py-0.5 text-[11px] font-semibold text-no-text">
              No category
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm">
        {mode === 'edit' ? (
          <>
            <label className="text-xs font-semibold text-muted-foreground">
              What this is
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={fieldClass}
              />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Resolution source
              <Input value={source} onChange={(e) => setSource(e.target.value)} className="mt-1" />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              How it resolves
              <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={4} className={fieldClass} />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Closes
              <Input
                type="date"
                value={resolutionDate}
                onChange={(e) => setResolutionDate(e.target.value)}
                className="mt-1"
              />
            </label>
          </>
        ) : (
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[130px_1fr]">
            {market.description ? (
              <>
                <dt className="text-xs font-semibold text-muted-foreground">What this is</dt>
                <dd className="text-muted-foreground">{market.description}</dd>
              </>
            ) : null}
            <dt className="text-xs font-semibold text-muted-foreground">As written</dt>
            <dd className="whitespace-pre-wrap">
              {market.resolution_rules ?? <span className="text-no-text">No resolution rules.</span>}
            </dd>
            <dt className="text-xs font-semibold text-muted-foreground">Source</dt>
            <dd className="break-all">
              {market.resolution_source ?? <span className="text-no-text">No source named.</span>}
            </dd>
            <dt className="text-xs font-semibold text-muted-foreground">Closes</dt>
            <dd className="inline-flex items-center gap-1.5">
              <CalendarIcon className="size-3.5" aria-hidden="true" />
              {market.resolution_date ? new Date(market.resolution_date).toLocaleString() : 'Not set'}
            </dd>
          </dl>
        )}
      </div>

      {mode === 'note' ? (
        <div className="mt-4 rounded-xl border border-border bg-background p-3">
          <div className="flex gap-1 rounded-full bg-secondary p-1 text-xs font-semibold">
            {(['change', 'reject'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setNoteKind(kind)}
                aria-pressed={noteKind === kind}
                className={cn(
                  'h-7 flex-1 rounded-full',
                  noteKind === kind ? 'bg-foreground text-background' : 'text-muted-foreground',
                )}
              >
                {kind === 'change' ? 'Ask for a change' : 'Reject'}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-xs font-semibold text-muted-foreground">
            {noteKind === 'change'
              ? 'What should change (the leader reads this and resubmits)'
              : 'Why it is rejected (the leader reads this)'}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                noteKind === 'change'
                  ? 'e.g. Name the official page the result will be read from, and close the market before kick-off.'
                  : 'e.g. This cannot be settled from a public source.'
              }
              rows={3}
              className={fieldClass}
            />
          </label>
        </div>
      ) : null}

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          {isPool
            ? 'Approving opens the pool and seats the jury; members can stake at once.'
            : 'Approving opens the admin form to finish Pre-sign + Sign & Create.'}
        </p>
        {mode === 'view' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMode('note')} disabled={isPending}>
              <XIcon className="size-3.5" aria-hidden="true" />
              Send back
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setMode('edit')} disabled={isPending}>
              <PencilLineIcon className="size-3.5" aria-hidden="true" />
              Edit
            </Button>
            <Button size="sm" onClick={handleApprove} disabled={isPending}>
              {isPending ? (
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckIcon className="size-3.5" aria-hidden="true" />
              )}
              Approve
            </Button>
          </div>
        ) : mode === 'edit' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMode('view')} disabled={isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApprove} disabled={isPending}>
              {isPending ? (
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckIcon className="size-3.5" aria-hidden="true" />
              )}
              Approve with edits
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMode('view')} disabled={isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={noteKind === 'reject' ? 'destructive' : 'default'}
              onClick={handleSendBack}
              disabled={isPending || !note.trim()}
            >
              {isPending ? (
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <XIcon className="size-3.5" aria-hidden="true" />
              )}
              {noteKind === 'reject' ? 'Reject with note' : 'Send back with note'}
            </Button>
          </div>
        )}
      </footer>
    </article>
  )
}
