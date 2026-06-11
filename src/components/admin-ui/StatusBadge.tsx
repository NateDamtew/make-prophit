import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground border-transparent',
  info: 'bg-primary/15 text-primary border-transparent',
  success: 'bg-(--yes)/15 text-(--yes) border-transparent',
  warning: 'bg-amber-500/15 text-amber-600 border-transparent dark:text-amber-400',
  danger: 'bg-(--no)/15 text-(--no) border-transparent',
}

// Maps common status strings (jobs, agents, etc.) to a visual tone.
const STATUS_TONE: Record<string, Tone> = {
  pending: 'neutral',
  processing: 'info',
  reserved: 'info',
  active: 'success',
  completed: 'success',
  joined: 'success',
  done: 'success',
  paused: 'warning',
  invited: 'info',
  failed: 'danger',
  revoked: 'danger',
  spam: 'danger',
  error: 'danger',
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function StatusBadge({ status, className }: { status: string, className?: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral'
  return <Badge className={cn(TONE_CLASS[tone], className)}>{titleCase(status)}</Badge>
}
