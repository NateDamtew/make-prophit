import type { CommunityLevel } from '@/lib/communities/rules'

import { LEVEL_NAMES } from '@/lib/communities/rules'
import { cn } from '@/lib/utils'

/**
 * The trust level as a pill with three bars: a filled bar is earned, an
 * outlined bar is not yet. Level 0 is an outline pill, Level 1 a raised
 * one, Level 2 inverts to foreground on background. Pills mean "how trusted";
 * square corners (LeaderTypeBadge) mean "what kind".
 */

interface LevelBadgeProps {
  level: CommunityLevel
  /** Override the default level name (from settings). */
  name?: string
  size?: 'sm' | 'md'
  /** Show "Level 1 · Proven"; off shows the bars only. */
  showLabel?: boolean
  className?: string
}

const BAR_HEIGHTS = ['h-1.5', 'h-2.25', 'h-3'] as const

export function LevelBars({ level, className }: { level: CommunityLevel; className?: string }) {
  return (
    <span className={cn('inline-flex items-end gap-px', className)} aria-hidden="true">
      {BAR_HEIGHTS.map((height, index) => (
        <span
          key={height}
          className={cn(
            'w-[3px] rounded-[1px]',
            height,
            index < level + (level === 0 ? 0 : 1) ? 'bg-current' : 'border border-current/50 opacity-70',
          )}
        />
      ))}
    </span>
  )
}

export function LevelBadge({ level, name, size = 'md', showLabel = true, className }: LevelBadgeProps) {
  const label = name ?? LEVEL_NAMES[level]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold whitespace-nowrap tabular-nums',
        size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs',
        level === 0 && 'border border-border text-muted-foreground',
        level === 1 && 'bg-secondary text-secondary-foreground',
        level === 2 && 'bg-foreground font-bold text-background',
        className,
      )}
      title={`Level ${level} · ${label}`}
    >
      <LevelBars level={level} />
      {showLabel && (
        <span>
          Level {level} · {label}
        </span>
      )}
    </span>
  )
}
