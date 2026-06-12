'use client'

import { AlertCircle, CheckCircle, Star, XCircle } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/** 5-star input used in the Reviews tab. */
export function StarPicker({ value, onChange }: { value: number, onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(star => (
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
              star <= (hovered || value)
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground/30',
            )}
          />
        </button>
      ))}
    </div>
  )
}

/** Jury vote button. */
export function VoteButton({
  vote,
  current,
  onClick,
}: {
  vote: 'yes' | 'no' | 'disputed'
  current: string
  onClick: () => void
}) {
  const styles = {
    yes: 'border-green-500/30 bg-green-500/10 text-green-600 hover:bg-green-500/20',
    no: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
    disputed: 'border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20',
  }
  const icons = { yes: CheckCircle, no: XCircle, disputed: AlertCircle }
  const Icon = icons[vote]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
        styles[vote],
        current === vote && 'ring-2 ring-current ring-offset-1',
      )}
    >
      <Icon className="size-3.5" />
      {vote === 'yes' ? 'Yes' : vote === 'no' ? 'No' : 'Disputed'}
    </button>
  )
}
