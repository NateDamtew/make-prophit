import { cn } from '@/lib/utils'

export interface BarChartPoint {
  date: string
  count: number
}

/**
 * Lightweight responsive bar chart (no charting dependency). Renders evenly
 * spaced bars with a hover tooltip via the native title attribute and sparse
 * date axis labels.
 */
export function BarChart({ data, className, height = 180 }: { data: BarChartPoint[], className?: string, height?: number }) {
  if (!data || data.length === 0) {
    return (
      <div className={cn('flex items-center justify-center text-sm text-muted-foreground', className)} style={{ height }}>
        No data yet
      </div>
    )
  }

  const max = Math.max(...data.map(d => d.count), 1)
  const labelEvery = Math.ceil(data.length / 6)

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-end gap-0.5" style={{ height }}>
        {data.map((point) => {
          const h = Math.max((point.count / max) * 100, point.count > 0 ? 4 : 0)
          return (
            <div key={point.date} className="group flex flex-1 flex-col justify-end" style={{ height: '100%' }}>
              <div
                className="rounded-t-xs bg-primary/70 transition-colors group-hover:bg-primary"
                style={{ height: `${h}%`, minHeight: point.count > 0 ? 2 : 0 }}
                title={`${point.date}: ${point.count}`}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-2xs text-muted-foreground">
        {data.map((point, i) => (
          <span key={point.date} className="flex-1 text-center">
            {i % labelEvery === 0 ? point.date.slice(5) : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
