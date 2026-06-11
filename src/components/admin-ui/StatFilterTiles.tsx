'use client'

import { formatNumber } from '@/components/admin-ui/format'
import { cn } from '@/lib/utils'

export interface StatTileItem {
  key: string
  label: string
  value?: number
}

/**
 * A row of clickable stat tiles that double as a status filter. Used by the
 * monitoring sections (Sync Jobs, Agents, Waitlist) for a consistent header.
 */
export function StatFilterTiles({
  items,
  activeKey,
  onSelect,
  className,
}: {
  items: StatTileItem[]
  activeKey: string
  onSelect: (key: string) => void
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5', className)}>
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          onClick={() => onSelect(item.key)}
          className={cn(
            'rounded-sm border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40',
            activeKey === item.key ? 'border-primary ring-1 ring-primary/30' : 'border-border',
          )}
        >
          <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {item.value === undefined ? '—' : formatNumber(item.value)}
          </p>
        </button>
      ))}
    </div>
  )
}
