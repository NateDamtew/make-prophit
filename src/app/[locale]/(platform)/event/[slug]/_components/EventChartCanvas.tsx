'use client'

import type { ReactNode } from 'react'

import dynamic from 'next/dynamic'
import { useCallback } from 'react'

import type { TradeFlowLabelItem } from '@/app/[locale]/(platform)/event/[slug]/_utils/eventChartInternalHelpers'
import type {
  DataPoint,
  PredictionChartAnnotationMarker,
  PredictionChartCursorSnapshot,
  PredictionChartProps,
  SeriesConfig,
} from '@/types/PredictionChartTypes'

import { EVENT_PLOT_CLIP_RIGHT_PADDING } from '@/app/[locale]/(platform)/event/[slug]/_utils/eventChartInternalHelpers'

import EventChartTradeFlow from './EventChartTradeFlow'

const PredictionChart = dynamic<PredictionChartProps>(() => import('@/components/PredictionChart'), {
  ssr: false,
  loading: () => <div className="h-[272px] w-full" />,
})

interface EventChartCanvasProps {
  chartData: DataPoint[]
  locale?: string
  legendSeries: SeriesConfig[]
  chartWidth: number
  chartHeight?: number
  isLoading: boolean
  chartScopeKey: string
  onCursorDataChange: (snapshot: PredictionChartCursorSnapshot | null) => void
  isMobile: boolean
  isSingleMarket: boolean
  chartSettings: {
    autoscale: boolean
    xAxis: boolean
    yAxis: boolean
    horizontalGrid: boolean
    verticalGrid: boolean
    annotations: boolean
  }
  chartAnnotationMarkers: PredictionChartAnnotationMarker[]
  leadingGapStart: Date | null
  disableResetAnimation: boolean
  animateMarkerPulse?: boolean
  legendContent: ReactNode
  watermark?: { iconSvg?: string | null; iconImageUrl?: string | null; label?: string | null }
  tradeFlowItems: TradeFlowLabelItem[]
  /**
   * `live` borrows the live-series chart's look (soft area fill under a smooth
   * line, ring marker, hairline grid, neutral axes). Used by pool markets.
   */
  appearance?: 'default' | 'live'
  tooltipValueFormatter?: (value: number) => string
}

const LIVE_APPEARANCE = {
  lineCurve: 'catmullRom',
  lineStrokeWidth: 2.15,
  markerOuterRadius: 10,
  markerInnerRadius: 3.4,
  markerPulseStyle: 'ring',
  markerOffsetX: 0,
  lineEndOffsetX: 0,
  showAreaFill: true,
  areaFillTopOpacity: 0.14,
  areaFillBottomOpacity: 0,
  areaFillBottomOffset: 5,
  gridLineStyle: 'solid',
  gridLineOpacity: 0.42,
  xAxisTickFontSize: 11,
  yAxisTickFontSize: 11,
  alignYAxisLabelsToChartEdge: true,
  fadeYAxisEdges: true,
  neutralAxisColors: true,
  showXAxisTopRule: true,
  showXAxisTopRuleFullWidth: true,
  hideYAxisMinimumLabel: true,
  cursorGuideColor: '#5D6878',
  disableCursorSplit: true,
} as const satisfies Partial<PredictionChartProps>

const CHART_MARGIN = { top: 10, right: 40, bottom: 30, left: 0 }
export default function EventChartCanvas({
  chartData,
  locale = 'en',
  legendSeries,
  chartWidth,
  chartHeight = 272,
  isLoading,
  chartScopeKey,
  onCursorDataChange,
  isMobile,
  isSingleMarket,
  chartSettings,
  chartAnnotationMarkers,
  leadingGapStart,
  disableResetAnimation,
  animateMarkerPulse = true,
  legendContent,
  watermark,
  tradeFlowItems,
  appearance = 'default',
  tooltipValueFormatter,
}: EventChartCanvasProps) {
  const handleCursorDataChange = useCallback(
    (snapshot: PredictionChartCursorSnapshot | null) => {
      onCursorDataChange(snapshot)
    },
    [onCursorDataChange],
  )

  return (
    <div className="relative">
      {isLoading ? (
        <div aria-hidden="true" style={{ height: chartHeight }} />
      ) : (
        <>
          <PredictionChart
            data={chartData}
            series={legendSeries}
            locale={locale}
            width={chartWidth}
            height={chartHeight}
            margin={CHART_MARGIN}
            dataSignature={chartScopeKey}
            dataSyncMode="replace"
            onCursorDataChange={handleCursorDataChange}
            xAxisTickCount={isMobile ? 2 : 4}
            autoscale={chartSettings.autoscale}
            showXAxis={chartSettings.xAxis}
            showYAxis={chartSettings.yAxis}
            showHorizontalGrid={chartSettings.horizontalGrid}
            showVerticalGrid={chartSettings.verticalGrid}
            showAnnotations={chartSettings.annotations && chartAnnotationMarkers.length > 0}
            annotationMarkers={chartAnnotationMarkers}
            leadingGapStart={leadingGapStart}
            disableResetAnimation={disableResetAnimation}
            animateMarkerPulse={animateMarkerPulse}
            legendContent={legendContent}
            showLegend={!isSingleMarket}
            watermark={isSingleMarket ? undefined : watermark}
            lineCurve="monotoneX"
            plotClipPadding={{ right: EVENT_PLOT_CLIP_RIGHT_PADDING }}
            tooltipLabelVariant="panel"
            tooltipValueFormatter={tooltipValueFormatter}
            {...(appearance === 'live' ? LIVE_APPEARANCE : {})}
            tooltipDateFormatter={(date) =>
              date.toLocaleString(locale, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
            }
          />
          <EventChartTradeFlow items={tradeFlowItems} />
        </>
      )}
    </div>
  )
}
