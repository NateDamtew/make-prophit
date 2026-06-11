import type { AuditFeedItem } from '@/lib/admin-ui/audit'
import { HistoryIcon } from 'lucide-react'
import { EmptyState } from '@/components/admin-ui/EmptyState'
import { formatAbsolute, formatRelativeTime } from '@/components/admin-ui/format'
import { Card } from '@/components/ui/card'

function describe(item: AuditFeedItem): string {
  if (item.summary) {
    return item.summary
  }
  const target = item.targetType ? ` ${item.targetType}` : ''
  return `${item.action}${target}`
}

export function ActivityFeed({ items }: { items: AuditFeedItem[] }) {
  return (
    <Card className="gap-0 p-0">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <h2 className="font-semibold">Recent activity</h2>
        <span className="text-xs text-muted-foreground">Admin audit trail</span>
      </div>

      {items.length === 0
        ? (
            <EmptyState
              icon={HistoryIcon}
              title="No activity yet"
              description="Admin actions like inviting waitlist members or editing settings will show up here."
              className="m-4 border-0"
            />
          )
        : (
            <ul className="divide-y divide-border/50">
              {items.map(item => (
                <li key={item.id} className="flex items-start justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{describe(item)}</p>
                    <p className="text-xs text-muted-foreground">{item.actorLabel}</p>
                  </div>
                  <time
                    dateTime={item.createdAt}
                    title={formatAbsolute(item.createdAt)}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {formatRelativeTime(item.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
    </Card>
  )
}
