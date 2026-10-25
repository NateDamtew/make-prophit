'use client'

import { ChevronDownIcon, ChevronRightIcon, PinIcon, RefreshCwIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'

import type {
  BrowsedEvent,
  CurationRuleInput,
  PolymarketLeagueOption,
} from '@/app/[locale]/admin/polymarket/_actions/curation'
import type { PolymarketCurationRuleRow } from '@/lib/db/queries/polymarket-curation'

import {
  addTagRuleAction,
  browsePolymarketAction,
  deleteCurationRuleAction,
  listCurationRulesAction,
  listLeaguesAction,
  runPolymarketSyncAction,
  saveCurationRuleAction,
} from '@/app/[locale]/admin/polymarket/_actions/curation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

interface AdminPolymarketCurationProps {
  initialRules: PolymarketCurationRuleRow[]
}

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

function parseOptionalNumber(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export default function AdminPolymarketCuration({ initialRules }: AdminPolymarketCurationProps) {
  const t = useExtracted()
  const [rules, setRules] = useState(initialRules)
  const [isPending, startTransition] = useTransition()

  function refreshRules() {
    startTransition(async () => {
      const result = await listCurationRulesAction()
      if (result.success) {
        setRules(result.rules)
      }
    })
  }

  function saveRule(input: CurationRuleInput, successMessage?: string) {
    startTransition(async () => {
      const result = await saveCurationRuleAction(input)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      if (successMessage) {
        toast.success(successMessage)
      }
      refreshRules()
    })
  }

  function removeRule(scope: 'tag' | 'event' | 'market', ref: string) {
    startTransition(async () => {
      const result = await deleteCurationRuleAction(scope, ref)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      refreshRules()
    })
  }

  function runSync() {
    startTransition(async () => {
      const result = await runPolymarketSyncAction()
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const { summary } = result
      toast.success(t('Polymarket sync finished'), {
        description: t('{visible} events on show, {imported} markets updated, {hidden} hidden.', {
          visible: String(summary.visible),
          imported: String(summary.imported),
          hidden: String(summary.hidden),
        }),
      })
    })
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t('Changes apply on the next sync (every 15 minutes), or run it now.')}
        </p>
        <Button variant="outline" size="sm" onClick={runSync} disabled={isPending}>
          <RefreshCwIcon className={cn('size-4', isPending && 'animate-spin')} />
          {t('Sync now')}
        </Button>
      </div>

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">{t('Categories & leagues')}</TabsTrigger>
          <TabsTrigger value="browse">{t('Browse & pick')}</TabsTrigger>
          <TabsTrigger value="overrides">{t('Overrides')}</TabsTrigger>
        </TabsList>
        <TabsContent value="categories" className="pt-4">
          <CategoryRules
            rules={rules.filter((rule) => rule.scope === 'tag')}
            disabled={isPending}
            onSave={saveRule}
            onRemove={(ref) => removeRule('tag', ref)}
            onAdded={refreshRules}
          />
        </TabsContent>
        <TabsContent value="browse" className="pt-4">
          <BrowsePolymarket rules={rules} disabled={isPending} onSave={saveRule} onRemove={removeRule} />
        </TabsContent>
        <TabsContent value="overrides" className="pt-4">
          <OverrideRules
            rules={rules.filter((rule) => rule.scope !== 'tag')}
            disabled={isPending}
            onSave={saveRule}
            onRemove={removeRule}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CategoryRules({
  rules,
  disabled,
  onSave,
  onRemove,
  onAdded,
}: {
  rules: PolymarketCurationRuleRow[]
  disabled: boolean
  onSave: (input: CurationRuleInput, message?: string) => void
  onRemove: (ref: string) => void
  onAdded: () => void
}) {
  const t = useExtracted()
  const [newSlug, setNewSlug] = useState('')
  const [newParent, setNewParent] = useState('')
  const [leagues, setLeagues] = useState<PolymarketLeagueOption[] | null>(null)
  const [leagueFilter, setLeagueFilter] = useState('')
  const [isAdding, startAdding] = useTransition()

  const groups = useMemo(() => {
    const byParent = new Map<string, PolymarketCurationRuleRow[]>()
    for (const rule of rules) {
      const key = rule.parent_ref ?? ''
      byParent.set(key, [...(byParent.get(key) ?? []), rule])
    }
    return Array.from(byParent.entries()).sort(([left], [right]) => left.localeCompare(right))
  }, [rules])

  function addTag(input: { slug?: string; tagId?: number; parentRef?: string | null }) {
    startAdding(async () => {
      const result = await addTagRuleAction(input)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(t('Added {label}', { label: result.rule.label || result.rule.ref }))
      setNewSlug('')
      onAdded()
    })
  }

  function loadLeagues() {
    startAdding(async () => {
      const result = await listLeaguesAction()
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setLeagues(result.leagues)
    })
  }

  const filteredLeagues = (leagues ?? [])
    .filter((league) => {
      const needle = leagueFilter.trim().toLowerCase()
      return !needle || league.name.toLowerCase().includes(needle) || league.sport.toLowerCase().includes(needle)
    })
    .slice(0, 40)

  return (
    <div className="grid gap-6">
      {groups.map(([parent, groupRules]) => (
        <div key={parent || 'top'} className="grid gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {parent ? t('Under {parent}', { parent }) : t('Categories')}
          </h3>
          <div className="grid gap-2">
            {groupRules.map((rule) => (
              <TagRuleRow key={rule.id} rule={rule} disabled={disabled} onSave={onSave} onRemove={onRemove} />
            ))}
          </div>
        </div>
      ))}

      <div className="grid gap-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">{t('Add a category or league')}</h3>
        <div className="flex flex-wrap gap-2">
          <Input
            className="w-48"
            placeholder={t('Polymarket tag, e.g. mlb')}
            value={newSlug}
            onChange={(event) => setNewSlug(event.target.value)}
          />
          <Input
            className="w-48"
            placeholder={t('Group under (optional)')}
            value={newParent}
            onChange={(event) => setNewParent(event.target.value)}
          />
          <Button
            size="sm"
            disabled={isAdding || !newSlug.trim()}
            onClick={() => addTag({ slug: newSlug, parentRef: newParent.trim() || null })}
          >
            {t('Add')}
          </Button>
        </div>
        <div className="grid gap-2">
          {leagues === null ? (
            <Button variant="outline" size="sm" className="w-fit" disabled={isAdding} onClick={loadLeagues}>
              {t('Pick from Polymarket’s sports leagues')}
            </Button>
          ) : (
            <>
              <Input
                className="w-72"
                placeholder={t('Filter leagues')}
                value={leagueFilter}
                onChange={(event) => setLeagueFilter(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {filteredLeagues.map((league) => (
                  <Button
                    key={`${league.sport}-${league.primaryTagId}`}
                    variant="outline"
                    size="sm"
                    disabled={isAdding}
                    onClick={() => addTag({ tagId: league.primaryTagId ?? undefined, parentRef: 'sports' })}
                  >
                    {league.name}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function TagRuleRow({
  rule,
  disabled,
  onSave,
  onRemove,
}: {
  rule: PolymarketCurationRuleRow
  disabled: boolean
  onSave: (input: CurationRuleInput, message?: string) => void
  onRemove: (ref: string) => void
}) {
  const t = useExtracted()
  const filters = rule.filters ?? {}
  const [maxEvents, setMaxEvents] = useState(filters.maxEvents ? String(filters.maxEvents) : '')
  const [minVolume, setMinVolume] = useState(filters.minVolume ? String(filters.minVolume) : '')
  const [minLiquidity, setMinLiquidity] = useState(filters.minLiquidity ? String(filters.minLiquidity) : '')
  const [windowDays, setWindowDays] = useState(filters.windowDays ? String(filters.windowDays) : '')
  const [marketTypes, setMarketTypes] = useState((filters.marketTypes ?? []).join(', '))

  function buildInput(overrides: Partial<CurationRuleInput> = {}): CurationRuleInput {
    const max = parseOptionalNumber(maxEvents)
    const days = parseOptionalNumber(windowDays)
    const types = marketTypes
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    return {
      scope: 'tag',
      ref: rule.ref,
      label: rule.label,
      parentRef: rule.parent_ref,
      mode: rule.mode,
      pinned: rule.pinned,
      sortOrder: rule.sort_order,
      filters: {
        maxEvents: max ? Math.min(100, Math.round(max)) : undefined,
        minVolume: parseOptionalNumber(minVolume),
        minLiquidity: parseOptionalNumber(minLiquidity),
        windowDays: days ? Math.round(days) : undefined,
        marketTypes: types.length > 0 ? types : undefined,
      },
      ...overrides,
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[minmax(10rem,1fr)_auto] lg:items-center">
      <div className="flex items-center gap-3">
        <Switch
          checked={rule.mode === 'include'}
          disabled={disabled}
          onCheckedChange={(checked) => onSave(buildInput({ mode: checked ? 'include' : 'exclude' }))}
          aria-label={t('Show {label}', { label: rule.label || rule.ref })}
        />
        <div className="grid">
          <span className="font-medium">{rule.label || rule.ref}</span>
          <span className="text-xs text-muted-foreground">
            {rule.ref} · {rule.mode === 'include' ? t('Shown') : t('Hidden')}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-24"
          inputMode="numeric"
          placeholder={t('Max events')}
          value={maxEvents}
          onChange={(event) => setMaxEvents(event.target.value)}
        />
        <Input
          className="w-28"
          inputMode="numeric"
          placeholder={t('Min volume $')}
          value={minVolume}
          onChange={(event) => setMinVolume(event.target.value)}
        />
        <Input
          className="w-28"
          inputMode="numeric"
          placeholder={t('Min liquidity $')}
          value={minLiquidity}
          onChange={(event) => setMinLiquidity(event.target.value)}
        />
        <Input
          className="w-28"
          inputMode="numeric"
          placeholder={t('Ends within days')}
          value={windowDays}
          onChange={(event) => setWindowDays(event.target.value)}
        />
        <Input
          className="w-56"
          placeholder={t('Market types: moneyline, spreads…')}
          value={marketTypes}
          onChange={(event) => setMarketTypes(event.target.value)}
        />
        <Button size="sm" disabled={disabled} onClick={() => onSave(buildInput(), t('Saved'))}>
          {t('Save')}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={disabled}
          onClick={() => onRemove(rule.ref)}
          aria-label={t('Remove {label}', { label: rule.label || rule.ref })}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function BrowsePolymarket({
  rules,
  disabled,
  onSave,
  onRemove,
}: {
  rules: PolymarketCurationRuleRow[]
  disabled: boolean
  onSave: (input: CurationRuleInput, message?: string) => void
  onRemove: (scope: 'tag' | 'event' | 'market', ref: string) => void
}) {
  const t = useExtracted()
  const [query, setQuery] = useState('')
  const [tagSlug, setTagSlug] = useState('')
  const [events, setEvents] = useState<BrowsedEvent[] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [isLoading, startLoading] = useTransition()
  const eventRuleById = useMemo(
    () => new Map(rules.filter((rule) => rule.scope === 'event').map((rule) => [rule.ref, rule])),
    [rules],
  )
  const marketRuleById = useMemo(
    () => new Map(rules.filter((rule) => rule.scope === 'market').map((rule) => [rule.ref, rule])),
    [rules],
  )

  function browse() {
    startLoading(async () => {
      const result = await browsePolymarketAction({ query, tagSlug })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setEvents(result.events)
    })
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          placeholder={t('Search Polymarket')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && browse()}
        />
        <span className="text-sm text-muted-foreground">{t('or')}</span>
        <Input
          className="w-48"
          placeholder={t('Tag, e.g. nba')}
          value={tagSlug}
          onChange={(event) => setTagSlug(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && browse()}
        />
        <Button size="sm" onClick={browse} disabled={isLoading}>
          <SearchIcon className="size-4" />
          {t('Browse')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('“Shown” reflects your saved rules. Event and market choices override category switches.')}
      </p>

      {events?.length === 0 && <p className="text-sm text-muted-foreground">{t('Nothing found.')}</p>}

      <div className="grid gap-2">
        {(events ?? []).map((event) => {
          const eventRule = eventRuleById.get(event.id)
          const isOpen = expanded === event.id
          return (
            <div key={event.id} className="grid gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setExpanded(isOpen ? null : event.id)}
                >
                  {isOpen ? (
                    <ChevronDownIcon className="size-4 shrink-0" />
                  ) : (
                    <ChevronRightIcon className="size-4 shrink-0" />
                  )}
                  <span className="truncate font-medium">{event.title}</span>
                </button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t('24h ${amount}', { amount: compactNumber.format(event.volume24hr) })}
                </span>
                <Badge variant={event.shown ? 'default' : 'outline'}>
                  {event.shown ? t('Shown') : t('Hidden')}
                  {event.reason !== 'none' ? ` · ${event.reason}` : ''}
                </Badge>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={eventRule?.mode === 'include' ? 'default' : 'outline'}
                    disabled={disabled}
                    onClick={() =>
                      onSave({
                        scope: 'event',
                        ref: event.id,
                        label: event.title,
                        mode: 'include',
                        pinned: eventRule?.pinned,
                      })
                    }
                  >
                    {t('Show')}
                  </Button>
                  <Button
                    size="sm"
                    variant={eventRule?.mode === 'exclude' ? 'destructive' : 'outline'}
                    disabled={disabled}
                    onClick={() => onSave({ scope: 'event', ref: event.id, label: event.title, mode: 'exclude' })}
                  >
                    {t('Hide')}
                  </Button>
                  <Button
                    size="icon"
                    variant={eventRule?.pinned ? 'default' : 'ghost'}
                    disabled={disabled}
                    aria-label={t('Pin to the top')}
                    onClick={() =>
                      onSave({
                        scope: 'event',
                        ref: event.id,
                        label: event.title,
                        mode: 'include',
                        pinned: !eventRule?.pinned,
                      })
                    }
                  >
                    <PinIcon className="size-4" />
                  </Button>
                  {eventRule && (
                    <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onRemove('event', event.id)}>
                      {t('Reset')}
                    </Button>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="grid gap-1 border-t pt-2">
                  <p className="text-xs text-muted-foreground">{event.tags.join(' · ')}</p>
                  {event.markets.map((market) => {
                    const marketRule = marketRuleById.get(market.conditionId)
                    return (
                      <div key={market.conditionId} className="flex flex-wrap items-center gap-2 py-1">
                        <span className="min-w-0 flex-1 truncate text-sm">{market.title}</span>
                        {market.marketType && <Badge variant="outline">{market.marketType}</Badge>}
                        <span className="text-xs text-muted-foreground">{market.shown ? t('Shown') : t('Hidden')}</span>
                        <Button
                          size="sm"
                          variant={marketRule?.mode === 'include' ? 'default' : 'outline'}
                          disabled={disabled}
                          onClick={() =>
                            onSave({
                              scope: 'market',
                              ref: market.conditionId,
                              label: `${event.title} — ${market.title}`,
                              parentRef: event.id,
                              mode: 'include',
                            })
                          }
                        >
                          {t('Show')}
                        </Button>
                        <Button
                          size="sm"
                          variant={marketRule?.mode === 'exclude' ? 'destructive' : 'outline'}
                          disabled={disabled}
                          onClick={() =>
                            onSave({
                              scope: 'market',
                              ref: market.conditionId,
                              label: `${event.title} — ${market.title}`,
                              parentRef: event.id,
                              mode: 'exclude',
                            })
                          }
                        >
                          {t('Hide')}
                        </Button>
                        {marketRule && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={disabled}
                            onClick={() => onRemove('market', market.conditionId)}
                          >
                            {t('Reset')}
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OverrideRules({
  rules,
  disabled,
  onSave,
  onRemove,
}: {
  rules: PolymarketCurationRuleRow[]
  disabled: boolean
  onSave: (input: CurationRuleInput, message?: string) => void
  onRemove: (scope: 'tag' | 'event' | 'market', ref: string) => void
}) {
  const t = useExtracted()
  if (rules.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('No individual overrides yet. Use Browse & pick.')}</p>
  }
  return (
    <div className="grid gap-2">
      {rules.map((rule) => (
        <div key={rule.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <Badge variant="outline">{rule.scope === 'event' ? t('Event') : t('Market')}</Badge>
          <span className="min-w-0 flex-1 truncate text-sm">{rule.label || rule.ref}</span>
          <Badge variant={rule.mode === 'include' ? 'default' : 'destructive'}>
            {rule.mode === 'include' ? t('Shown') : t('Hidden')}
          </Badge>
          {rule.scope === 'event' && (
            <Button
              size="icon"
              variant={rule.pinned ? 'default' : 'ghost'}
              disabled={disabled}
              aria-label={t('Pin to the top')}
              onClick={() =>
                onSave({ scope: 'event', ref: rule.ref, label: rule.label, mode: 'include', pinned: !rule.pinned })
              }
            >
              <PinIcon className="size-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onRemove(rule.scope, rule.ref)}>
            {t('Remove')}
          </Button>
        </div>
      ))}
    </div>
  )
}
