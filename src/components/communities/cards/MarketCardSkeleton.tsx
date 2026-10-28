import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** The market card while it loads: tile, two lines, two buttons, a meta bar. */
export function MarketCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex flex-col gap-3 rounded-xl border border-border bg-card p-4', className)}
      aria-hidden="true"
    >
      <div className="flex items-start gap-3">
        <Skeleton className="size-11 shrink-0 rounded-md" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-3.5 w-[90%]" />
          <Skeleton className="h-3.5 w-[60%]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-11 rounded-md" />
        <Skeleton className="h-11 rounded-md" />
      </div>
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}
