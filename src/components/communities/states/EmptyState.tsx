import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * An empty screen is an invitation to act: a title, one or two sentences, and
 * at most one action. Dashed border when the emptiness is temporary (no
 * stakes yet, no jurors seated).
 */

interface EmptyStateProps {
  title: string
  body?: ReactNode
  action?: ReactNode
  dashed?: boolean
  icon?: ReactNode
  className?: string
}

export function EmptyState({ title, body, action, dashed = false, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-xl p-5',
        dashed ? 'border border-dashed border-muted-foreground/40' : 'border border-border bg-card',
        className,
      )}
    >
      {icon}
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold">{title}</p>
        {body && <div className="text-sm/relaxed text-muted-foreground">{body}</div>}
      </div>
      {action}
    </div>
  )
}
