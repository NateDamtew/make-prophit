'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLinkIcon, GavelIcon, ScaleIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import type { AdminAppealRow } from '@/app/[locale]/admin/api/communities/appeals/route'
import type { AppealView, RulingPreview } from '@/lib/communities/appeals-service'

import { formatRelativeTime } from '@/components/admin-ui/format'
import { KpiCard } from '@/components/admin-ui/KpiCard'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { formatMoney } from '@/components/communities/format'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/**
 * The appeals desk: what is gathering backers, what reached its threshold
 * and waits for Prophit, and what was decided. Pick one to read the filer's
 * case, the evidence, the jury's verdicts and the other communities'
 * jurors' advice, see what each ruling does with the money, and rule with
 * a written reason the stakers read.
 */

type Filter = 'review' | 'live' | 'decided' | 'all'
type Ruling = 'rejected' | 'upheld' | 'voided'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'review', label: 'Waiting for a ruling' },
  { id: 'live', label: 'Gathering backers' },
  { id: 'decided', label: 'Decided' },
  { id: 'all', label: 'All' },
]

const RULINGS: Array<{ id: Ruling; label: string; blurb: string }> = [
  {
    id: 'rejected',
    label: 'Reject',
    blurb: 'The jury was right. Payouts go out as decided; the escrow pays the owner and the jurors.',
  },
  {
    id: 'upheld',
    label: 'Uphold',
    blurb: 'The appeal is right. The pool pays the claimed side; the escrow goes back; the community drops a level.',
  },
  {
    id: 'voided',
    label: 'Void',
    blurb: 'Nobody can tell. Every stake and every backer gets their money back; no fees.',
  },
]

interface Counts {
  live: number
  review: number
  overdue: number
  decided30d: number
  upheld30d: number
}

async function fetchAppeals(status: Filter): Promise<{ data: AdminAppealRow[]; counts: Counts }> {
  const res = await fetch(`/admin/api/communities/appeals?status=${status}`)
  if (!res.ok) {
    throw new Error(`Failed to load appeals (${res.status})`)
  }
  return (await res.json()) as { data: AdminAppealRow[]; counts: Counts }
}

async function fetchAppeal(id: string): Promise<{ appeal: AppealView | null; preview: Record<Ruling, RulingPreview> }> {
  const res = await fetch(`/admin/api/communities/appeals/${id}`)
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    data?: { appeal: AppealView | null; preview: Record<Ruling, RulingPreview> }
  }
  if (!res.ok || !payload.data) {
    throw new Error(payload.error || `Failed to load the appeal (${res.status})`)
  }
  return payload.data
}

function statusLabel(status: AdminAppealRow['status']) {
  switch (status) {
    case 'open':
      return 'Gathering backers'
    case 'threshold_met':
      return 'Threshold met'
    case 'under_review':
      return 'Under review'
    case 'withdrawn':
      return 'Withdrawn'
    case 'expired':
      return 'Expired'
    default:
      return status
  }
}

function claimLabel(value: 'yes' | 'no' | 'cancelled') {
  return value === 'cancelled' ? 'Void' : value === 'yes' ? 'Yes' : 'No'
}

function isOverdue(row: AdminAppealRow, now: number) {
  return (
    (row.status === 'threshold_met' || row.status === 'under_review') &&
    row.thresholdMetAt !== null &&
    now - new Date(row.thresholdMetAt).getTime() > 48 * 3_600_000
  )
}

