'use client'

import { ArrowDownToLineIcon, ChevronLeftIcon, SearchIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'
import { useEffect, useState, useTransition } from 'react'

import type { ImportableMarket } from '@/lib/communities/imports'

import {
  importMarketAction,
  listImportableMarketsAction,
} from '@/app/[locale]/(platform)/community/[slug]/_actions/import-actions'
import { formatCloseLabel } from '@/components/communities/format'
import { Banner } from '@/components/communities/states/Banner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { Link, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * Pick a market from the main catalogue and bring it into the community.
 * It settles from its source, so the page says so before the owner
 * confirms. Level 0 sees the list but cannot import.
 */

interface ImportPickerProps {
  communityId: string
  communitySlug: string
  communityName: string
  level: number
  levelName: string
  minLevel: number
}

export default function ImportPicker({
  communityId,
  communitySlug,
  communityName,
  level,
  levelName,
  minLevel,
}: ImportPickerProps) {
  const t = useExtracted()
  const locale = useLocale()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<ImportableMarket[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ImportableMarket | null>(null)
  const [closesAt, setClosesAt] = useState('')
  const [isImporting, startImporting] = useTransition()
  const locked = level < minLevel

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      void listImportableMarketsAction(communityId, search).then((result) => {
        if (cancelled) {
          return
        }
        if (result.error) {
          toast.error(result.error)
        }
        setItems(result.data)
        setLoading(false)
      })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [communityId, search])

  function handleImport() {
    if (!selected) {
      return
    }
    startImporting(async () => {
      const result = await importMarketAction({
        communityId,
        communitySlug,
        conditionId: selected.conditionId,
        closesAt: closesAt ? new Date(closesAt).toISOString() : null,
      })
      if (result.error || !result.data) {
        toast.error(result.error ?? t('Could not import that market.'))
        return
      }
      toast.success(t('Market added. It settles from its source on Prophit.'))
      router.push(`/community/${communitySlug}/market/${result.data.marketId}`)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/community/${communitySlug}/dashboard`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
          {t('Dashboard')}
        </Link>
        <h1 className="mt-3 text-[24px]/tight font-bold">{t('Import a market from Prophit')}</h1>
        <p className="mt-1 text-sm/relaxed text-muted-foreground">
          {t(
            'Bring a question from the main catalogue into {name}. Your members stake in your currency; the result comes from the source, so there is no jury, no hold and no jury share.',
            { name: communityName },
          )}
        </p>
      </div>

      {locked ? (
        <Banner
          tone="level0"
          title={t('Available from Level 1')}
          body={t('{level} communities write their own markets first. Resolve 10 on time and importing unlocks.', {
            level: levelName,
          })}
        />
      ) : null}

      <div className="relative">
        <SearchIcon
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('Search the catalogue')}
          className="h-11 rounded-md pl-9"
        />
      </div>

      {loading ? (
        <div className="grid gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-secondary/50" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-muted-foreground/40 p-4 text-sm text-muted-foreground">
          {t('Nothing open matches that search.')}
        </p>
      ) : (
        <ul
          className="divide-y divide-border rounded-xl border border-border bg-card"
          role="listbox"
          aria-label={t('Catalogue')}
        >
          {items.map((item) => {
            const active = selected?.conditionId === item.conditionId
            return (
              <li key={item.conditionId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={locked}
                  onClick={() => setSelected(item)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors disabled:opacity-60',
                    active ? 'bg-secondary' : 'hover:bg-secondary/40',
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary">
                    {item.iconUrl ? <img src={item.iconUrl} alt="" className="size-full object-cover" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-semibold">{item.question?.trim() || item.title}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {item.eventTitle}
                      {item.endTime ? ` · ${t('ends {time}', { time: formatCloseLabel(item.endTime, locale) })}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {selected && !locked ? (
        <section
          className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
          aria-label={t('Confirm import')}
        >
          <div>
            <p className="text-[13px] font-semibold text-muted-foreground">{t('Importing')}</p>
            <p className="text-[15px]/snug font-semibold">{selected.question?.trim() || selected.title}</p>
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted-foreground">
            {t('Close stakes at (optional, never later than the source)')}
            <input
              type="datetime-local"
              value={closesAt}
              onChange={(event) => setClosesAt(event.target.value)}
              className="h-11 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-foreground"
            />
            <span className="text-xs">
              {selected.endTime
                ? t('Source ends {time}.', { time: formatCloseLabel(selected.endTime, locale) })
                : t('The source has no end time; set one.')}
            </span>
          </label>
          <ul className="list-disc pl-5 text-sm/relaxed text-muted-foreground">
            <li>{t('Result comes from the source. Your jury does not vote on it.')}</li>
            <li>{t('Payouts land as soon as the source resolves. No 24-hour hold.')}</li>
            <li>{t('The pool share is split between you and Prophit only.')}</li>
          </ul>
          <Button
            size="lg"
            className="h-12 rounded-md text-base font-bold"
            onClick={handleImport}
            disabled={isImporting}
          >
            <ArrowDownToLineIcon className="size-4" aria-hidden="true" />
            {isImporting ? t('Importing…') : t('Import market')}
          </Button>
        </section>
      ) : null}
    </div>
  )
}
