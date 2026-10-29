'use client'

import { ExternalLinkIcon, PencilLineIcon, PlusIcon, SparklesIcon, XIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'
import { useEffect, useState, useTransition } from 'react'

import type { CommunitySuggestion } from '@/lib/communities/suggestions'

import {
  addSuggestionAction,
  dismissSuggestionAction,
  listCommunitySuggestionsAction,
} from '@/app/[locale]/(platform)/community/[slug]/_actions/suggestion-actions'
import { formatCloseLabel } from '@/components/communities/format'
import { CommunitySheet } from '@/components/communities/sheet/CommunitySheet'
import { EmptyState } from '@/components/communities/states/EmptyState'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * What Prophit suggests for this community: drafts picked for it, then
 * what every community is offered. Add one as written, edit it first, or
 * hide it. Adding creates the market and sends it for the usual review.
 */

interface SuggestionsPickerProps {
  communityId: string
  communitySlug: string
}

interface CategoryOption {
  slug: string
  name: string
  isMainCategory: boolean
}

interface EditValues {
  title: string
  resolutionRules: string
  resolutionSource: string
  closesAt: string
  mainCategorySlug: string
  categorySlugs: string[]
}

function toLocalInput(value: string | null): string {
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

function editValuesFrom(item: CommunitySuggestion): EditValues {
  return {
    title: item.title,
    resolutionRules: item.resolutionRules ?? '',
    resolutionSource: item.resolutionSource ?? '',
    closesAt: toLocalInput(item.closesAt),
    mainCategorySlug: item.mainCategorySlug ?? '',
    categorySlugs: item.categorySlugs,
  }
}

/** Ready to add as written: it has a close time and categories. */
function isComplete(item: CommunitySuggestion) {
  return Boolean(item.closesAt && item.mainCategorySlug && item.categorySlugs.length > 0 && item.resolutionRules)
}

const inputClass =
  'w-full rounded-[10px] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground'

export default function SuggestionsPicker({ communityId, communitySlug }: SuggestionsPickerProps) {
  const t = useExtracted()
  const locale = useLocale()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [matched, setMatched] = useState<CommunitySuggestion[]>([])
  const [trending, setTrending] = useState<CommunitySuggestion[]>([])
  const [editing, setEditing] = useState<{ item: CommunitySuggestion; values: EditValues } | null>(null)
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [isWorking, startWorking] = useTransition()
  const [workingId, setWorkingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void listCommunitySuggestionsAction(communityId).then((result) => {
      if (cancelled) {
        return
      }
      setLoading(false)
      setError(result.error)
      setMatched(result.data.matched)
      setTrending(result.data.trending)
    })
    return () => {
      cancelled = true
    }
  }, [communityId])

  useEffect(() => {
    if (!editing || categories.length > 0) {
      return
    }
    let cancelled = false
    fetch('/api/categories')
      .then((res) => (res.ok ? res.json() : { categories: [] }))
      .then((data: { categories?: CategoryOption[] }) => {
        if (!cancelled) {
          setCategories(data.categories ?? [])
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [editing, categories.length])

  function removeLocally(id: string) {
    setMatched((current) => current.filter((item) => item.id !== id))
    setTrending((current) => current.filter((item) => item.id !== id))
  }

  function add(item: CommunitySuggestion, values?: EditValues) {
    setWorkingId(item.id)
    startWorking(async () => {
      const result = await addSuggestionAction({
        communityId,
        communitySlug,
        suggestionId: item.id,
        edits: values
          ? {
              title: values.title,
              resolutionRules: values.resolutionRules,
              resolutionSource: values.resolutionSource || null,
              closesAt: values.closesAt ? new Date(values.closesAt).toISOString() : null,
              mainCategorySlug: values.mainCategorySlug || null,
              categorySlugs: values.categorySlugs,
            }
          : undefined,
      })
      setWorkingId(null)
      if (result.error || !result.data) {
        toast.error(result.error ?? t('Could not add that suggestion.'))
        return
      }
      removeLocally(item.id)
      setEditing(null)
      toast.success(
        result.data.reviewStatus
          ? t('Added and sent for review.')
          : t('Added as a draft. Finish it to send it for review.'),
      )
      router.push(`/community/${communitySlug}/market/${result.data.marketId}`)
    })
  }

  function dismiss(item: CommunitySuggestion) {
    setWorkingId(item.id)
    startWorking(async () => {
      const result = await dismissSuggestionAction({ communityId, suggestionId: item.id })
      setWorkingId(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      removeLocally(item.id)
    })
  }

  function renderCard(item: CommunitySuggestion) {
    const busy = isWorking && workingId === item.id
    return (
      <li key={item.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-2">
          <SparklesIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-foreground">{item.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {item.sourceUrl ? (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-[3px]"
                >
                  {item.sourceName ?? t('Source')}
                  <ExternalLinkIcon className="size-3" aria-hidden="true" />
                </a>
              ) : null}
              {item.closesAt ? <span>{formatCloseLabel(item.closesAt, locale)}</span> : null}
              <span>
                {item.marketMode === 'list'
                  ? t('{count} outcomes', { count: String(item.outcomes.length) })
                  : t('Yes / No')}
              </span>
              {item.matched ? (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">
                  {t('Picked for you')}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        {item.resolutionRules ? (
          <p className="line-clamp-3 text-[13px] text-muted-foreground">{item.resolutionRules}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {isComplete(item) ? (
            <Button size="sm" onClick={() => add(item)} disabled={busy}>
              <PlusIcon className="size-4" aria-hidden="true" />
              {busy ? t('Adding…') : t('Add')}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={isComplete(item) ? 'secondary' : 'default'}
            onClick={() => setEditing({ item, values: editValuesFrom(item) })}
            disabled={busy}
          >
            <PencilLineIcon className="size-4" aria-hidden="true" />
            {isComplete(item) ? t('Edit first') : t('Finish and add')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => dismiss(item)} disabled={busy}>
            <XIcon className="size-4" aria-hidden="true" />
            {t('Hide')}
          </Button>
        </div>
      </li>
    )
  }

  const mainCategories = categories.filter((category) => category.isMainCategory)
  const subCategories = categories.filter((category) => !category.isMainCategory)
  const values = editing?.values ?? null
  const canSave =
    values !== null &&
    values.title.trim().length >= 10 &&
    values.resolutionRules.trim().length >= 20 &&
    values.closesAt !== '' &&
    values.mainCategorySlug !== '' &&
    values.categorySlugs.length > 0

  if (loading) {
    return (
      <div className="grid gap-3">
        {[1, 2, 3].map((index) => (
          <div key={index} className="h-32 animate-pulse rounded-2xl bg-secondary/40" />
        ))}
      </div>
    )
  }
  if (error) {
    return <p className="text-sm text-muted-foreground">{error}</p>
  }
  if (matched.length === 0 && trending.length === 0) {
    return (
      <EmptyState
        dashed
        title={t('Nothing suggested yet')}
        body={t('Prophit drafts markets from the news and fixtures. New ones show up here as they are approved.')}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {matched.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold text-muted-foreground">{t('Picked for your community')}</h2>
          <ul className="grid gap-3 md:grid-cols-2">{matched.map(renderCard)}</ul>
        </section>
      ) : null}
      {trending.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold text-muted-foreground">{t('Trending across Prophit')}</h2>
          <ul className="grid gap-3 md:grid-cols-2">{trending.map(renderCard)}</ul>
        </section>
      ) : null}

      <CommunitySheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
          }
        }}
        title={t('Edit the suggestion')}
        size="lg"
      >
        {editing && values ? (
          <form
            className="flex flex-col gap-4 py-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (canSave) {
                add(editing.item, values)
              }
            }}
          >
            <h2 className="text-lg font-bold text-foreground">{t('Edit before adding')}</h2>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {t('Question')}
              <input
                value={values.title}
                onChange={(event) =>
                  setEditing({ item: editing.item, values: { ...values, title: event.target.value } })
                }
                className={cn(inputClass, 'text-base font-semibold')}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {t('How it resolves')}
              <textarea
                value={values.resolutionRules}
                onChange={(event) =>
                  setEditing({ item: editing.item, values: { ...values, resolutionRules: event.target.value } })
                }
                rows={4}
                className={cn(inputClass, 'resize-none')}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                {t('Resolution source')}
                <input
                  value={values.resolutionSource}
                  onChange={(event) =>
                    setEditing({ item: editing.item, values: { ...values, resolutionSource: event.target.value } })
                  }
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                {t('Closes')}
                <input
                  type="datetime-local"
                  value={values.closesAt}
                  onChange={(event) =>
                    setEditing({ item: editing.item, values: { ...values, closesAt: event.target.value } })
                  }
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                {t('Main category')}
                <select
                  value={values.mainCategorySlug}
                  onChange={(event) =>
                    setEditing({ item: editing.item, values: { ...values, mainCategorySlug: event.target.value } })
                  }
                  className={inputClass}
                >
                  <option value="">{t('Pick one')}</option>
                  {mainCategories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
              {t('Sub-categories (at least one)')}
              <div className="flex flex-wrap gap-1.5">
                {subCategories.slice(0, 40).map((category) => {
                  const on = values.categorySlugs.includes(category.slug)
                  return (
                    <button
                      key={category.slug}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setEditing({
                          item: editing.item,
                          values: {
                            ...values,
                            categorySlugs: on
                              ? values.categorySlugs.filter((slug) => slug !== category.slug)
                              : [...values.categorySlugs, category.slug],
                          },
                        })
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
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="submit" disabled={!canSave || isWorking}>
                <PlusIcon className="size-4" aria-hidden="true" />
                {isWorking ? t('Adding…') : t('Add to my community')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                {t('Cancel')}
              </Button>
            </div>
          </form>
        ) : null}
      </CommunitySheet>
    </div>
  )
}
