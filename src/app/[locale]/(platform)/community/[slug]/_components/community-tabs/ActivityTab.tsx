'use client'

import { ActivityIcon } from 'lucide-react'
import { formatAbsolute, formatRelativeTime } from '@/components/admin-ui/format'
import { describeFeedItem } from '@/components/community-engagement/activity-format'
import { useCommunityActivity } from '@/components/community-engagement/useCommunityActivity'
import { Skeleton } from '@/components/ui/skeleton'

interface ActivityTabProps {
  communityId: string
}

export function ActivityTab({ communityId }: ActivityTabProps) {
  const query = useCommunityActivity(communityId, 100)

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 py-2">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-24" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (query.error) {
    return (
      <div className="rounded-md border border-(--no)/30 bg-(--no)/10 px-3 py-2 text-sm text-(--no)">
        {(query.error as Error).message}
      </div>
    )
  }

  const items = query.data?.items ?? []
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ActivityIcon className="size-5" />
        </div>
        <p className="font-medium">No activity yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Markets, comments, jury votes, and reviews will show up here as soon as members start interacting.
        </p>
      </div>
    )
  }

  return (
    <ol className="divide-y divide-border/60">
      {items.map(item => (
        <li key={item.id} className="flex items-start justify-between gap-4 py-3">
          <p className="min-w-0 text-sm">{describeFeedItem(item)}</p>
          <time
            dateTime={item.createdAt}
            title={formatAbsolute(item.createdAt)}
            className="shrink-0 text-xs text-muted-foreground"
          >
            {formatRelativeTime(item.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  )
}
