'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckIcon, ExternalLinkIcon, LinkIcon, PencilLineIcon, SparklesIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import type { AdminSuggestion } from '@/lib/communities/suggestions'

import { formatRelativeTime } from '@/components/admin-ui/format'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/**
 * The suggestion pool: draft a market from a link, a question or by hand;
 * see each draft's checks and confidence; approve it (edited, and offered
 * to chosen communities) or reject it. Approved drafts show up in owners'
 * "Suggested" lists until they expire.
 */

type Filter = 'pending' | 'approved' | 'rejected' | 'expired' | 'all'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'pending', label: 'To review' },
  { id: 'approved', label: 'Offered' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'expired', label: 'Expired' },
  { id: 'all', label: 'All' },
]

interface CommunityOption {
  id: string
  name: string
  slug: string
}

interface CategoryOption {
  slug: string
  name: string
  isMainCategory: boolean
}

interface Edits {
  title: string
  description: string
  resolutionRules: string
  resolutionSource: string
  sourceUrl: string
  closesAt: string
  eventAt: string
  mainCategorySlug: string
  categorySlugs: string[]
}

async function fetchSuggestions(status: Filter): Promise<AdminSuggestion[]> {
  const res = await fetch(`/admin/api/communities/suggestions?status=${status}`)
  if (!res.ok) {
    throw new Error(`Failed to load suggestions (${res.status})`)
  }
  return ((await res.json()) as { data: AdminSuggestion[] }).data
}

async function fetchCommunities(): Promise<CommunityOption[]> {
  const res = await fetch('/admin/api/communities?limit=200')
  if (!res.ok) {
    throw new Error(`Failed to load communities (${res.status})`)
  }
  return ((await res.json()) as { data: CommunityOption[] }).data
}

async function fetchCategories(): Promise<CategoryOption[]> {
  const res = await fetch('/api/categories')
  if (!res.ok) {
    return []
  }
  return ((await res.json()) as { categories?: CategoryOption[] }).categories ?? []
}

function toLocalInput(value: string | Date | null): string {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function editsFrom(item: AdminSuggestion): Edits {
  return {
    title: item.title,
    description: item.description ?? '',
    resolutionRules: item.resolution_rules ?? '',
    resolutionSource: item.resolution_source ?? '',
    sourceUrl: item.source_url ?? '',
    closesAt: toLocalInput(item.closes_at),
    eventAt: toLocalInput(item.event_at),
    mainCategorySlug: item.main_category_slug ?? '',
    categorySlugs: item.category_slugs,
  }
}

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

function Checks({ item }: { item: AdminSuggestion }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <CheckPill ok={item.checks.dated} label="Dated" />
      <CheckPill ok={item.checks.publicSource} label="Public source" />
      <CheckPill ok={item.checks.closesBeforeEvent} label="Closes before event" />
      <span className="ml-1 text-[11px] font-semibold text-muted-foreground tabular-nums">
        {Math.round(Number(item.confidence) * 100)}% ready
      </span>
    </span>
  )
}

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground'

