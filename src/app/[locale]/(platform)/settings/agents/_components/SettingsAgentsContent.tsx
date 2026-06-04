'use client'

import type { AgentRecord } from '@/lib/db/queries/agents'
import {
  BotIcon,
  EllipsisVerticalIcon,
  GlobeIcon,
  KeyRoundIcon,
  LockIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react'
import Image from 'next/image'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  deleteAgentAction,
  rotateAgentApiKeyAction,
  updateAgentAction,
} from '@/app/[locale]/(platform)/settings/agents/_actions/agent-actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import AgentApiKeyDialog from './AgentApiKeyDialog'
import AgentFormDialog from './AgentFormDialog'

interface SettingsAgentsContentProps {
  initialAgents: AgentRecord[]
}

interface KeyRevealState {
  rawKey: string
  agentName: string
  context: 'created' | 'rotated'
}

interface ConfirmState {
  title: string
  description: string
  destructive?: boolean
  confirmLabel: string
  onConfirm: () => void
}

function formatLimit(value: string | null) {
  if (value === null) {
    return null
  }
  const num = Number.parseFloat(value)
  if (!Number.isFinite(num)) {
    return null
  }
  if (num >= 1000) {
    return `$${Math.round(num).toLocaleString('en-US')}`
  }
  return `$${num.toFixed(num >= 10 ? 0 : 2)}`
}