export function AdminAppealsManager({ loadedAt }: { loadedAt: number }) {
  const [filter, setFilter] = useState<Filter>('review')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ruling, setRuling] = useState<Ruling>('rejected')
  const [text, setText] = useState('')
  const queryClient = useQueryClient()

  const list = useQuery({ queryKey: ['admin-appeals', filter], queryFn: () => fetchAppeals(filter), staleTime: 10_000 })
  const rows = list.data?.data ?? []
  const counts = list.data?.counts ?? null
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null
  const detail = useQuery({
    queryKey: ['admin-appeal', selected?.id],
    queryFn: () => fetchAppeal(selected!.id),
    enabled: selected !== null,
    staleTime: 10_000,
  })

  const act = useMutation({
    mutationFn: async (
      input: { id: string; action: 'review' } | { id: string; action: 'rule'; ruling: Ruling; text: string },
    ) => {
      const res = await fetch(`/admin/api/communities/appeals/${input.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          input.action === 'review' ? { action: 'review' } : { action: 'rule', ruling: input.ruling, text: input.text },
        ),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(payload.error || 'Failed')
      }
      return input
    },
    onSuccess: (input) => {
      setText('')
      void queryClient.invalidateQueries({ queryKey: ['admin-appeals'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-appeal', input.id] })
      toast.success(
        input.action === 'review'
          ? 'Sent to review; jurors from other communities were asked.'
          : `Ruled: ${input.ruling}`,
      )
    },
    onError: (error) => toast.error((error as Error).message),
  })

  const appeal = detail.data?.appeal ?? null
  const preview = detail.data?.preview?.[ruling] ?? null
  const canRule = selected !== null && (selected.status === 'threshold_met' || selected.status === 'under_review')

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Appeals desk"
        description="Appeals that reached their threshold wait here with payouts frozen. Read the case, the verdicts and the advice, see what each ruling does with the money, then rule in writing."
      />

      {counts ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Waiting for a ruling"
            value={String(counts.review)}
            icon={GavelIcon}
            hint={counts.overdue > 0 ? `${counts.overdue} past 48h` : 'none past 48h'}
          />
          <KpiCard label="Gathering backers" value={String(counts.live)} icon={ScaleIcon} />
          <KpiCard label="Decided, 30 days" value={String(counts.decided30d)} />
          <KpiCard label="Upheld, 30 days" value={String(counts.upheld30d)} hint="each one costs a community a level" />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setFilter(item.id)
              setSelectedId(null)
            }}
            aria-pressed={filter === item.id}
            className={cn(
              'h-9 rounded-full px-3.5 text-sm font-semibold transition-colors',
              filter === item.id
                ? 'bg-foreground text-background'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-secondary/40" />
      ) : list.error ? (
        <p className="text-sm text-muted-foreground">{(list.error as Error).message}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-muted-foreground/40 p-6 text-sm text-muted-foreground">
          Nothing here. Appeals that reach their threshold show up under &ldquo;Waiting for a ruling&rdquo;.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <ul
            className="divide-y divide-border rounded-xl border border-border bg-card"
            role="listbox"
            aria-label="Appeals"
          >
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected?.id === row.id}
                  onClick={() => {
                    setSelectedId(row.id)
                    setText('')
                  }}
                  className={cn(
                    'flex w-full flex-col gap-1.5 px-4 py-3 text-left',
                    selected?.id === row.id ? 'bg-secondary' : 'hover:bg-secondary/40',
                  )}
                >
                  <span className="line-clamp-2 text-sm font-semibold">{row.marketTitle}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.communityName} · L{row.communityLevel} · {claimLabel(row.originalOutcome)} →{' '}
                    {claimLabel(row.claimedOutcome)}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5',
                        isOverdue(row, loadedAt)
                          ? 'bg-no/15 text-no-text'
                          : row.status === 'upheld'
                            ? 'bg-yes/15 text-yes'
                            : 'bg-secondary text-muted-foreground',
                      )}
                    >
                      {isOverdue(row, loadedAt)
                        ? 'Overdue'
                        : row.ruling
                          ? `Ruled ${row.ruling}`
                          : statusLabel(row.status)}
                    </span>
                    <span className="text-muted-foreground">
                      {row.backerCount}/{row.backersNeeded} backers · {formatMoney(row.escrowTotalMinor, row.currency)}{' '}
                      escrow · {formatRelativeTime(row.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <article className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
              <header className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">{selected.marketTitle}</h2>
                <p className="text-sm text-muted-foreground">
                  <Link href={`/community/${selected.communitySlug}`} className="underline underline-offset-[3px]">
                    {selected.communityName}
                  </Link>{' '}
                  · Level {selected.communityLevel} · filed by @{selected.filerUsername ?? 'unknown'} ·{' '}
                  <Link
                    href={`/community/${selected.communitySlug}/market/${selected.marketId}/appeal`}
                    className="inline-flex items-center gap-1 underline underline-offset-[3px]"
                  >
                    appeal page
                    <ExternalLinkIcon className="size-3" aria-hidden="true" />
                  </Link>
                </p>
              </header>

              {detail.isLoading ? (
                <div className="h-40 animate-pulse rounded-xl bg-secondary/40" />
              ) : detail.error ? (
                <p className="text-sm text-muted-foreground">{(detail.error as Error).message}</p>
              ) : appeal ? (
                <>
                  <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[150px_1fr]">
                    <dt className="text-muted-foreground">Claim</dt>
                    <dd>
                      The jury said <strong>{claimLabel(appeal.originalOutcome)}</strong>; the appeal says{' '}
                      <strong>{claimLabel(appeal.claimedOutcome)}</strong>.
                    </dd>
                    <dt className="text-muted-foreground">Why</dt>
                    <dd className="whitespace-pre-wrap">{appeal.reason}</dd>
                    <dt className="text-muted-foreground">Evidence</dt>
                    <dd className="flex flex-col gap-1">
                      {appeal.evidence.length === 0
                        ? '—'
                        : appeal.evidence.map((item, index) => (
                            <a
                              key={index}
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 break-all underline underline-offset-[3px]"
                            >
                              {item.label ?? item.url}
                              <ExternalLinkIcon className="size-3" aria-hidden="true" />
                            </a>
                          ))}
                    </dd>
                    <dt className="text-muted-foreground">Backing</dt>
                    <dd>
                      {appeal.backerCount} of {appeal.backersNeeded} backers ·{' '}
                      {formatMoney(appeal.escrowTotalMinor, appeal.currency)} of{' '}
                      {formatMoney(appeal.escrowTargetMinor, appeal.currency)} in escrow
                      {appeal.thresholdMetAt ? ` · threshold met ${formatRelativeTime(appeal.thresholdMetAt)}` : ''}
                    </dd>
                    <dt className="text-muted-foreground">Filer's stake</dt>
                    <dd>
                      {formatMoney(appeal.filedBy.stakeMinor, appeal.currency)} on {appeal.filedBy.stakeSide ?? '—'}
                    </dd>
                    <dt className="text-muted-foreground">Appeal jurors</dt>
                    <dd>
                      {appeal.opinions.length === 0 ? (
                        'Not asked yet.'
                      ) : (
                        <ul className="flex flex-wrap gap-1.5">
                          {appeal.opinions.map((opinion, index) => (
                            <li key={index} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
                              @{opinion.username ?? 'juror'} · {opinion.opinion ?? 'no answer yet'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                    {appeal.ruling ? (
                      <>
                        <dt className="text-muted-foreground">Ruling</dt>
                        <dd>
                          <strong className="capitalize">{appeal.ruling}</strong>
                          {appeal.ruledAt ? ` · ${formatRelativeTime(appeal.ruledAt)}` : ''}
                          <p className="mt-1 whitespace-pre-wrap">{appeal.rulingText}</p>
                        </dd>
                      </>
                    ) : null}
                  </dl>

                  {canRule ? (
                    <div className="flex flex-col gap-4 border-t border-border pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {selected.status === 'threshold_met' ? (
                          <Button
                            variant="secondary"
                            onClick={() => act.mutate({ id: selected.id, action: 'review' })}
                            disabled={act.isPending}
                          >
                            Ask jurors from other communities
                          </Button>
                        ) : null}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {RULINGS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setRuling(option.id)}
                            aria-pressed={ruling === option.id}
                            className={cn(
                              'flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors',
                              ruling === option.id
                                ? 'border-foreground bg-secondary'
                                : 'border-border hover:bg-secondary/40',
                            )}
                          >
                            <span className="text-sm font-bold">{option.label}</span>
                            <span className="text-xs text-muted-foreground">{option.blurb}</span>
                          </button>
                        ))}
                      </div>
                      {preview ? (
                        <div className="rounded-xl border border-border bg-background p-3 text-sm">
                          <p className="text-xs font-semibold text-muted-foreground">
                            Money if you {ruling === 'rejected' ? 'reject' : ruling === 'upheld' ? 'uphold' : 'void'}:
                            pool {formatMoney(preview.totalPoolMinor, preview.currency)}, escrow{' '}
                            {formatMoney(preview.totalEscrowMinor, preview.currency)}
                            {preview.escrowReturned ? ' (returned)' : ' (paid out)'}
                          </p>
                          <ul className="mt-2 grid gap-1">
                            {preview.lines.slice(0, 12).map((line, index) => (
                              <li key={index} className="flex justify-between gap-3 tabular-nums">
                                <span className="truncate text-muted-foreground">{line.reason}</span>
                                <span className="shrink-0 font-semibold">
                                  {formatMoney(line.amountMinor, preview.currency)}
                                </span>
                              </li>
                            ))}
                            {preview.lines.length > 12 ? (
                              <li className="text-xs text-muted-foreground">
                                and {preview.lines.length - 12} more lines
                              </li>
                            ) : null}
                          </ul>
                        </div>
                      ) : null}
                      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                        The ruling, in writing (the stakers read it; at least 20 characters)
                        <textarea
                          value={text}
                          onChange={(event) => setText(event.target.value)}
                          rows={4}
                          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground"
                        />
                      </label>
                      <div>
                        <Button
                          onClick={() => act.mutate({ id: selected.id, action: 'rule', ruling, text: text.trim() })}
                          disabled={act.isPending || text.trim().length < 20}
                        >
                          <GavelIcon className="size-4" aria-hidden="true" />
                          {ruling === 'rejected'
                            ? 'Reject the appeal'
                            : ruling === 'upheld'
                              ? 'Uphold the appeal'
                              : 'Void the market'}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">This appeal has no page view yet.</p>
              )}
            </article>
          ) : null}
        </div>
      )}
    </section>
  )
}
