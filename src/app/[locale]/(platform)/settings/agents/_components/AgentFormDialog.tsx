'use client'

import type { AgentRecord } from '@/lib/db/queries/agents'
import { Loader2Icon } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { createAgentAction, updateAgentAction } from '@/app/[locale]/(platform)/settings/agents/_actions/agent-actions'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface AgentFormDialogProps {
  /** When provided, the dialog is in "edit" mode. When null/undefined, "create". */
  agent?: AgentRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the raw API key after creation so the parent can show the reveal dialog. */
  onCreated?: (rawApiKey: string, agentName: string) => void
  onUpdated?: () => void
}

interface FormState {
  name: string
  description: string
  avatar_url: string
  is_public: boolean
  daily_limit_enabled: boolean
  daily_limit_value: string
  total_limit_enabled: boolean
  total_limit_value: string
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  avatar_url: '',
  is_public: true,
  daily_limit_enabled: false,
  daily_limit_value: '',
  total_limit_enabled: false,
  total_limit_value: '',
}

function formStateFromAgent(agent: AgentRecord | null | undefined): FormState {
  if (!agent) {
    return EMPTY_FORM
  }
  return {
    name: agent.name,
    description: agent.description ?? '',
    avatar_url: agent.avatar_url ?? '',
    is_public: agent.is_public,
    daily_limit_enabled: agent.daily_limit_usd !== null,
    daily_limit_value: agent.daily_limit_usd ?? '',
    total_limit_enabled: agent.total_limit_usd !== null,
    total_limit_value: agent.total_limit_usd ?? '',
  }
}

export default function AgentFormDialog({
  agent,
  open,
  onOpenChange,
  onCreated,
  onUpdated,
}: AgentFormDialogProps) {
  const [form, setForm] = useState<FormState>(() => formStateFromAgent(agent))
  const [isPending, startTransition] = useTransition()
  const isEdit = Boolean(agent)

  // Hydrate the form whenever the dialog opens with a different (or fresh) agent.
  useEffect(() => {
    if (open) {
      setForm(formStateFromAgent(agent))
    }
  }, [open, agent])

  function parseLimit(enabled: boolean, value: string): number | null {
    if (!enabled) {
      return null
    }
    const num = Number.parseFloat(value)
    return Number.isFinite(num) && num >= 0 ? num : null
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (form.name.trim().length < 2) {
      toast.error('Agent name must be at least 2 characters.')
      return
    }
    if (form.daily_limit_enabled && parseLimit(true, form.daily_limit_value) === null) {
      toast.error('Daily limit must be a non-negative number.')
      return
    }
    if (form.total_limit_enabled && parseLimit(true, form.total_limit_value) === null) {
      toast.error('Total limit must be a non-negative number.')
      return
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      avatar_url: form.avatar_url.trim() || undefined,
      is_public: form.is_public,
      daily_limit_usd: parseLimit(form.daily_limit_enabled, form.daily_limit_value),
      total_limit_usd: parseLimit(form.total_limit_enabled, form.total_limit_value),
    }

    startTransition(async () => {
      if (isEdit && agent) {
        const result = await updateAgentAction(agent.id, payload)
        if (result.error) {
          toast.error(result.error)
          return
        }
        toast.success(`${agent.name} updated`)
        onOpenChange(false)
        onUpdated?.()
        return
      }

      const result = await createAgentAction(payload)
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Could not create agent.')
        return
      }
      onOpenChange(false)
      onCreated?.(result.data.rawApiKey, result.data.agent.name)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${agent?.name}` : 'Register an agent'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this agent\'s public profile and spending limits.'
              : 'Give your AI agent an identity and decide how much of your wallet it can spend.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          {/* Identity */}
          <div className="grid gap-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              placeholder="e.g. ElectionEdgeBot"
              value={form.name}
              onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))}
              maxLength={60}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="agent-description">Description</Label>
            <Input
              id="agent-description"
              placeholder="What does this agent do?"
              value={form.description}
              onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))}
              maxLength={500}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="agent-avatar">Avatar URL</Label>
            <Input
              id="agent-avatar"
              type="url"
              placeholder="https://… (optional)"
              value={form.avatar_url}
              onChange={event => setForm(prev => ({ ...prev, avatar_url: event.target.value }))}
              maxLength={500}
            />
          </div>

          {/* Public profile toggle */}
          <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-3">
            <div className="grid gap-0.5">
              <Label htmlFor="agent-public" className="text-sm font-medium">Public profile</Label>
              <p className="text-xs text-muted-foreground">
                Show this agent on the public leaderboard and at /agent/&lt;slug&gt; with your name as owner.
              </p>
            </div>
            <Switch
              id="agent-public"
              checked={form.is_public}
              onCheckedChange={checked => setForm(prev => ({ ...prev, is_public: checked }))}
            />
          </div>

          {/* Spending controls — disabled-style notice when limits are off. */}
          <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
            <div>
              <Label className="text-sm font-medium">Spending limits</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Cap how much of your wallet this agent can spend. Trading goes live at mainnet —
                limits will be enforced from day one.
              </p>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="agent-daily-limit" className="text-sm">Daily limit (USD)</Label>
                <Switch
                  id="agent-daily-limit-toggle"
                  checked={form.daily_limit_enabled}
                  onCheckedChange={checked => setForm(prev => ({ ...prev, daily_limit_enabled: checked }))}
                />
              </div>
              {form.daily_limit_enabled && (
                <Input
                  id="agent-daily-limit"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 50"
                  value={form.daily_limit_value}
                  onChange={event => setForm(prev => ({ ...prev, daily_limit_value: event.target.value }))}
                />
              )}
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="agent-total-limit" className="text-sm">Total cap (USD)</Label>
                <Switch
                  id="agent-total-limit-toggle"
                  checked={form.total_limit_enabled}
                  onCheckedChange={checked => setForm(prev => ({ ...prev, total_limit_enabled: checked }))}
                />
              </div>
              {form.total_limit_enabled && (
                <Input
                  id="agent-total-limit"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 500"
                  value={form.total_limit_value}
                  onChange={event => setForm(prev => ({ ...prev, total_limit_value: event.target.value }))}
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {isEdit ? 'Save changes' : 'Create agent'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
