'use client'

import { useExtracted, useLocale } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'

import type { ChartSettings } from '@/app/[locale]/(platform)/event/[slug]/_components/EventChartControls'
import type { TimeRange } from '@/app/[locale]/(platform)/event/[slug]/_hooks/useEventPriceHistory'
import type { PoolSummary } from '@/lib/pools/service'
import type { DataPoint, SeriesConfig } from '@/types/PredictionChartTypes'

import EventChartCanvas from '@/app/[locale]/(platform)/event/[slug]/_components/EventChartCanvas'
import EventChartControls, {
  defaultChartSettings,
} from '@/app/[locale]/(platform)/event/[slug]/_components/EventChartControls'
import EventChartLayout from '@/app/[locale]/(platform)/event/[slug]/_components/EventChartLayout'
import { TIME_RANGES } from '@/app/[locale]/(platform)/event/[slug]/_hooks/useEventPriceHistory'
import { resolveChartRangeStartMs } from '@/app/[locale]/(platform)/event/[slug]/_utils/EventChartUtils'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { useWindowSize } from '@/hooks/useWindowSize'
import { OUTCOME_INDEX } from '@/lib/constants'

import type { PoolMarketRecord, PoolSide } from './pool-market-types'

import { usePoolHistory } from './usePoolMarketData'

/**
 * Price chart for pool markets. Reuses the platform chart canvas, header and
 * controls; the series is the pool's implied YES (or NO) chance over time,
 * derived from the stake history, with the live odds appended as the last
 * point exactly like the order-book chart does with top-of-book prices.
 */

interface PoolChartProps {
  market: PoolMarketRecord
  summary: PoolSummary | null
  isMobile: boolean
  outcomeLabels: { yes: string; no: string }
  /** Dev previews: fixture odds history instead of the server's. */
  previewHistory?: Array<{ t: number; yes: number }>
}

const CHART_HEIGHT = 272

function clampChance(value: number) {
  return Math.max(0, Math.min(100, value))
}

function formatChance(value: number) {
  return `${Math.round(value)}%`
}

export default function PoolChart({ market, summary, isMobile, outcomeLabels, previewHistory }: PoolChartProps) {
  const t = useExtracted()
  const locale = useLocale()
  const nowMs = useNowTimestamp()
  const historyQuery = usePoolHistory(market.id, { enabled: !previewHistory })
  const [activeOutcomeIndex, setActiveOutcomeIndex] = useState<typeof OUTCOME_INDEX.YES | typeof OUTCOME_INDEX.NO>(
    OUTCOME_INDEX.YES,
  )
  const [activeTimeRange, setActiveTimeRange] = useState<TimeRange>('ALL')
  const [chartSettings, setChartSettings] = useState<ChartSettings>(defaultChartSettings)

  const isNoSide = activeOutcomeIndex === OUTCOME_INDEX.NO
  const activeSide: PoolSide = isNoSide ? 'no' : 'yes'
  const activeOutcomeLabel = isNoSide ? outcomeLabels.no : outcomeLabels.yes
  const oppositeOutcomeLabel = isNoSide ? outcomeLabels.yes : outcomeLabels.no
  const seriesKey = `${summary?.pool.id ?? market.id}:${activeSide}`
  const primarySeriesColor = isNoSide ? '#FF6600' : 'var(--primary)'
  const legendSeries = useMemo<SeriesConfig[]>(
    () => [{ key: seriesKey, name: activeOutcomeLabel, color: primarySeriesColor }],
    [activeOutcomeLabel, primarySeriesColor, seriesKey],
  )

  const liveYesChance = summary ? clampChance(summary.pool.odds.yes * 100) : null
  const settledAtMs = summary?.pool.settledAt ? Date.parse(summary.pool.settledAt) : Number.NaN
  const chartEndMs = Number.isFinite(settledAtMs) ? settledAtMs : (nowMs ?? new Date(market.created_at).getTime())

  const chartData = useMemo<DataPoint[]>(() => {
    const history = previewHistory ?? historyQuery.data ?? []
    const points = history.map((point) => ({ t: point.t, yes: clampChance(point.yes) }))
    if (points.length === 0) {
      points.push({ t: new Date(market.created_at).getTime(), yes: liveYesChance ?? 50 })
    }
    const lastPoint = points[points.length - 1]
    const latestYes = liveYesChance ?? lastPoint.yes
    if (chartEndMs > lastPoint.t) {
      points.push({ t: chartEndMs, yes: latestYes })
    } else {
      points[points.length - 1] = { t: lastPoint.t, yes: latestYes }
    }

    const createdAtIso = new Date(market.created_at).toISOString()
    const rangeStartMs = resolveChartRangeStartMs(activeTimeRange, createdAtIso, chartEndMs) ?? points[0].t
    const inRange = points.filter((point) => point.t >= rangeStartMs)
    const before = points.filter((point) => point.t < rangeStartMs)
    const leading = before.length > 0 ? [{ t: rangeStartMs, yes: before[before.length - 1].yes }] : []
    const visible = [...leading, ...inRange]
    if (visible.length === 1) {
      visible.unshift({ t: Math.min(visible[0].t, rangeStartMs), yes: visible[0].yes })
    }

    return visible.map((point) => ({
      date: new Date(point.t),
      [seriesKey]: isNoSide ? 100 - point.yes : point.yes,
    }))
  }, [
    activeTimeRange,
    chartEndMs,
    historyQuery.data,
    isNoSide,
    liveYesChance,
    market.created_at,
    previewHistory,
    seriesKey,
  ])

  const chartScopeKey = `${market.id}:${activeTimeRange}:${activeOutcomeIndex}`
  // The hero carries the headline chance; the canvas tooltip is the only hover readout.
  const handleCursorDataChange = useCallback(() => {}, [])

  const { width: windowWidth } = useWindowSize()
  const chartWidth = isMobile ? (windowWidth || 400) * 0.84 : Math.min((windowWidth || 1440) * 0.55, 900)

  const hasChartData = chartData.length > 0

  return (
    <EventChartLayout
      chart={
        <EventChartCanvas
          chartData={chartData}
          isLoading={!previewHistory && historyQuery.isPending && !summary}
          locale={locale}
          legendSeries={legendSeries}
          chartWidth={chartWidth}
          chartHeight={CHART_HEIGHT}
          chartScopeKey={chartScopeKey}
          onCursorDataChange={handleCursorDataChange}
          isMobile={isMobile}
          isSingleMarket
          chartSettings={chartSettings}
          chartAnnotationMarkers={[]}
          leadingGapStart={chartData[0]?.date ?? null}
          disableResetAnimation={false}
          legendContent={null}
          tradeFlowItems={[]}
          appearance="live"
          tooltipValueFormatter={formatChance}
        />
      }
      controls={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {hasChartData ? (
            <EventChartControls
              timeRanges={TIME_RANGES}
              activeTimeRange={activeTimeRange}
              onTimeRangeChange={setActiveTimeRange}
              showOutcomeSwitch
              oppositeOutcomeLabel={oppositeOutcomeLabel || t('No')}
              onShuffle={() => setActiveOutcomeIndex(isNoSide ? OUTCOME_INDEX.YES : OUTCOME_INDEX.NO)}
              settings={chartSettings}
              onSettingsChange={setChartSettings}
            />
          ) : null}
        </div>
      }
    />
  )
}
