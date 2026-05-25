'use client'

import type { Event } from '@/types'
import type { DataPoint, SeriesConfig } from '@/types/PredictionChartTypes'
import {
  Bookmark,
  CheckCircle2,
  ChevronRight,
  Flame,
  Newspaper,
  Share2,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { buildMarketTargets, useEventPriceHistory } from '@/app/[locale]/(platform)/event/[slug]/_hooks/useEventPriceHistory'
import AppLink from '@/components/AppLink'
import { Card } from '@/components/ui/card'
import { OUTCOME_INDEX } from '@/lib/constants'
import { resolveEventOutcomePath, resolveEventPagePath } from '@/lib/events-routing'
import { formatDate, formatVolume } from '@/lib/formatters'
import { cn } from '@/lib/utils'

// Dynamically load the PredictionChart to bypass SSR issues (visx/d3 require window)
const PredictionChart = dynamic<any>(
  () => import('@/components/PredictionChart'),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center rounded-lg bg-accent/20">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    ),
  },
)

const CHOICE_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4']

// Hook to measure the width of the chart's parent container
function useParentWidth<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null)

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!element) {
      return () => {}
    }

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', onStoreChange)
      return () => {
        window.removeEventListener('resize', onStoreChange)
      }
    }

    const observer = new ResizeObserver(() => {
      onStoreChange()
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [element])

  const getSnapshot = useCallback(() => {
    if (!element) {
      return 300
    }
    const nextWidth = Math.round(element.getBoundingClientRect().width)
    return nextWidth > 0 ? nextWidth : 300
  }, [element])

  const width = useSyncExternalStore(subscribe, getSnapshot, () => {
    return 300
  })

  const ref = useCallback((node: T | null) => {
    setElement((currentElement) => {
      return currentElement === node ? currentElement : node
    })
  }, [])

  return { ref, width }
}

interface HomeHeroProps {
  events: Event[]
}

