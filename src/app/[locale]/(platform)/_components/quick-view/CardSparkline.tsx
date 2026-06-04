'use client'

import type { PricePoint } from './useCardPriceHistory'
import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import { useMemo } from 'react'

interface CardSparklineProps {
  points: PricePoint[]
  deltaPercent: number
  /** Compact loading indicator instead of nothing when fetch is in-flight. */
  isLoading?: boolean
}

const CHART_WIDTH = 260
const CHART_HEIGHT = 56

/**
 * Compact SVG sparkline showing the YES-side price history for a card, plus a
 * coloured delta badge ("↑ 12%" / "↓ 4%"). Matches the OG card's visual
 * language so the in-app deck and the social preview tell the same story.
 */
export default function CardSparkline({ points, deltaPercent, isLoading }: CardSparklineProps) {
  const path = useMemo(() => {
    if (points.length < 2) {
      return null
    }
    const values = points.map(point => point.p)
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const padding = Math.max(0.02, (maxValue - minValue) * 0.2)
    const chartMin = Math.max(0, minValue - padding)
    const chartMax = Math.min(1, maxValue + padding)
    const chartRange = Math.max(chartMax - chartMin, 0.04)

    return points
      .map((point, index) => {
        const x = (index * CHART_WIDTH) / (points.length - 1)
        const normalized = (point.p - chartMin) / chartRange
        const y = CHART_HEIGHT - normalized * CHART_HEIGHT
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  }, [points])

  // Show a slim placeholder while the first request is in-flight so the layout
  // doesn't pop when the data arrives.
  if (isLoading && points.length === 0) {
    return (
      <div className="flex h-14 w-full items-center justify-center">
        <div className="h-px w-32 animate-pulse bg-muted-foreground/30" />
      </div>
    )
  }

  if (!path) {
    return null
  }

  const isUp = deltaPercent >= 0
  const Icon = isUp ? TrendingUpIcon : TrendingDownIcon
  const colorClass = deltaPercent === 0
    ? 'text-muted-foreground'
    : isUp
      ? 'text-yes'
      : 'text-no'
  const strokeColor = deltaPercent === 0
    ? 'currentColor'
    : isUp
      ? 'var(--color-yes, #16a34a)'
      : 'var(--color-no, #dc2626)'

  return (
    <div className="flex w-full flex-col items-center gap-1">
      <svg
        width={CHART_WIDTH}
        height={CHART_HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        aria-hidden="true"
        className="opacity-90"
      >
        <path
          d={path}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`flex items-center gap-1 text-xs font-semibold ${colorClass}`}>
        <Icon className="size-3" />
        {deltaPercent === 0
          ? 'No change'
          : `${isUp ? '+' : ''}${deltaPercent}% since launch`}
      </span>
    </div>
  )
}
