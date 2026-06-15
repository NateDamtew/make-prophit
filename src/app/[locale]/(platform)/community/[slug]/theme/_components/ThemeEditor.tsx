'use client'

import type { LucideIcon } from 'lucide-react'
import type { CommunityThemeState } from '@/lib/db/queries/community-theme'
import type { FontHint, LayoutPreset, SurfaceMode } from '@/lib/db/schema/communities/themes'
import { ActivityIcon, ChevronLeftIcon, GavelIcon, MegaphoneIcon, NewspaperIcon, RotateCcwIcon, SaveIcon, TrophyIcon, UsersIcon } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface ThemeEditorProps {
  communityId: string
  communitySlug: string
  communityName: string
  communityIconUrl: string | null
  communityBannerUrl: string | null
  initial: CommunityThemeState
  markets: Array<{ id: string, title: string, status: string }>
}

interface PresetOption {
  value: LayoutPreset
  label: string
  description: string
  icon: LucideIcon
}

const PRESETS: PresetOption[] = [
  {
    value: 'classic',
    label: 'Classic',
    description: 'The current 5-tab layout: markets, members, jury, reviews, about. Safe default.',
    icon: GavelIcon,
  },
  {
    value: 'newsroom',
    label: 'Newsroom',
    description: 'Editorial layout for journalists and news brands. Featured market + topics + comments.',
    icon: NewspaperIcon,
  },
  {
    value: 'sports',
    label: 'Sports',
    description: 'Live ticker, fixture grouping, leaderboard. For sports and live-event communities.',
    icon: TrophyIcon,
  },
  {
    value: 'forum',
    label: 'Forum',
    description: 'Activity feed promoted, discussion-first. For interest groups and member-led communities.',
    icon: ActivityIcon,
  },
]

const SURFACE_OPTIONS: Array<{ value: SurfaceMode, label: string, description: string }> = [
  { value: 'auto', label: 'Auto', description: 'Follows the platform theme' },
  { value: 'light', label: 'Light', description: 'Force light theme' },
  { value: 'dark', label: 'Dark', description: 'Force dark theme' },
]

const FONT_OPTIONS: Array<{ value: FontHint, label: string, sample: string }> = [
  { value: 'sans', label: 'Sans-serif', sample: 'system-ui' },
  { value: 'serif', label: 'Serif', sample: 'Georgia, serif' },
  { value: 'mono', label: 'Mono', sample: 'monospace' },
]

const ACCENT_PRESETS = [
  '#4f8cff',
  '#ff5d73',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
]

