import { CalendarDaysIcon, MicIcon, NewspaperIcon, TrophyIcon, TvIcon, UsersIcon } from 'lucide-react'

import type { LeaderType } from '@/lib/communities/rules'

import { cn } from '@/lib/utils'

/**
 * What kind of leader runs the community. Square corners on purpose: pills
 * say how trusted a community is, squares say what it is.
 */

const META: Record<LeaderType, { label: string; Icon: typeof NewspaperIcon }> = {
  news: { label: 'News', Icon: NewspaperIcon },
  sports: { label: 'Sports', Icon: TrophyIcon },
  creator: { label: 'Creator', Icon: MicIcon },
  show: { label: 'Show', Icon: TvIcon },
  group: { label: 'Group', Icon: UsersIcon },
  event: { label: 'Event', Icon: CalendarDaysIcon },
}

export function LeaderTypeBadge({ type, className }: { type: LeaderType; className?: string }) {
  const { label, Icon } = META[type]
  return (
    <span
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm bg-secondary px-2 text-xs font-semibold text-secondary-foreground',
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  )
}
