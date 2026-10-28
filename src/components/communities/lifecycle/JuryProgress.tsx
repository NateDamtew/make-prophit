import { cn } from '@/lib/utils'

/**
 * "2 of 5 voted": one segment per seat, filled as sealed votes come in.
 */

interface JuryProgressProps {
  seats: number
  voted: number
  required: number
  /** Short line under the segments, e.g. "Verdicts due by Sun 6:00 pm". */
  caption?: string | null
  className?: string
}

export function JuryProgress({ seats, voted, required, caption, className }: JuryProgressProps) {
  const total = Math.max(1, seats)
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">Jury is deciding</span>
        <span className="text-muted-foreground tabular-nums">
          {Math.min(voted, total)}/{total} voted
        </span>
      </div>
      <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={voted}>
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn('h-1.5 flex-1 rounded-full', index < voted ? 'bg-foreground' : 'bg-secondary')}
            aria-hidden="true"
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {required} of {total} must agree.{caption ? ` ${caption}` : ''}
      </p>
    </div>
  )
}
