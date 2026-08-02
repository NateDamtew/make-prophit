'use client'

import { Calendar, Check, Edit3, ExternalLink, Loader2, User, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { approveMarketAction, rejectMarketAction } from '@/app/[locale]/(platform)/community/[slug]/_actions/review-actions'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

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
  creator_username: string | null
}

type Mode = 'view' | 'edit' | 'reject'

export default function ReviewMarketCard({ market }: { market: Market }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('view')
  const [isPending, startTransition] = useTransition()

  // Edit form state (initialized from market)
  const [title, setTitle] = useState(market.title)
  const [description, setDescription] = useState(market.description ?? '')
  const [source, setSource] = useState(market.resolution_source ?? '')
  const [rules, setRules] = useState(market.resolution_rules ?? '')
  const [resolutionDate, setResolutionDate] = useState(
    market.resolution_date ? new Date(market.resolution_date).toISOString().slice(0, 10) : '',
  )

  // Rejection
  const [feedback, setFeedback] = useState('')

  function hasEdits() {
    return (
      title !== market.title
      || description !== (market.description ?? '')
      || source !== (market.resolution_source ?? '')
      || rules !== (market.resolution_rules ?? '')
      || (resolutionDate && new Date(resolutionDate).getTime() !== market.resolution_date?.getTime())
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
        // Redirect super admin to the admin event form to step through
        // Pre-sign (validation) + Sign & Create (on-chain deploy)
        const params = new URLSearchParams({
          draftId,
          mode: 'single',
          edit: '1',
        })
        window.location.href = `/admin/events/calendar/new?${params.toString()}`
        return
      }
      toast.success('Market approved')
      router.refresh()
    })
  }

  function handleReject() {
    if (!feedback.trim()) {
      toast.error('Please provide feedback before rejecting.')
      return
    }
    startTransition(async () => {
      const result = await rejectMarketAction(market.id, market.community_slug, feedback)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Market rejected with feedback')
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border bg-card p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {market.community_icon
              ? <img src={market.community_icon} alt="" className="size-6 rounded-md object-cover" />
              : (
                  <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-xs">
                    🏛️
                  </div>
                )}
            <Link
              href={`/community/${market.community_slug}` as any}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {market.community_name}
              <ExternalLink className="ml-1 inline-block size-3" />
            </Link>
          </div>
          {mode === 'edit'
            ? (
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="mt-2 text-base font-semibold"
                />
              )
            : (
                <h3 className="mt-2 leading-snug font-semibold">{title}</h3>
              )}
        </div>
      </div>

      {/* Meta */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {market.creator_username && (
          <span className="flex items-center gap-1">
            <User className="size-3" />
            @
            {market.creator_username}
          </span>
        )}
        {market.submitted_at && (
          <span>
            Submitted
            {' '}
            {new Date(market.submitted_at).toLocaleString()}
          </span>
        )}
        {market.main_category_slug && (
          <span className="rounded-full bg-muted px-2 py-0.5">
            {market.main_category_slug}
          </span>
        )}
        {market.category_slugs && market.category_slugs.length > 0 && (
          <span>
            +
            {market.category_slugs.length}
            {' '}
            sub-categories
          </span>
        )}
      </div>

      {/* Body */}
      <div className="mt-4 space-y-3 text-sm">
        {mode === 'edit'
          ? (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={2}
                    className="
                      mt-1 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none
                      focus:ring-1 focus:ring-primary
                    "
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Resolution Source</label>
                  <Input value={source} onChange={e => setSource(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Resolution Rules</label>
                  <textarea
                    value={rules}
                    onChange={e => setRules(e.target.value)}
                    rows={4}
                    className="
                      mt-1 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none
                      focus:ring-1 focus:ring-primary
                    "
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Resolution Date</label>
                  <Input
                    type="date"
                    value={resolutionDate}
                    onChange={e => setResolutionDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </>
            )
          : (
              <>
                {market.description && (
                  <p className="text-muted-foreground">{market.description}</p>
                )}
                {market.resolution_source && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Source</p>
                    <p>{market.resolution_source}</p>
                  </div>
                )}
                {market.resolution_rules && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Resolution Rules</p>
                    <p className="whitespace-pre-wrap">{market.resolution_rules}</p>
                  </div>
                )}
                {market.resolution_date && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="size-3" />
                    Resolves
                    {' '}
                    {new Date(market.resolution_date).toLocaleDateString()}
                  </div>
                )}
              </>
            )}
      </div>

      {/* Rejection input */}
      {mode === 'reject' && (
        <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
          <label className="text-xs font-medium text-destructive">
            Why are you rejecting this market?
          </label>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="e.g. The resolution source isn't specific enough — please cite which official body's data will be used."
            rows={3}
            className="
              mt-1 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none
              focus:ring-1 focus:ring-destructive/50
            "
          />
          <p className="mt-1 text-xs text-muted-foreground">
            The community admin will see this feedback and can revise.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          Approving opens the platform admin form to complete
          {' '}
          <strong>Pre-sign</strong>
          {' '}
          +
          {' '}
          <strong>Sign &amp; Create</strong>
          .
        </p>
        {mode === 'view' && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode('reject')}
              disabled={isPending}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="mr-1.5 size-3.5" />
              Reject
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMode('edit')}
              disabled={isPending}
            >
              <Edit3 className="mr-1.5 size-3.5" />
              Edit
            </Button>
            <Button size="sm" onClick={handleApprove} disabled={isPending}>
              {isPending
                ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                : <Check className="mr-1.5 size-3.5" />}
              Approve & Continue
            </Button>
          </div>
        )}
        {mode === 'edit' && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setMode('view')} disabled={isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApprove} disabled={isPending}>
              {isPending
                ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                : <Check className="mr-1.5 size-3.5" />}
              Save & Continue
            </Button>
          </>
        )}
        {mode === 'reject' && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setMode('view')} disabled={isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleReject}
              disabled={isPending || !feedback.trim()}
              className={cn('bg-destructive text-destructive-foreground hover:bg-destructive/90')}
            >
              {isPending
                ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                : <X className="mr-1.5 size-3.5" />}
              Send Rejection
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
