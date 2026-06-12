'use client'

import { ActivityIcon } from 'lucide-react'
import { formatRelativeTime } from '@/components/admin-ui/format'
import { cn } from '@/lib/utils'
import { describeFeedItem } from './activity-format'
import { useCommunityActivity } from './useCommunityActivity'

/**
 * Compact one-line ticker showing the single most-recent community event.
 * Designed to live in CommunityHeader; collapses to nothing when there's no
 * activity yet so it never adds visual noise.
 */
export function ActivityTicker({ communityId, className }: { communityId: string, className?: string }) {
  const query = useCommunityActivity(communityId, 1)
  const item = query.data?.items?.[0]

  if (!item) {
    return null
  }

  return (
    <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}>
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-(--yes) opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-(--yes)" />
      </span>
      <ActivityIcon className="size-3 shrink-0" />
      <span className="truncate">{describeFeedItem(item)}</span>
      <span className="shrink-0 text-muted-foreground/70">·</span>
      <time dateTime={item.createdAt} className="shrink-0">
        {formatRelativeTime(item.createdAt)}
      </time>
    </div>
  )
}
