'use client'

import type { CommentReactionKind } from '@/lib/db/schema/communities/engagement'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

interface ReactionState {
  count: number
  mine: boolean
}

interface ReactionBarProps {
  targetType: 'market' | 'comment'
  targetId: string
  /** Initial state — typically wired from server data. Updates optimistically on click. */
  initial?: Record<CommentReactionKind, ReactionState> | Record<string, ReactionState>
  /** Called after a successful toggle (lets parent invalidate caches). */
  onChange?: () => void
  size?: 'sm' | 'md'
  className?: string
}

const REACTIONS: { kind: CommentReactionKind, emoji: string, label: string }[] = [
  { kind: 'like', emoji: '👍', label: 'Like' },
  { kind: 'fire', emoji: '🔥', label: 'Fire' },
  { kind: 'target', emoji: '🎯', label: 'Spot on' },
  { kind: 'thinking', emoji: '🤔', label: 'Hmm' },
]

const EMPTY_STATE: ReactionState = { count: 0, mine: false }

export function ReactionBar({ targetType, targetId, initial, onChange, size = 'sm', className }: ReactionBarProps) {
  const [state, setState] = useState<Record<string, ReactionState>>(() => {
    const seed: Record<string, ReactionState> = {}
    for (const r of REACTIONS) {
      seed[r.kind] = (initial as Record<string, ReactionState> | undefined)?.[r.kind] ?? { ...EMPTY_STATE }
    }
    return seed
  })
  const [pending, setPending] = useState<Set<string>>(new Set())

  async function toggle(kind: CommentReactionKind) {
    if (pending.has(kind)) {
      return
    }

    // Optimistic: flip mine + bump count immediately.
    const prev = state[kind] ?? EMPTY_STATE
    const next: ReactionState = prev.mine
      ? { count: Math.max(prev.count - 1, 0), mine: false }
      : { count: prev.count + 1, mine: true }
    setState(s => ({ ...s, [kind]: next }))
    setPending(p => new Set(p).add(kind))

    try {
      const res = await fetch('/api/communities/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, kind }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || 'Failed to react')
      }
      onChange?.()
    }
    catch (error) {
      // Rollback on failure.
      setState(s => ({ ...s, [kind]: prev }))
      toast.error((error as Error).message)
    }
    finally {
      setPending((p) => {
        const next = new Set(p)
        next.delete(kind)
        return next
      })
    }
  }

  const btnSize = size === 'sm'
    ? 'h-7 px-2 text-xs gap-1'
    : 'h-8 px-2.5 text-sm gap-1.5'

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {REACTIONS.map((r) => {
        const s = state[r.kind] ?? EMPTY_STATE
        const isPending = pending.has(r.kind)
        return (
          <button
            key={r.kind}
            type="button"
            disabled={isPending}
            onClick={() => toggle(r.kind)}
            title={r.label}
            className={cn(
              'inline-flex items-center rounded-full border transition-colors',
              btnSize,
              s.mine
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:bg-accent/40',
              isPending && 'opacity-60',
            )}
          >
            <span aria-hidden>{r.emoji}</span>
            {s.count > 0 && <span className="tabular-nums">{s.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
