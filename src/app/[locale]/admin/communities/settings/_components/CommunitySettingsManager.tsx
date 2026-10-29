'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SaveIcon } from 'lucide-react'
import { useState } from 'react'

import type { CommunitySettingsPayload } from '@/app/[locale]/admin/api/communities/settings/route'

import { PageHeader } from '@/components/admin-ui/PageHeader'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/**
 * Every limit the pool communities run on, in one page: jury seats by
 * member band, the payout hold, appeal thresholds, each level's rake,
 * split, caps and review mode, the minimum stake, and whether leaders
 * must apply. Saved into the `communities` settings group; the engine
 * reads it on the next pool it opens.
 */

type Settings = CommunitySettingsPayload
type LevelKey = '0' | '1' | '2'

async function fetchSettings(): Promise<Settings> {
  const res = await fetch('/admin/api/communities/settings')
  if (!res.ok) {
    throw new Error(`Failed to load settings (${res.status})`)
  }
  return ((await res.json()) as { data: Settings }).data
}

const inputClass =
  'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:border-foreground tabular-nums'

function minorToMajor(minor: string): string {
  return (Number(minor) / 100).toString()
}

function majorToMinor(major: string): string {
  const value = Number(major)
  return Number.isFinite(value) && value >= 0 ? String(Math.round(value * 100)) : '0'
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
      {label}
      {children}
      {hint ? <span className="font-normal">{hint}</span> : null}
    </label>
  )
}

function Section({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{blurb}</p>
      </div>
      {children}
    </section>
  )
}

