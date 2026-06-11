import { cn } from '@/lib/utils'

interface SparklineProps {
  data: number[]
  className?: string
  width?: number
  height?: number
  strokeWidth?: number
}

/**
 * Minimal inline SVG sparkline — no charting dependency. Renders a smoothed
 * area + line using the current accent color. Safe with empty/flat data.
 */
export function Sparkline({ data, className, width = 120, height = 36, strokeWidth = 1.5 }: SparklineProps) {
  if (!data || data.length === 0) {
    return <div className={cn('h-9 w-[120px]', className)} aria-hidden />
  }

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const stepX = data.length > 1 ? width / (data.length - 1) : 0
  const pad = strokeWidth

  const points = data.map((value, i) => {
    const x = data.length === 1 ? width / 2 : i * stepX
    const y = pad + (height - pad * 2) * (1 - (value - min) / range)
    return [x, y] as const
  })

  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible text-primary', className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={areaPath} fill="currentColor" fillOpacity={0.12} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
