'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLinkIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import type { ApplicationView } from '@/lib/db/queries/applications'

import { formatRelativeTime } from '@/components/admin-ui/format'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { LeaderTypeBadge } from '@/components/communities/trust/LeaderTypeBadge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/**
 * Leader applications: a list on the left, the chosen one on the right with
 * its sample markets and links, and three rulings: approve at a level, ask
 * for more, reject with a note.
 */

type AdminApplication = ApplicationView & { applicant: { id: string; username: string | null; image: string | null } }
type Filter = 'pending' | 'more_info' | 'approved' | 'rejected' | 'all'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'pending', label: 'Pending' },
  { id: 'more_info', label: 'Waiting on applicant' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
]

async function fetchApplications(status: Filter): Promise<AdminApplication[]> {
  const res = await fetch(`/admin/api/communities/applications?status=${status}`)
  if (!res.ok) {
    throw new Error(`Failed to load applications (${res.status})`)
  }
  return ((await res.json()) as { data: AdminApplication[] }).data
}

export function AdminApplicationsManager() {
  const [filter, setFilter] = useState<Filter>('pending')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [startLevel, setStartLevel] = useState<0 | 1 | 2>(0)
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['admin-applications', filter],
    queryFn: () => fetchApplications(filter),
    staleTime: 10_000,
  })
  const items = query.data ?? []
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null

  const review = useMutation({
    mutationFn: async (input: { id: string; action: 'approve' | 'more_info' | 'reject' }) => {
      const res = await fetch(`/admin/api/communities/applications/${input.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: input.action, startLevel, note: note.trim() || null }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string; data?: { slug?: string } }
      if (!res.ok) {
        throw new Error(payload.error || 'Failed')
      }
      return payload.data
    },
    onSuccess: (data, variables) => {
      setNote('')
      void queryClient.invalidateQueries({ queryKey: ['admin-applications'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-communities'] })
      toast.success(
        variables.action === 'approve'
          ? `Approved. Community live at /community/${data?.slug ?? ''}`
          : variables.action === 'more_info'
            ? 'Sent back to the applicant'
            : 'Rejected',
      )
    },
    onError: (error) => toast.error((error as Error).message),
  })

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Leader applications"
        description="Who wants to run a community, what they will predict, and how they will settle it. Approve at a level, ask for more, or decline with a note the applicant sees."
      />

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

      {query.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-secondary/40" />
      ) : query.error ? (
        <p className="text-sm text-muted-foreground">{(query.error as Error).message}</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-muted-foreground/40 p-6 text-sm text-muted-foreground">
          Nothing here. New applications land under Pending.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <ul
            className="divide-y divide-border rounded-xl border border-border bg-card"
            role="listbox"
            aria-label="Applications"
          >
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected?.id === item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    'flex w-full flex-col gap-1 px-4 py-3 text-left',
                    selected?.id === item.id ? 'bg-secondary' : 'hover:bg-secondary/40',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{item.name}</span>
                    <LeaderTypeBadge type={item.leaderType} className="h-5 text-[11px]" />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    @{item.applicant.username ?? 'unknown'} · {formatRelativeTime(item.createdAt)} ·{' '}
                    {item.status.replace('_', ' ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <article className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
              <header className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold">{selected.name}</h2>
                  <LeaderTypeBadge type={selected.leaderType} className="h-6 text-[11px]" />
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {selected.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  /community/{selected.slug} · {selected.currency} · by{' '}
                  {selected.applicant.username ? (
                    <Link href={`/profile/${selected.applicant.username}`} className="underline underline-offset-[3px]">
                      @{selected.applicant.username}
                    </Link>
                  ) : (
                    selected.applicant.id
                  )}
                </p>
              </header>

              <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[140px_1fr]">
                <dt className="text-muted-foreground">What they predict</dt>
                <dd>{selected.description}</dd>
                <dt className="text-muted-foreground">Audience</dt>
                <dd>{selected.audience ?? '—'}</dd>
                <dt className="text-muted-foreground">Sample markets</dt>
                <dd>
                  <ol className="list-decimal pl-4">
                    {selected.sampleMarkets.map((market, index) => (
                      <li key={index} className="mb-1">
                        <span className="font-medium">{market.title}</span>
                        <span className="block text-xs text-muted-foreground">Source: {market.source}</span>
                      </li>
                    ))}
                  </ol>
                </dd>
                <dt className="text-muted-foreground">Links</dt>
                <dd className="flex flex-col gap-1">
                  {selected.links.length === 0
                    ? '—'
                    : selected.links.map((link) => (
                        <a
                          key={link}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 break-all underline underline-offset-[3px]"
                        >
                          {link}
                          <ExternalLinkIcon className="size-3" aria-hidden="true" />
                        </a>
                      ))}
                </dd>
                {selected.adminNote ? (
                  <>
                    <dt className="text-muted-foreground">Last note</dt>
                    <dd>{selected.adminNote}</dd>
                  </>
                ) : null}
                {selected.communityId ? (
                  <>
                    <dt className="text-muted-foreground">Community</dt>
                    <dd>
                      <Link href={`/community/${selected.slug}`} className="underline underline-offset-[3px]">
                        /community/{selected.slug}
                      </Link>
                    </dd>
                  </>
                ) : null}
              </dl>

              {selected.status === 'pending' || selected.status === 'more_info' ? (
                <div className="flex flex-col gap-3 border-t border-border pt-4">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Note to the applicant (required for "ask for more")
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground"
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      Start at
                      <select
                        value={startLevel}
                        onChange={(event) => setStartLevel(Number(event.target.value) as 0 | 1 | 2)}
                        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                      >
                        <option value={0}>Level 0 · New</option>
                        <option value={1}>Level 1 · Proven</option>
                        <option value={2}>Level 2 · Established</option>
                      </select>
                    </label>
                    <Button
                      onClick={() => review.mutate({ id: selected.id, action: 'approve' })}
                      disabled={review.isPending}
                    >
                      Approve at Level {startLevel}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => review.mutate({ id: selected.id, action: 'more_info' })}
                      disabled={review.isPending}
                    >
                      Ask for more
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => review.mutate({ id: selected.id, action: 'reject' })}
                      disabled={review.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ) : null}
            </article>
          ) : null}
        </div>
      )}
    </section>
  )
}