export default function HomeHero({ events }: HomeHeroProps) {
  // 1. Prepare Featured Events for the Carousel (active, non-sports, sorted by volume)
  const featuredEvents = useMemo(() => {
    return events
      .filter((e) => {
        const isResolved = e.status === 'resolved' || e.resolved_at !== null
        const isDraft = e.status === 'draft'
        const isSports = Boolean(e.sports_event_id || e.sports_sport_slug || e.sports_event_slug)
        return !isResolved && !isDraft && !isSports && e.markets?.length > 0
      })
      .slice(0, 5)
  }, [events])

  // 2. Prepare Sidebar Breaking News (3 events with high activity, different from active featured index)
  const breakingNewsEvents = useMemo(() => {
    const activeSlideIds = new Set(featuredEvents.map(e => e.id))
    return events
      .filter(e => e.status !== 'resolved' && e.markets?.length > 0 && !activeSlideIds.has(e.id))
      .slice(0, 3)
  }, [events, featuredEvents])

  // 3. Carousel state
  const [activeIndex, setActiveIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const activeEvent = featuredEvents[activeIndex]

  useEffect(() => {
    if (isHovered || featuredEvents.length <= 1) {
      return
    }

    const interval = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % featuredEvents.length)
    }, 8000)

    return () => clearInterval(interval)
  }, [featuredEvents.length, isHovered])

  if (featuredEvents.length === 0) {
    return null
  }

  return (
    <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Featured Market Slider Card (Left Column) */}
      <Card
        className="
          relative flex flex-col justify-between overflow-hidden border-border bg-card p-5 shadow-md transition-all
          duration-300
          hover:shadow-lg
          md:p-6
          lg:col-span-2
          dark:bg-card/50
        "
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {activeEvent && (
          <FeaturedEventSlide
            event={activeEvent}
            key={activeEvent.id}
          />
        )}

        {/* Navigation Dots and Pill Tabs */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-4">
          {/* Tag Navigation Pills (Polymarket-style) */}
          <div className="flex flex-wrap gap-2">
            {featuredEvents.map((event, idx) => {
              const category = event.tags?.find(t => t.isMainCategory)?.name || 'General'
              const shortTitle = event.title.length > 25 ? `${event.title.slice(0, 22)}...` : event.title

              return (
                <button
                  key={event.id}
                  onClick={() => setActiveIndex(idx)}
                  className={cn(
                    'cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200',
                    activeIndex === idx
                      ? 'scale-[1.03] bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                      : 'bg-accent/40 text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                  )}
                >
                  {category}
                  :
                  {shortTitle}
                </button>
              )
            })}
          </div>

          {/* Simple Dot Indicators */}
          <div className="flex items-center gap-1.5">
            {featuredEvents.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveIndex(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className={cn(
                  'h-2 cursor-pointer rounded-full transition-all duration-300',
                  activeIndex === idx ? 'w-5 bg-primary' : 'w-2 bg-muted hover:bg-muted-foreground/50',
                )}
              />
            ))}
          </div>
        </div>
      </Card>

      {/* Sidebar News & Hot Topics (Right Column) */}
      <div className="flex flex-col gap-6 lg:col-span-1">
        {/* Breaking News Card */}
        <Card className="flex flex-1 flex-col justify-between border-border bg-card p-5 shadow-md dark:bg-card/50">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold tracking-tight text-foreground/90">
              <Newspaper className="size-4 text-primary" />
              <span>Breaking news</span>
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </div>

            <div className="divide-y divide-border/60">
              {breakingNewsEvents.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No active news markets found.
                </div>
              )}
              {breakingNewsEvents.length > 0 && breakingNewsEvents.map((event, idx) => {
                const primaryMarket = event.markets?.[0]
                const price = primaryMarket ? Math.round((primaryMarket.price ?? 0.5) * 100) : 50
                const isPositive = price >= 50
                const changePercent = Math.abs(price - 50) // Mock trend from baseline 50

                return (
                  <AppLink
                    key={event.id}
                    href={resolveEventPagePath(event)}
                    className="group flex items-start gap-3 py-3 transition-colors first:pt-0 last:pb-0"
                  >
                    <span className="
                      mt-0.5 text-xs font-extrabold text-muted-foreground/60 transition-colors
                      group-hover:text-primary
                    "
                    >
                      {idx + 1}
                    </span>
                    <div className="flex-1 space-y-1">
                      <p className="
                        line-clamp-2 text-xs/normal font-semibold text-card-foreground transition-colors
                        group-hover:text-foreground
                      "
                      >
                        {event.title}
                      </p>
                      <div className="flex items-center gap-2 text-2xs font-bold">
                        <span className="text-foreground/70">
                          {price}
                          % chance
                        </span>
                        <span className={isPositive ? 'text-yes' : 'text-no'}>
                          {isPositive ? '▲' : '▼'}
                          {' '}
                          {changePercent}
                          %
                        </span>
                      </div>
                    </div>
                  </AppLink>
                )
              })}
            </div>
          </div>

          <ButtonLink href="/predictions" label="Explore all markets" />
        </Card>

        {/* Hot Topics Card */}
        <Card className="flex flex-1 flex-col justify-between border-border bg-card p-5 shadow-md dark:bg-card/50">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold tracking-tight text-foreground/90">
              <Flame className="size-4 animate-pulse text-orange-500" />
              <span>Hot topics</span>
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </div>

            <div className="divide-y divide-border/60">
              {[
                { name: 'Politics', volume: '$15.4M today', slug: 'politics' },
                { name: 'Crypto', volume: '$9.2M today', slug: 'crypto' },
                { name: 'AI & Tech', volume: '$4.1M today', slug: 'tech' },
                { name: 'Sports', volume: '$2.8M today', slug: 'sports' },
                { name: 'Pop Culture', volume: '$1.5M today', slug: 'culture' },
              ].map((topic, idx) => (
                <AppLink
                  key={topic.name}
                  href={`/${topic.slug}`}
                  className="group flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="
                      text-xs font-extrabold text-muted-foreground/60 transition-colors
                      group-hover:text-primary
                    "
                    >
                      {idx + 1}
                    </span>
                    <span className="
                      text-xs font-bold text-card-foreground transition-colors
                      group-hover:text-foreground
                    "
                    >
                      {topic.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xs font-semibold text-muted-foreground">
                      {topic.volume}
                    </span>
                    <ChevronRight className="size-3 text-muted-foreground transition-colors group-hover:text-foreground" />
                  </div>
                </AppLink>
              ))}
            </div>
          </div>

          <ButtonLink href="/leaderboard" label="View leaderboard" />
        </Card>
      </div>
    </div>
  )
}