export function ThemeEditor({ communityId, communitySlug, communityName, communityIconUrl, communityBannerUrl, initial, markets }: ThemeEditorProps) {
  const [preset, setPreset] = useState<LayoutPreset>(initial.layout_preset)
  const [accent, setAccent] = useState<string>(initial.accent ?? '')
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>(initial.surface_mode)
  const [fontHint, setFontHint] = useState<FontHint>(initial.font_hint)
  const [featuredMarketId, setFeaturedMarketId] = useState<string | null>(initial.featured_market_id)
  const [saving, setSaving] = useState(false)

  const previewStyle = useMemo(() => {
    const style: Record<string, string> = {}
    if (accent) {
      style['--community-accent'] = accent
    }
    if (fontHint === 'serif') {
      style['fontFamily'] = 'Georgia, "Times New Roman", serif'
    }
    else if (fontHint === 'mono') {
      style['fontFamily'] = 'ui-monospace, SFMono-Regular, "SF Mono", monospace'
    }
    return style as React.CSSProperties
  }, [accent, fontHint])

  const dirty
    = preset !== initial.layout_preset
      || (accent || null) !== initial.accent
      || surfaceMode !== initial.surface_mode
      || fontHint !== initial.font_hint
      || featuredMarketId !== initial.featured_market_id

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/communities/${communityId}/theme`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layout_preset: preset,
          accent: accent.trim() || null,
          surface_mode: surfaceMode,
          font_hint: fontHint,
          featured_market_id: featuredMarketId,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error || 'Could not save theme.')
      }
      toast.success('Theme saved.')
    }
    catch (error) {
      toast.error((error as Error).message)
    }
    finally {
      setSaving(false)
    }
  }

  function reset() {
    setPreset(initial.layout_preset)
    setAccent(initial.accent ?? '')
    setSurfaceMode(initial.surface_mode)
    setFontHint(initial.font_hint)
    setFeaturedMarketId(initial.featured_market_id)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
      <div className="grid gap-6">
        <header>
          <Link
            href={`/community/${communitySlug}` as any}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeftIcon className="size-4" />
            Back to
            {' '}
            {communityName}
          </Link>
          <h1 className="mt-3 text-2xl font-bold">Theme & layout</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a layout that fits your community's purpose, then tune the accent, surface, and type to make it yours.
          </p>
        </header>

        {/* Preset picker */}
        <Card className="gap-4 p-5">
          <div>
            <h2 className="text-sm font-semibold">Layout preset</h2>
            <p className="text-xs text-muted-foreground">Defines the overall structure of your community page.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PRESETS.map((opt) => {
              const Icon = opt.icon
              const isActive = preset === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPreset(opt.value)}
                  className={cn(
                    'group flex flex-col gap-2 rounded-sm border p-3 text-left transition-colors',
                    isActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'flex size-7 items-center justify-center rounded-sm transition-colors',
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                    >
                      <Icon className="size-3.5" />
                    </div>
                    <span className="text-sm font-medium">{opt.label}</span>
                  </div>
                  <p className="text-xs leading-snug text-muted-foreground">{opt.description}</p>
                </button>
              )
            })}
          </div>
        </Card>

        {/* Accent + surface + font */}
        <Card className="gap-4 p-5">
          <div>
            <h2 className="text-sm font-semibold">Brand tokens</h2>
            <p className="text-xs text-muted-foreground">Bounded customization — safe everywhere it's used.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="accent">Accent color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accent.startsWith('#') ? accent : '#4f8cff'}
                onChange={e => setAccent(e.target.value)}
                className="size-10 shrink-0 cursor-pointer rounded-sm border border-border bg-background"
                aria-label="Accent color picker"
              />
              <Input
                id="accent"
                value={accent}
                onChange={e => setAccent(e.target.value)}
                placeholder="#4f8cff, oklch(0.66 0.18 250), or empty for default"
                maxLength={64}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ACCENT_PRESETS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setAccent(color)}
                  className={cn(
                    'size-6 rounded-sm border-2 transition-transform hover:scale-110',
                    accent.toLowerCase() === color ? 'border-foreground' : 'border-transparent',
                  )}
                  style={{ backgroundColor: color }}
                  aria-label={`Use ${color}`}
                />
              ))}
              <button
                type="button"
                onClick={() => setAccent('')}
                className="rounded-sm border border-border px-2 text-2xs text-muted-foreground hover:text-foreground"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Surface mode</Label>
            <div className="grid grid-cols-3 gap-2">
              {SURFACE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSurfaceMode(opt.value)}
                  className={cn(
                    'rounded-sm border p-2 text-left transition-colors',
                    surfaceMode === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                  )}
                >
                  <p className="text-xs font-medium">{opt.label}</p>
                  <p className="text-2xs text-muted-foreground">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Headline font</Label>
            <div className="grid grid-cols-3 gap-2">
              {FONT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFontHint(opt.value)}
                  className={cn(
                    'rounded-sm border p-2 text-left transition-colors',
                    fontHint === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                  )}
                  style={{ fontFamily: opt.sample }}
                >
                  <p className="text-sm font-semibold">Aa</p>
                  <p className="text-2xs text-muted-foreground">{opt.label}</p>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Featured market (Newsroom only) */}
        {preset === 'newsroom' && markets.length > 0 && (
          <Card className="gap-3 p-5">
            <div>
              <h2 className="text-sm font-semibold">Featured market</h2>
              <p className="text-xs text-muted-foreground">Pinned to the Newsroom hero. Pick an active market.</p>
            </div>
            <div className="grid gap-1.5">
              <select
                value={featuredMarketId ?? ''}
                onChange={e => setFeaturedMarketId(e.target.value || null)}
                className="rounded-md border border-border/70 bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">— None —</option>
                {markets
                  .filter(m => m.status === 'active' || m.id === featuredMarketId)
                  .map(m => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
              </select>
            </div>
          </Card>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={reset} disabled={!dirty || saving}>
            <RotateCcwIcon className="size-4" />
            Reset
          </Button>
          <Button onClick={save} disabled={!dirty || saving}>
            <SaveIcon className="size-4" />
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      {/* Live preview snapshot */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <MegaphoneIcon className="size-3" />
          Live preview snapshot
        </div>
        <div className="overflow-hidden rounded-sm border bg-card" style={previewStyle}>
          {/* Banner */}
          <div className="relative h-20 bg-gradient-to-br from-primary/30 via-primary/10 to-background">
            {communityBannerUrl && (
              <img src={communityBannerUrl} alt="" className="size-full object-cover" />
            )}
          </div>
          <div className="-mt-8 px-5 pb-5">
            <div className="mb-3 flex items-end gap-3">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-sm border-4 border-background bg-card text-xl shadow-sm">
                {communityIconUrl
                  ? <img src={communityIconUrl} alt="" className="size-full rounded-sm object-cover" />
                  : '🏛️'}
              </div>
            </div>
            <h3 className="text-lg font-semibold" style={{ color: accent || undefined }}>
              {communityName}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Preview of the
              {' '}
              <strong className="text-foreground">{PRESETS.find(p => p.value === preset)?.label}</strong>
              {' '}
              preset.
            </p>

            <div className="mt-4 grid gap-2">
              <Block label="Markets" accent={accent} active />
              {preset === 'newsroom' && <Block label="Featured market" accent={accent} active />}
              {preset === 'newsroom' && <Block label="By topic" accent={accent} />}
              {preset === 'sports' && <Block label="Live ticker" accent={accent} active />}
              {preset === 'sports' && <Block label="Fixtures" accent={accent} />}
              {preset === 'forum' && <Block label="Activity feed" accent={accent} active />}
              {preset === 'forum' && <Block label="Discussion" accent={accent} />}
              {preset === 'forum' && <Block label="Members" accent={accent} icon={UsersIcon} />}
              {preset === 'classic' && <Block label="Members" accent={accent} icon={UsersIcon} />}
              {preset === 'classic' && <Block label="Jury" accent={accent} />}
              {preset === 'classic' && <Block label="Reviews" accent={accent} />}
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

function Block({ label, accent, active, icon: Icon }: { label: string, accent: string, active?: boolean, icon?: LucideIcon }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-sm border px-3 py-2 text-xs',
        active ? 'border-primary/40 bg-primary/5' : 'border-border bg-background',
      )}
      style={active && accent ? { borderColor: accent, background: `${accent}10` } : undefined}
    >
      {Icon && <Icon className="size-3.5 text-muted-foreground" />}
      <span className="font-medium">{label}</span>
      {active && <span className="ms-auto text-2xs text-muted-foreground">primary</span>}
    </div>
  )
}