export function CommunitySettingsManager() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['admin-community-settings'], queryFn: fetchSettings })
  const [draft, setDraft] = useState<Settings | null>(null)
  const settings = draft ?? query.data ?? null

  const save = useMutation({
    mutationFn: async (value: Settings) => {
      const res = await fetch('/admin/api/communities/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jury: value.jury,
          hold: value.hold,
          appeals: value.appeals,
          levels: Object.fromEntries(
            Object.entries(value.levels).map(([level, caps]) => [
              level,
              {
                name: caps.name,
                rakeBps: caps.rakeBps,
                ownerShareBps: caps.ownerShareBps,
                juryShareBps: caps.juryShareBps,
                maxMembers: caps.maxMembers,
                maxPoolPerMarketMinor: caps.maxPoolPerMarketMinor,
                maxPerPersonMinor: caps.maxPerPersonMinor,
                reviewMode: caps.reviewMode,
                spotCheckRate: caps.spotCheckRate,
              },
            ]),
          ),
          stakes: value.stakes,
          requireApplication: value.requireApplication,
          prophitCommunityIds: value.prophitCommunityIds,
        }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string; data?: Settings }
      if (!res.ok || !payload.data) {
        throw new Error(payload.error || 'Failed to save')
      }
      return payload.data
    },
    onSuccess: (data) => {
      setDraft(null)
      queryClient.setQueryData(['admin-community-settings'], data)
      toast.success('Saved. New pools use these limits.')
    },
    onError: (error) => toast.error((error as Error).message),
  })

  if (query.isLoading || !settings) {
    return <div className="h-96 animate-pulse rounded-xl bg-secondary/40" />
  }
  if (query.error) {
    return <p className="text-sm text-muted-foreground">{(query.error as Error).message}</p>
  }

  function update(next: (current: Settings) => Settings) {
    setDraft(next(settings!))
  }

  function updateLevel(level: LevelKey, patch: Partial<Settings['levels'][string]>) {
    update((current) => ({
      ...current,
      levels: { ...current.levels, [level]: { ...current.levels[level]!, ...patch } },
    }))
  }

  const currency = settings.currency

  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate(settings)
      }}
    >
      <PageHeader
        title="Community settings"
        description="The limits every pool community runs on. Changes apply to the next pool that opens; running pools keep the numbers they opened with."
        actions={
          <Button type="submit" disabled={save.isPending || draft === null}>
            <SaveIcon className="size-4" aria-hidden="true" />
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        }
      />

      <Section
        title="Levels"
        blurb="What each level may do, and how the pool share is split. Shares are in basis points of the rake (4,000 = 40%); Prophit keeps the rest."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {(['0', '1', '2'] as LevelKey[]).map((level) => {
            const caps = settings.levels[level]!
            const prophitBps = Math.max(0, 10_000 - caps.ownerShareBps - caps.juryShareBps)
            return (
              <div key={level} className="grid gap-3 rounded-xl border border-border p-4">
                <p className="text-sm font-bold">Level {level}</p>
                <Field label="Name">
                  <input
                    value={caps.name}
                    onChange={(e) => updateLevel(level, { name: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Pool share (bps)" hint={`${(caps.rakeBps / 100).toFixed(1)}% of every settled pool`}>
                  <input
                    type="number"
                    min={0}
                    max={2000}
                    value={caps.rakeBps}
                    onChange={(e) => updateLevel(level, { rakeBps: Number(e.target.value) })}
                    className={inputClass}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Owner (bps)">
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={caps.ownerShareBps}
                      onChange={(e) => updateLevel(level, { ownerShareBps: Number(e.target.value) })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Jury (bps)">
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={caps.juryShareBps}
                      onChange={(e) => updateLevel(level, { juryShareBps: Number(e.target.value) })}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <p
                  className={cn(
                    'text-xs',
                    prophitBps === 0 && caps.ownerShareBps + caps.juryShareBps > 10_000
                      ? 'text-no-text'
                      : 'text-muted-foreground',
                  )}
                >
                  Prophit keeps {(prophitBps / 100).toFixed(0)}% of the rake
                </p>
                <Field label="Max members">
                  <input
                    type="number"
                    min={1}
                    value={caps.maxMembers}
                    onChange={(e) => updateLevel(level, { maxMembers: Number(e.target.value) })}
                    className={inputClass}
                  />
                </Field>
                <Field label={`Max pool per market (${currency})`}>
                  <input
                    type="number"
                    min={0}
                    value={minorToMajor(caps.maxPoolPerMarketMinor)}
                    onChange={(e) => updateLevel(level, { maxPoolPerMarketMinor: majorToMinor(e.target.value) })}
                    className={inputClass}
                  />
                </Field>
                <Field label={`Max per person per market (${currency})`}>
                  <input
                    type="number"
                    min={0}
                    value={minorToMajor(caps.maxPerPersonMinor)}
                    onChange={(e) => updateLevel(level, { maxPerPersonMinor: majorToMinor(e.target.value) })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Review of new markets">
                  <select
                    value={caps.reviewMode}
                    onChange={(e) => updateLevel(level, { reviewMode: e.target.value as 'every' | 'spot' | 'none' })}
                    className={inputClass}
                  >
                    <option value="every">Every market</option>
                    <option value="spot">Spot checks</option>
                    <option value="none">None</option>
                  </select>
                </Field>
                {caps.reviewMode === 'spot' ? (
                  <Field label="Spot-check rate (0–1)">
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={caps.spotCheckRate}
                      onChange={(e) => updateLevel(level, { spotCheckRate: Number(e.target.value) })}
                      className={inputClass}
                    />
                  </Field>
                ) : null}
              </div>
            )
          })}
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Jury"
          blurb="Seats by community size; a majority decides. The window is how long after close the jury has before every stake is refunded."
        >
          <div className="grid gap-2">
            {settings.jury.bands.map((band, index) => {
              const last = index === settings.jury.bands.length - 1
              return (
                <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <Field label={last ? 'Members (open-ended)' : 'Up to members'}>
                    <input
                      type="number"
                      min={1}
                      value={band.maxMembers ?? ''}
                      disabled={last}
                      placeholder={last ? 'and above' : ''}
                      onChange={(e) =>
                        update((current) => ({
                          ...current,
                          jury: {
                            ...current.jury,
                            bands: current.jury.bands.map((item, i) =>
                              i === index ? { ...item, maxMembers: Number(e.target.value) || null } : item,
                            ),
                          },
                        }))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Seats">
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={band.seats}
                      onChange={(e) =>
                        update((current) => ({
                          ...current,
                          jury: {
                            ...current.jury,
                            bands: current.jury.bands.map((item, i) =>
                              i === index ? { ...item, seats: Number(e.target.value) } : item,
                            ),
                          },
                        }))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={last || settings.jury.bands.length <= 2}
                    onClick={() =>
                      update((current) => ({
                        ...current,
                        jury: { ...current.jury, bands: current.jury.bands.filter((_, i) => i !== index) },
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
              )
            })}
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={settings.jury.bands.length >= 8}
                onClick={() =>
                  update((current) => {
                    const bands = [...current.jury.bands]
                    const last = bands.pop()!
                    const previous = bands[bands.length - 1]?.maxMembers ?? 0
                    return {
                      ...current,
                      jury: {
                        ...current.jury,
                        bands: [...bands, { maxMembers: previous * 2 || 500, seats: last.seats }, last],
                      },
                    }
                  })
                }
              >
                Add a band
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vote window (hours after close)">
              <input
                type="number"
                min={1}
                value={settings.jury.windowHours}
                onChange={(e) => update((c) => ({ ...c, jury: { ...c.jury, windowHours: Number(e.target.value) } }))}
                className={inputClass}
              />
            </Field>
            <Field label="Shortest reason (characters)">
              <input
                type="number"
                min={0}
                value={settings.jury.minReasonChars}
                onChange={(e) => update((c) => ({ ...c, jury: { ...c.jury, minReasonChars: Number(e.target.value) } }))}
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Payout hold and appeals"
          blurb="Payouts wait after a result so anyone can appeal. An appeal needs backers or a share of the pool behind it before Prophit rules."
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hold (hours)">
              <input
                type="number"
                min={0}
                value={settings.hold.holdHours}
                onChange={(e) => update((c) => ({ ...c, hold: { ...c.hold, holdHours: Number(e.target.value) } }))}
                className={inputClass}
              />
            </Field>
            <Field label="Hold with an appeal (hours)">
              <input
                type="number"
                min={0}
                value={settings.hold.appealMaxHours}
                onChange={(e) => update((c) => ({ ...c, hold: { ...c.hold, appealMaxHours: Number(e.target.value) } }))}
                className={inputClass}
              />
            </Field>
            <Field label={`Minimum backing (${currency})`}>
              <input
                type="number"
                min={0}
                value={minorToMajor(settings.appeals.minBackMinor)}
                onChange={(e) =>
                  update((c) => ({ ...c, appeals: { ...c.appeals, minBackMinor: majorToMinor(e.target.value) } }))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Backers needed">
              <input
                type="number"
                min={1}
                value={settings.appeals.backersNeeded}
                onChange={(e) =>
                  update((c) => ({ ...c, appeals: { ...c.appeals, backersNeeded: Number(e.target.value) } }))
                }
                className={inputClass}
              />
            </Field>
            <Field
              label="Or escrow as share of pool (bps)"
              hint={`${(settings.appeals.poolShareBps / 100).toFixed(0)}% of the pool`}
            >
              <input
                type="number"
                min={0}
                max={10000}
                value={settings.appeals.poolShareBps}
                onChange={(e) =>
                  update((c) => ({ ...c, appeals: { ...c.appeals, poolShareBps: Number(e.target.value) } }))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Appeal jurors asked">
              <input
                type="number"
                min={0}
                max={15}
                value={settings.appeals.appealJurors}
                onChange={(e) =>
                  update((c) => ({ ...c, appeals: { ...c.appeals, appealJurors: Number(e.target.value) } }))
                }
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        <Section title="Stakes" blurb="The smallest stake anyone can place, in the community currency.">
          <Field label={`Minimum stake (${currency})`}>
            <input
              type="number"
              min={0}
              value={minorToMajor(settings.stakes.minStakeMinor)}
              onChange={(e) => update((c) => ({ ...c, stakes: { minStakeMinor: majorToMinor(e.target.value) } }))}
              className={cn(inputClass, 'max-w-48')}
            />
          </Field>
        </Section>

        <Section
          title="Leaders and Prophit's own"
          blurb="Whether new leaders apply before they get a community, and which communities Prophit itself runs (shown first on Explore)."
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.requireApplication}
              onChange={(e) => update((c) => ({ ...c, requireApplication: e.target.checked }))}
              className="size-4"
            />
            Leaders must apply before creating a community
          </label>
          <Field label="Prophit's own community ids (one per line)">
            <textarea
              value={settings.prophitCommunityIds.join('\n')}
              onChange={(e) =>
                update((c) => ({
                  ...c,
                  prophitCommunityIds: e.target.value
                    .split(/\s+/)
                    .map((item) => item.trim())
                    .filter(Boolean),
                }))
              }
              rows={3}
              className={cn(inputClass, 'h-auto resize-none py-2 font-mono text-xs')}
            />
          </Field>
        </Section>
      </div>
    </form>
  )
}