export default function SettingsAgentsContent({ initialAgents }: SettingsAgentsContentProps) {
  const [agents, setAgents] = useState<AgentRecord[]>(initialAgents)
  const [formOpen, setFormOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentRecord | null>(null)
  const [keyReveal, setKeyReveal] = useState<KeyRevealState | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setEditingAgent(null)
    setFormOpen(true)
  }

  function openEdit(agent: AgentRecord) {
    setEditingAgent(agent)
    setFormOpen(true)
  }

  function handleCreated(rawApiKey: string, agentName: string) {
    setKeyReveal({ rawKey: rawApiKey, agentName, context: 'created' })
    refresh()
  }

  function refresh() {
    // The form action revalidates the route, but Next's client cache is fine —
    // a full page reload keeps the demo flow simple. Lightweight and reliable.
    window.location.reload()
  }

  function handleRotate(agent: AgentRecord) {
    setConfirmState({
      title: `Rotate ${agent.name}'s API key?`,
      description: 'The current key will stop working immediately. Update any apps or services that use it.',
      confirmLabel: 'Rotate key',
      onConfirm: () => {
        startTransition(async () => {
          const result = await rotateAgentApiKeyAction(agent.id)
          if (result.error || !result.data) {
            toast.error(result.error ?? 'Could not rotate key.')
            return
          }
          setKeyReveal({
            rawKey: result.data.rawApiKey,
            agentName: result.data.agent.name,
            context: 'rotated',
          })
        })
      },
    })
  }

  function handleToggleStatus(agent: AgentRecord) {
    const next = agent.status === 'active' ? 'paused' : 'active'
    startTransition(async () => {
      const result = await updateAgentAction(agent.id, { status: next })
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Could not update status.')
        return
      }
      setAgents(prev => prev.map(a => (a.id === agent.id ? result.data! : a)))
      toast.success(next === 'paused' ? `${agent.name} paused` : `${agent.name} resumed`)
    })
  }

  function handleDelete(agent: AgentRecord) {
    setConfirmState({
      title: `Delete ${agent.name}?`,
      description: 'This cannot be undone. The agent\'s API keys, history, and leaderboard position will be removed.',
      destructive: true,
      confirmLabel: 'Delete agent',
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteAgentAction(agent.id)
          if (result.error) {
            toast.error(result.error)
            return
          }
          setAgents(prev => prev.filter(a => a.id !== agent.id))
          toast.success(`${agent.name} deleted`)
        })
      },
    })
  }

  return (
    <section className="grid gap-6">
      <div className="flex items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Your agents</h2>
          <p className="text-sm text-muted-foreground">
            Register an agent to get API credentials. Read access is live now; trading goes live with mainnet.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <PlusIcon className="mr-1.5 size-4" />
          New agent
        </Button>
      </div>

      {agents.length === 0
        ? (
            <div className="
              grid place-items-center gap-3 rounded-lg border border-dashed bg-card/40 px-6 py-12 text-center
            "
            >
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                <BotIcon className="size-6 text-primary" />
              </div>
              <div className="grid gap-1">
                <p className="font-medium">No agents yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Register your first agent to get API keys for the REST API and MCP server.
                </p>
              </div>
              <Button onClick={openCreate} size="sm">
                <PlusIcon className="mr-1.5 size-4" />
                Register an agent
              </Button>
            </div>
          )
        : (
            <ul className="grid gap-3">
              {agents.map(agent => (
                <li
                  key={agent.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors',
                    agent.status !== 'active' && 'opacity-70',
                  )}
                >
                  {/* Avatar — next/image with unoptimized since user-supplied
                      URLs aren't on our remotePatterns allowlist. */}
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-primary/10">
                    {agent.avatar_url
                      ? (
                          <Image
                            src={agent.avatar_url}
                            alt=""
                            fill
                            sizes="48px"
                            unoptimized
                            className="object-cover"
                          />
                        )
                      : (
                          <div className="flex size-full items-center justify-center">
                            <BotIcon className="size-6 text-primary" />
                          </div>
                        )}
                  </div>

                  {/* Identity + meta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{agent.name}</span>
                      <span
                        className={cn(
                          `
                            inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold tracking-wide
                            uppercase
                          `,
                          agent.is_public
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {agent.is_public ? <GlobeIcon className="size-2.5" /> : <LockIcon className="size-2.5" />}
                        {agent.is_public ? 'Public' : 'Private'}
                      </span>
                      {agent.status !== 'active' && (
                        <span className="
                          rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-bold tracking-wide text-amber-600
                          uppercase
                        "
                        >
                          {agent.status}
                        </span>
                      )}
                    </div>

                    {agent.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>
                    )}

                    {/* Key prefix + limits — small meta row */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <KeyRoundIcon className="size-3" />
                        <code className="font-mono tabular-nums">
                          {agent.api_key_prefix}
                          ········
                        </code>
                      </span>
                      {agent.daily_limit_usd !== null && (
                        <span>
                          Daily cap:
                          {' '}
                          {formatLimit(agent.daily_limit_usd)}
                        </span>
                      )}
                      {agent.total_limit_usd !== null && (
                        <span>
                          Total cap:
                          {' '}
                          {formatLimit(agent.total_limit_usd)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={isPending} aria-label="Agent actions">
                        <EllipsisVerticalIcon className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onSelect={() => openEdit(agent)}>
                        <RefreshCwIcon className="size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleRotate(agent)}>
                        <KeyRoundIcon className="size-4" />
                        Rotate API key
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleToggleStatus(agent)}>
                        {agent.status === 'active' ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
                        {agent.status === 'active' ? 'Pause' : 'Resume'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => handleDelete(agent)}
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      >
                        <Trash2Icon className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}

      <AgentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        agent={editingAgent}
        onCreated={handleCreated}
        onUpdated={refresh}
      />

      <AgentApiKeyDialog
        rawKey={keyReveal?.rawKey ?? null}
        agentName={keyReveal?.agentName ?? null}
        context={keyReveal?.context ?? 'created'}
        onClose={() => {
          setKeyReveal(null)
          refresh()
        }}
      />

      {/* Shared confirm dialog for destructive actions — replaces window.confirm
          so the UI stays consistent and accessible. */}
      <Dialog
        open={confirmState !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmState(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmState?.title}</DialogTitle>
            <DialogDescription>{confirmState?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmState(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant={confirmState?.destructive ? 'destructive' : 'default'}
              disabled={isPending}
              onClick={() => {
                const fn = confirmState?.onConfirm
                setConfirmState(null)
                fn?.()
              }}
            >
              {confirmState?.confirmLabel ?? 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
