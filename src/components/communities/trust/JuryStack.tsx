import { initials } from '@/components/communities/format'
import { cn } from '@/lib/utils'

/**
 * Overlapping juror avatars (initials until a photo is set) with a "+N"
 * tail when there are more than fit.
 */

export interface JuryStackPerson {
  userId: string
  username: string | null
  image: string | null
}

interface JuryStackProps {
  people: JuryStackPerson[]
  max?: number
  size?: 'sm' | 'md'
  className?: string
}

export function JuryStack({ people, max = 5, size = 'md', className }: JuryStackProps) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  const dimension = size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs'
  return (
    <span className={cn('inline-flex items-center', className)}>
      {shown.map((person, index) => (
        <span
          key={person.userId}
          className={cn(
            'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary font-semibold text-secondary-foreground ring-2 ring-card',
            dimension,
            index > 0 && '-ml-2',
          )}
          title={person.username ? `@${person.username}` : undefined}
        >
          {person.image ? (
            <img src={person.image} alt="" className="size-full object-cover" />
          ) : (
            initials(person.username)
          )}
        </span>
      ))}
      {rest > 0 && (
        <span
          className={cn(
            '-ml-2 inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-muted-foreground ring-2 ring-card',
            dimension,
          )}
        >
          +{rest}
        </span>
      )}
    </span>
  )
}
