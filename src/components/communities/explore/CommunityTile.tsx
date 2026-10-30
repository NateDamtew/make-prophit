import { initials } from '@/components/communities/format'
import { cn } from '@/lib/utils'

/** A community's icon, or its initials on its accent colour (already validated server-side). */
export function CommunityTile({
  name,
  iconUrl,
  accent,
  className,
}: {
  name: string
  iconUrl: string | null
  accent?: string | null
  className?: string
}) {
  const style = accent ? { backgroundColor: accent, color: '#0E0F0D' } : undefined
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-secondary text-[13px] font-extrabold text-muted-foreground',
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      {iconUrl ? <img src={iconUrl} alt="" className="size-full object-cover" /> : initials(name)}
    </span>
  )
}