interface FeaturedEventSlideProps {
  event: Event
}

function FeaturedEventSlide({ event }: FeaturedEventSlideProps) {
  const category = event.tags?.find(t => t.isMainCategory)?.name || 'Prediction'
  const isSingleMarket = event.markets?.length === 1
  const primaryMarket = event.markets?.[0]
  const totalVolume = event.volume ?? 0

  // 1. Build targets for price history
  const targets = useMemo(() => {
    return buildMarketTargets(event.markets)
  }, [event.markets])

  // 2. Fetch price history from CLOB via the hook
  const { normalizedHistory } = useEventPriceHistory({
    eventId: event.id,
    range: 'ALL',
    targets,
    eventCreatedAt: event.created_at,
    eventResolvedAt: event.resolved_at,
    refetchIntervalMs: false, // Static load for the hero slide
  })

  // 3. Render chart
  const { ref: chartContainerRef, width: chartContainerWidth } = useParentWidth()

  const { chartData, series } = useMemo(() => {
    if (!primaryMarket) {
      return { chartData: [] as DataPoint[], series: [] as SeriesConfig[] }
    }

    // Series Config
    let seriesList: SeriesConfig[] = []
    if (isSingleMarket) {
      seriesList = [
        {
          key: primaryMarket.condition_id,
          name: 'Yes',
          color: '#22c55e', // Green line for Yes
        },
      ]
    }
    else {
      seriesList = event.markets.slice(0, 4).map((m, idx) => ({
        key: m.condition_id,
        name: m.short_title || m.title,
        color: CHOICE_COLORS[idx % CHOICE_COLORS.length],
      }))
    }

    // If history is empty, supply a default starting point
    let dataPoints: DataPoint[] = normalizedHistory
    if (dataPoints.length === 0) {
      const now = new Date()
      const start = new Date(event.created_at)
      const mockPoints: DataPoint[] = []

      // Create two points (start and end) representing the current price
      seriesList.forEach((s) => {
        const marketObj = event.markets.find(m => m.condition_id === s.key)
        const percentage = marketObj ? (marketObj.price ?? 0.5) * 100 : 50
        mockPoints.push(
          { date: start, [s.key]: percentage },
          { date: now, [s.key]: percentage },
        )
      })
      dataPoints = mockPoints
    }

    return { chartData: dataPoints, series: seriesList }
  }, [event.markets, isSingleMarket, normalizedHistory, primaryMarket, event.created_at])

  const eventHref = resolveEventPagePath(event)

  return (
    <div className="flex h-full flex-1 flex-col justify-between">
      {/* Category header and share actions */}
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span className="tracking-wider text-primary/80 uppercase">{category}</span>
        <div className="flex items-center gap-3">
          <button className="flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground">
            <Share2 className="size-3.5" />
            <span className="hidden sm:inline">Share</span>
          </button>
          <button className="flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground">
            <Bookmark className="size-3.5" />
            <span className="hidden sm:inline">Watch</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Outcomes left, Chart right */}
      <div className="my-3 grid grid-cols-1 items-stretch gap-6 md:grid-cols-12">
        {/* Left Side: Title and outcomes */}
        <div className="flex flex-col justify-between space-y-4 md:col-span-5">
          <AppLink href={eventHref} className="group">
            <h2 className="
              text-lg/snug font-bold text-foreground decoration-primary/30 underline-offset-4 transition-colors
              group-hover:text-primary group-hover:underline
              md:text-xl
            "
            >
              {event.title}
            </h2>
          </AppLink>

          {/* Outcomes list */}
          <div className="space-y-3">
            {isSingleMarket && primaryMarket && (
              // Binary YES / NO Outcomes
              <div className="grid grid-cols-2 gap-3">
                <OutcomeButton
                  event={event}
                  label="Yes"
                  chance={primaryMarket.price ? Math.round(primaryMarket.price * 100) : 50}
                  variant="yes"
                />
                <OutcomeButton
                  event={event}
                  label="No"
                  chance={primaryMarket.price ? 100 - Math.round(primaryMarket.price * 100) : 50}
                  variant="no"
                />
              </div>
            )}

            {!isSingleMarket && (
              // Multiple Choice Outcomes list
              <div className="max-h-[160px] space-y-2 overflow-y-auto pr-1">
                {event.markets.slice(0, 3).map((m, idx) => {
                  const chance = m.price ? Math.round(m.price * 100) : 50
                  return (
                    <AppLink
                      key={m.condition_id}
                      href={resolveEventPagePath(event)}
                      className="
                        flex items-center justify-between rounded-lg border border-border/60 bg-accent/20 px-3 py-2
                        text-xs font-bold transition-all
                        hover:bg-accent/40
                      "
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: CHOICE_COLORS[idx % CHOICE_COLORS.length] }}
                        />
                        <span className="truncate text-foreground/90">{m.short_title || m.title}</span>
                      </div>
                      <span className="text-primary">
                        {chance}
                        %
                      </span>
                    </AppLink>
                  )
                })}
                {event.markets.length > 3 && (
                  <AppLink
                    href={eventHref}
                    className="
                      block text-center text-2xs font-extrabold tracking-wide text-primary uppercase
                      hover:underline
                    "
                  >
                    +
                    {' '}
                    {event.markets.length - 3}
                    {' '}
                    more options
                  </AppLink>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Visual line chart */}
        <div className="flex min-h-[200px] flex-col justify-center md:col-span-7 md:min-h-[240px]" ref={chartContainerRef}>
          {chartData.length > 0 && chartContainerWidth > 0 && (
            <PredictionChart
              data={chartData}
              series={series}
              width={chartContainerWidth}
              height={230}
              margin={{ top: 15, right: 35, bottom: 25, left: 10 }}
              dataSignature={`hero-${event.id}`}
              showXAxis={true}
              showYAxis={true}
              showHorizontalGrid={true}
              showVerticalGrid={false}
              showLegend={false}
              lineCurve="monotoneX"
              autoscale={true}
            />
          )}
          {(chartData.length === 0 || chartContainerWidth === 0) && (
            <div className="flex h-[230px] w-full items-center justify-center rounded-lg bg-accent/10">
              <span className="text-xs text-muted-foreground">Chart loading...</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer volume and target ends */}
      <div className="mt-2 flex items-center gap-4 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <TrendingUp className="size-3.5 text-primary" />
          <span>
            {formatVolume(totalVolume)}
            {' '}
            Vol.
          </span>
        </span>
        <span>•</span>
        <span>
          Ends
          {' '}
          {event.end_date ? formatDate(new Date(event.end_date)) : 'N/A'}
        </span>
      </div>
    </div>
  )
}

// Sub-component for YES/NO outcome buttons inside the slide
interface OutcomeButtonProps {
  event: Event
  label: string
  chance: number
  variant: 'yes' | 'no'
}

function OutcomeButton({ event, label, chance, variant }: OutcomeButtonProps) {
  const href = resolveEventOutcomePath(event, {
    outcomeIndex: variant === 'yes' ? OUTCOME_INDEX.YES : OUTCOME_INDEX.NO,
  })

  return (
    <AppLink
      href={href}
      className={cn(
        `
          group/btn flex cursor-pointer items-center justify-between rounded-xl border p-3 text-sm font-bold shadow-sm
          transition-all duration-300
          hover:scale-[1.02] hover:shadow-md
        `,
        variant === 'yes'
          ? 'border-yes/30 bg-yes/5 text-yes hover:bg-yes/15'
          : 'border-no/30 bg-no/5 text-no hover:bg-no/15',
      )}
    >
      <div className="flex items-center gap-2">
        {variant === 'yes'
          ? (
              <CheckCircle2 className="size-4 shrink-0" />
            )
          : (
              <XCircle className="size-4 shrink-0" />
            )}
        <span>{label}</span>
      </div>
      <span className="text-base font-extrabold">
        {chance}
        %
      </span>
    </AppLink>
  )
}

// ButtonLink sub-component for explore links at bottom of sidebar items
function ButtonLink({ href, label }: { href: string, label: string }) {
  return (
    <AppLink
      href={href}
      className="
        mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-accent/20 px-3 py-2
        text-xs font-bold text-foreground/80 transition-all duration-200
        hover:bg-accent/50 hover:text-foreground
      "
    >
      <span>{label}</span>
      <ChevronRight className="size-3" />
    </AppLink>
  )
}
