'use client'

import { useMemo } from 'react'

interface Vote {
  vote: string
  voted_at: Date
}

interface Props {
  votes: Vote[]
  resolutionDate: Date | null
}

/**
 * Shows cumulative YES% over time as votes come in.
 * Renders a simple SVG line chart with area fill.
 */
export default function CommunityVoteChart({ votes, resolutionDate }: Props) {
  const points = useMemo(() => {
    if (votes.length === 0) {
      // Empty state: flat line at 50% over a placeholder range
      return [
        { x: 0, y: 50, label: 'Start' },
        { x: 100, y: 50, label: 'Now' },
      ]
    }

    const sorted = [...votes].sort(
      (a, b) => new Date(a.voted_at).getTime() - new Date(b.voted_at).getTime(),
    )

    // Time range: first vote → max(now, last vote, resolution date if past)
    const start = new Date(sorted[0].voted_at).getTime()
    const lastVote = new Date(sorted[sorted.length - 1].voted_at).getTime()
    const now = Date.now()
    const end = Math.max(lastVote, now)
    const range = Math.max(end - start, 1)

    let yes = 0
    let no = 0
    const data: { x: number, y: number, label: string }[] = [
      { x: 0, y: 50, label: 'Start' },
    ]

    for (const v of sorted) {
      if (v.vote === 'yes') {
        yes += 1
      }
      else if (v.vote === 'no') {
        no += 1
      }
      const total = yes + no
      const yesPct = total > 0 ? (yes / total) * 100 : 50
      const x = ((new Date(v.voted_at).getTime() - start) / range) * 100
      data.push({
        x,
        y: yesPct,
        label: new Date(v.voted_at).toLocaleDateString(),
      })
    }

    // Pin last point at current time
    const lastPct = data[data.length - 1].y
    data.push({ x: 100, y: lastPct, label: 'Now' })

    return data
  }, [votes])

  // Build SVG path
  const linePath = useMemo(() => {
    if (points.length < 2) {
      return ''
    }
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${100 - p.y}`)
      .join(' ')
  }, [points])

  const areaPath = useMemo(() => {
    if (points.length < 2) {
      return ''
    }
    const path = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${100 - p.y}`)
      .join(' ')
    return `${path} L 100 100 L 0 100 Z`
  }, [points])

  const currentYes = points[points.length - 1]?.y ?? 50
  const isUp = currentYes >= 50

  return (
    <div className="relative h-64 w-full overflow-hidden rounded-lg bg-muted/20 p-3">
      {/* Y-axis labels */}
      <div className="absolute inset-y-3 left-1 flex flex-col justify-between text-[10px] text-muted-foreground">
        <span>100%</span>
        <span>50%</span>
        <span>0%</span>
      </div>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full"
      >
        {/* Gridlines */}
        <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.2" className="text-muted-foreground/30" strokeDasharray="1 1" />
        <line x1="0" y1="25" x2="100" y2="25" stroke="currentColor" strokeWidth="0.15" className="text-muted-foreground/20" strokeDasharray="1 1" />
        <line x1="0" y1="75" x2="100" y2="75" stroke="currentColor" strokeWidth="0.15" className="text-muted-foreground/20" strokeDasharray="1 1" />

        {/* Area gradient */}
        <defs>
          <linearGradient id="yesGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(34, 197, 94)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(34, 197, 94)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="noGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(239, 68, 68)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(239, 68, 68)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Area fill */}
        <path
          d={areaPath}
          fill={isUp ? 'url(#yesGradient)' : 'url(#noGradient)'}
        />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={isUp ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}
          strokeWidth="0.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Vote markers */}
        {points.slice(1, -1).map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={100 - p.y}
            r="1"
            fill={isUp ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}
            stroke="white"
            strokeWidth="0.3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* X-axis */}
      <div className="absolute inset-x-3 bottom-1 flex justify-between text-[10px] text-muted-foreground">
        <span>Created</span>
        {resolutionDate && (
          <span>
            {new Date(resolutionDate).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
      </div>
    </div>
  )
}
