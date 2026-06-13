'use client'

import type { CommunityEmbedConfigRow, CommunityEmbedTheme } from '@/lib/db/schema/communities/embeds'
import { ChevronLeftIcon, SaveIcon, XIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface EmbedSettingsFormProps {
  communityId: string
  communityName: string
  communitySlug: string
  initial: CommunityEmbedConfigRow | null
}

const MODE_OPTIONS: Array<{ value: 'auto' | 'light' | 'dark', label: string, description: string }> = [
  { value: 'auto', label: 'Auto', description: 'Follow the host page' },
  { value: 'light', label: 'Light', description: 'Force light theme' },
  { value: 'dark', label: 'Dark', description: 'Force dark theme' },
]

export function EmbedSettingsForm({ communityId, communityName, communitySlug, initial }: EmbedSettingsFormProps) {
  const [mode, setMode] = useState<CommunityEmbedTheme['mode']>(initial?.theme?.mode ?? 'auto')
  const [accent, setAccent] = useState(initial?.theme?.accent ?? '')
  const [domains, setDomains] = useState<string[]>(initial?.allowed_domains ?? [])
  const [domainInput, setDomainInput] = useState('')
  const [saving, setSaving] = useState(false)

  function addDomain() {
    const value = domainInput.trim().toLowerCase()
    if (!value || domains.includes(value)) {
      return
    }
    setDomains([...domains, value])
    setDomainInput('')
  }

  function removeDomain(value: string) {
    setDomains(domains.filter(d => d !== value))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/communities/${communityId}/embed-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: { mode, accent: accent.trim() || undefined },
          allowed_domains: domains,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error || 'Could not save embed settings.')
      }
      toast.success('Embed settings saved.')
    }
    catch (error) {
      toast.error((error as Error).message)
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <Link
          href={`/community/${communitySlug}` as any}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
          Back to
          {' '}
          {communityName}
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Embed settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control how this community's markets appear when embedded on external pages.
        </p>
      </div>

      {/* Theme */}
      <Card className="gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">Theme</h2>
          <p className="text-xs text-muted-foreground">How the embed renders inside the host page.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MODE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              className={cn(
                'rounded-sm border p-3 text-left transition-colors',
                mode === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
              )}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.description}</p>
            </button>
          ))}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="accent">Accent color (optional)</Label>
          <Input
            id="accent"
            value={accent}
            onChange={e => setAccent(e.target.value)}
            placeholder="#4f8cff or oklch(0.66 0.18 250)"
            maxLength={64}
          />
          <p className="text-xs text-muted-foreground">
            Used for the &ldquo;View on Prophit&rdquo; link in the embed footer. Leave blank for the default.
          </p>
        </div>
      </Card>

      {/* Allowed domains */}
      <Card className="gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">Allowed domains</h2>
          <p className="text-xs text-muted-foreground">
            Restrict where the embed can be loaded. Leave empty to allow any site (recommended for v1).
            Use
            {' '}
            <code>*.example.com</code>
            {' '}
            to match any subdomain.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={domainInput}
            onChange={e => setDomainInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addDomain()
              }
            }}
            placeholder="bbc.com or *.bbc.com"
          />
          <Button variant="outline" onClick={addDomain}>Add</Button>
        </div>
        {domains.length === 0
          ? (
              <p className="text-xs text-muted-foreground italic">No restrictions — embed anywhere.</p>
            )
          : (
              <ul className="flex flex-wrap gap-1.5">
                {domains.map(domain => (
                  <li key={domain} className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-2 py-1 text-xs">
                    {domain}
                    <button
                      type="button"
                      onClick={() => removeDomain(domain)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${domain}`}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          <SaveIcon className="size-4" />
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </div>
  )
}
