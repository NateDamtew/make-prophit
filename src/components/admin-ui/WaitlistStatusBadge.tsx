import type { WaitlistStatus } from '@/lib/db/schema/waitlist/tables'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<WaitlistStatus, { label: string, className: string }> = {
  pending: { label: 'Pending', className: 'bg-muted text-muted-foreground border-transparent' },
  invited: { label: 'Invited', className: 'bg-primary/15 text-primary border-transparent' },
  joined: { label: 'Joined', className: 'bg-(--yes)/15 text-(--yes) border-transparent' },
  spam: { label: 'Spam', className: 'bg-(--no)/15 text-(--no) border-transparent' },
}

export function WaitlistStatusBadge({ status, className }: { status: WaitlistStatus, className?: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  return <Badge className={cn(config.className, className)}>{config.label}</Badge>
}
