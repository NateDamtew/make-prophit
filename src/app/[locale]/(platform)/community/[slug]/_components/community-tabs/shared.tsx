'use client'

import { Star } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

/** 5-star input used in the Reviews tab. */
export function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
          className="transition-transform hover:scale-110"
        >
          <Star
            className={cn(
              'size-6 transition-colors',
              star <= (hovered || value) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30',
            )}
          />
        </button>
      ))}
    </div>
  )
}

/** Jury vote button. */
