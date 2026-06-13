import { BadgeCheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VerifiedBadgeProps {
  /** Whether to render. Cheap to call with false — returns null. */
  isVerified?: boolean | null
  /** Tooltip text. Defaults to a sensible explanation. */
  tooltip?: string
  className?: string
  size?: 'sm' | 'md'
}

/**
 * Verified badge rendered next to a community name. Server-driven (the
 * `is_verified` column on communities) — never trust client state for this.
 */
export function VerifiedBadge({ isVerified, tooltip, className, size = 'md' }: VerifiedBadgeProps) {
  if (!isVerified) {
    return null
  }
  const px = size === 'sm' ? 'size-3.5' : 'size-4'
  return (
    <span
      title={tooltip ?? 'Verified by Prophit — identity and editorial authority confirmed.'}
      aria-label="Verified community"
      className={cn('inline-flex shrink-0 items-center text-primary', className)}
    >
      <BadgeCheckIcon className={px} aria-hidden />
    </span>
  )
}
