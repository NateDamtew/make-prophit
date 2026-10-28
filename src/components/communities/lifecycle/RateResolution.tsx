'use client'

import { StarIcon } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * "Was this resolved fairly?" Five stars, only for people who lost on the
 * market. Rates the reasoning, not the result, and feeds each juror's record.
 */

interface RateResolutionProps {
  /** The rating already given, if any. */
  value: number | null
  onRate: (rating: number) => void | Promise<void>
  disabled?: boolean
  className?: string
}

export function RateResolution({ value, onRate, disabled = false, className }: RateResolutionProps) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="text-sm font-semibold">Was this resolved fairly?</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Rate the resolution">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} of 5`}
            disabled={disabled}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(star)}
            onBlur={() => setHover(null)}
            onClick={() => onRate(star)}
            className="flex size-12 items-center justify-center rounded-md transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <StarIcon
              className={cn('size-7', star <= shown ? 'fill-foreground text-foreground' : 'text-muted-foreground/40')}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      <p className="text-xs/relaxed text-muted-foreground">
        Rate the reasoning, not the result. Only people who lost on this market can rate it, and ratings feed each
        juror's record.
      </p>
    </div>
  )
}