export function AdminSuggestionsManager() {
  const [filter, setFilter] = useState<Filter>('pending')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftSource, setDraftSource] = useState<'url' | 'question'>('url')
  const [draftInput, setDraftInput] = useState('')
  const [edits, setEdits] = useState<{ id: string; values: Edits } | null>(null)
  const [targets, setTargets] = useState<string[]>([])
  const [note, setNote] = useState('')
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['admin-suggestions', filter],
    queryFn: () => fetchSuggestions(filter),
    staleTime: 10_000,
  })
  const communitiesQuery = useQuery({ queryKey: ['admin-communities', 'options'], queryFn: fetchCommunities })
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: fetchCategories, staleTime: 300_000 })
  const items = query.data ?? []
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null
  const editing = edits && selected && edits.id === selected.id ? edits.values : null

  const draft = useMutation({
    mutationFn: async () => {
      const value = draftInput.trim()
      const res = await fetch('/admin/api/communities/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          draftSource === 'url' ? { source: 'url', url: value } : { source: 'question', question: value },
        ),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string; data?: AdminSuggestion }
      if (!res.ok) {
        throw new Error(payload.error || 'Failed')
      }
      return payload.data
    },
    onSuccess: (data) => {
      setDraftInput('')
      setFilter('pending')
      setSelectedId(data?.id ?? null)
      void queryClient.invalidateQueries({ queryKey: ['admin-suggestions'] })
      toast.success('Drafted. Check it and approve it.')
    },
    onError: (error) => toast.error((error as Error).message),
  })

  const review = useMutation({
    mutationFn: async (input: { id: string; action: 'approve' | 'reject' }) => {
      const values = edits && edits.id === input.id ? edits.values : null
      const res = await fetch(`/admin/api/communities/suggestions/${input.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: input.action,
          note: note.trim() || null,
          targetCommunityIds: input.action === 'approve' ? targets : undefined,
          edits: values
            ? {
                title: values.title,
                description: values.description || null,
                resolutionRules: values.resolutionRules || null,
                resolutionSource: values.resolutionSource || null,
                sourceUrl: values.sourceUrl || null,
                closesAt: values.closesAt ? new Date(values.closesAt).toISOString() : null,
                eventAt: values.eventAt ? new Date(values.eventAt).toISOString() : null,
                mainCategorySlug: values.mainCategorySlug || null,
                categorySlugs: values.categorySlugs,
              }
            : undefined,
        }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(payload.error || 'Failed')
      }
    },
    onSuccess: (_data, variables) => {
      setNote('')
      setEdits(null)
      setTargets([])
      void queryClient.invalidateQueries({ queryKey: ['admin-suggestions'] })
      toast.success(variables.action === 'approve' ? 'Approved and offered' : 'Rejected')
    },
    onError: (error) => toast.error((error as Error).message),
  })

  const communities = communitiesQuery.data ?? []
  const categories = categoriesQuery.data ?? []
  const mainCategories = categories.filter((category) => category.isMainCategory)
  const subCategories = categories.filter((category) => !category.isMainCategory)

  function updateEdit<K extends keyof Edits>(key: K, value: Edits[K]) {
    if (!selected) {
      return
    }
    setEdits((current) => ({
      id: selected.id,
      values: { ...(current && current.id === selected.id ? current.values : editsFrom(selected)), [key]: value },
    }))
  }

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Market suggestions"
        description="Draft markets from the news, fixtures and release calendars, check them, and offer them to communities. Owners add them with one tap; the market then goes through the usual review."
      />

      <form
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
        onSubmit={(event) => {
          event.preventDefault()
          if (draftInput.trim().length >= 10) {
            draft.mutate()
          }
        }}
      >
        <div className="flex gap-1 rounded-full bg-secondary p-1">
          {(['url', 'question'] as const).map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => setDraftSource(source)}
              aria-pressed={draftSource === source}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors',
                draftSource === source ? 'bg-foreground text-background' : 'text-muted-foreground',
              )}
            >
              {source === 'url' ? (
                <LinkIcon className="size-3.5" aria-hidden="true" />
              ) : (
                <SparklesIcon className="size-3.5" aria-hidden="true" />
              )}
              {source === 'url' ? 'From a link' : 'From a question'}
            </button>
          ))}
        </div>
        <input
          value={draftInput}
          onChange={(event) => setDraftInput(event.target.value)}
          placeholder={
            draftSource === 'url'
              ? 'https://… a news story, fixture or release page'
              : 'Will the CBK cut its base rate at the 3 Feb meeting?'
          }
          className={inputClass}
          aria-label={draftSource === 'url' ? 'Link to draft from' : 'Question to draft from'}
        />
        <Button type="submit" disabled={draft.isPending || draftInput.trim().length < 10}>
          {draft.isPending ? 'Drafting…' : 'Draft it'}
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setFilter(item.id)
              setSelectedId(null)
              setEdits(null)
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
          Nothing here. Draft one from a link or a question above.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <ul
            className="divide-y divide-border rounded-xl border border-border bg-card"
            role="listbox"
            aria-label="Suggestions"
          >
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected?.id === item.id}
                  onClick={() => {
                    setSelectedId(item.id)
                    setEdits(null)
                    setTargets([])
                  }}
                  className={cn(
                    'flex w-full flex-col gap-1.5 px-4 py-3 text-left',
                    selected?.id === item.id ? 'bg-secondary' : 'hover:bg-secondary/40',
                  )}
                >
                  <span className="line-clamp-2 text-sm font-semibold">{item.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.source_name ?? (item.origin === 'ai' ? 'AI draft' : 'By hand')} ·{' '}
                    {formatRelativeTime(item.created_at)}
                    {item.status === 'approved' ? ` · added by ${item.addedBy}` : ''}
                  </span>
                  <Checks item={item} />
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <article className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
              <header className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {selected.status}
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {selected.market_mode === 'list' ? `${selected.outcomes.length} outcomes` : 'Yes / No'}
                  </span>
                  {selected.source_url ? (
                    <a
                      href={selected.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs underline underline-offset-[3px]"
                    >
                      {selected.source_name ?? 'Source'}
                      <ExternalLinkIcon className="size-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
                <Checks item={selected} />
              </header>

              <div className="grid gap-3">
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                  Question
                  <input
                    value={editing?.title ?? selected.title}
                    onChange={(event) => updateEdit('title', event.target.value)}
                    className={cn(inputClass, 'text-base font-semibold')}
                    disabled={selected.status !== 'pending'}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                  How it resolves
                  <textarea
                    value={editing?.resolutionRules ?? selected.resolution_rules ?? ''}
                    onChange={(event) => updateEdit('resolutionRules', event.target.value)}
                    rows={4}
                    className={cn(inputClass, 'resize-none')}
                    disabled={selected.status !== 'pending'}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Resolution source
                    <input
                      value={editing?.resolutionSource ?? selected.resolution_source ?? ''}
                      onChange={(event) => updateEdit('resolutionSource', event.target.value)}
                      className={inputClass}
                      disabled={selected.status !== 'pending'}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Story link
                    <input
                      value={editing?.sourceUrl ?? selected.source_url ?? ''}
                      onChange={(event) => updateEdit('sourceUrl', event.target.value)}
                      className={inputClass}
                      disabled={selected.status !== 'pending'}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Closes
                    <input
                      type="datetime-local"
                      value={editing?.closesAt ?? toLocalInput(selected.closes_at)}
                      onChange={(event) => updateEdit('closesAt', event.target.value)}
                      className={inputClass}
                      disabled={selected.status !== 'pending'}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Event happens
                    <input
                      type="datetime-local"
                      value={editing?.eventAt ?? toLocalInput(selected.event_at)}
                      onChange={(event) => updateEdit('eventAt', event.target.value)}
                      className={inputClass}
                      disabled={selected.status !== 'pending'}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Main category
                    <select
                      value={editing?.mainCategorySlug ?? selected.main_category_slug ?? ''}
                      onChange={(event) => updateEdit('mainCategorySlug', event.target.value)}
                      className={inputClass}
                      disabled={selected.status !== 'pending'}
                    >
                      <option value="">Pick one</option>
                      {mainCategories.map((category) => (
                        <option key={category.slug} value={category.slug}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Sub-categories
                    <div className="flex flex-wrap gap-1.5">
                      {subCategories.slice(0, 40).map((category) => {
                        const current = editing?.categorySlugs ?? selected.category_slugs
                        const on = current.includes(category.slug)
                        return (
                          <button
                            key={category.slug}
                            type="button"
                            disabled={selected.status !== 'pending'}
                            aria-pressed={on}
                            onClick={() =>
                              updateEdit(
                                'categorySlugs',
                                on ? current.filter((slug) => slug !== category.slug) : [...current, category.slug],
                              )
                            }
                            className={cn(
                              'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                              on ? 'bg-foreground text-background' : 'bg-secondary text-secondary-foreground',
                            )}
                          >
                            {category.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {selected.targets.length > 0 ? (
                <div className="text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">Offered to</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {selected.targets.map((target) => (
                      <li
                        key={target.communityId}
                        className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground"
                      >
                        {target.name} · {target.status}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {selected.review_note ? (
                <p className="text-sm text-muted-foreground">Note: {selected.review_note}</p>
              ) : null}

              {selected.status === 'pending' ? (
                <div className="flex flex-col gap-3 border-t border-border pt-4">
                  <div className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Offer to (leave empty to show it to every community)
                    <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                      {communities.map((community) => {
                        const on = targets.includes(community.id)
                        return (
                          <button
                            key={community.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setTargets((current) =>
                                on ? current.filter((id) => id !== community.id) : [...current, community.id],
                              )
                            }
                            className={cn(
                              'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                              on ? 'bg-foreground text-background' : 'bg-secondary text-secondary-foreground',
                            )}
                          >
                            {community.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Note (kept with the decision)
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={2}
                      className={cn(inputClass, 'resize-none')}
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() => review.mutate({ id: selected.id, action: 'approve' })}
                      disabled={review.isPending}
                    >
                      <CheckIcon className="size-4" aria-hidden="true" />
                      {editing ? 'Approve with edits' : 'Approve'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => review.mutate({ id: selected.id, action: 'reject' })}
                      disabled={review.isPending}
                    >
                      Reject
                    </Button>
                    {editing ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <PencilLineIcon className="size-3.5" aria-hidden="true" />
                        Edited; the checks run again on save.
                      </span>
                    ) : null}
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
