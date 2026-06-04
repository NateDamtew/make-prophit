'use client'

import type { QuickViewCard } from './useQuickViewDeck'
import { CalendarIcon, ChevronUpIcon, FlameIcon, SparklesIcon, TrendingUpIcon } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import EventIconImage from '@/components/EventIconImage'
import { cn } from '@/lib/utils'
import CardSparkline from './CardSparkline'
import { useCardPriceHistory } from './useCardPriceHistory'

export type SwipeSide = 'yes' | 'no'

const SWIPE_COMMIT_DISTANCE = 110
const SKIP_DRAG_DISTANCE = 90
const MAX_ROTATION_DEG = 14
const DOUBLE_TAP_MS = 280
const DOUBLE_TAP_RADIUS = 20
/** Lifetime volume in USD above which a market gets a "Hot" badge. */
const HOT_VOLUME_THRESHOLD = 1000

interface SwipeCardProps {
  card: QuickViewCard
  /** Whether this is the top (interactive) card. */
  active: boolean
  /** Depth index for stacking the cards behind the active one. */
  stackIndex: number
  onCommit: (side: SwipeSide) => void
  /** Skip the current card without trading (double-tap, or drag-up to skip). */
  onSkip: () => void
  /** Open the details bottom-sheet for this card. */
  onOpenDetails: () => void
  /**
       When set, the card is frozen showing this side's persistent stamp — the
      user has picked a side and is on the confirm step. Prevents disorientation
      (you always see the card you're confirming, not the next one in the deck).
   */
  stagedSide?: SwipeSide | null
}

type Axis = 'idle' | 'horizontal' | 'vertical'

function formatEndShort(iso: string | null): string | null {
  if (!iso) {
    return null
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  const diffMs = date.getTime() - Date.now()
  if (diffMs <= 0) {
    return 'Ended'
  }
  const oneDayMs = 24 * 60 * 60 * 1000
  if (diffMs < oneDayMs) {
    const hours = Math.max(1, Math.round(diffMs / (60 * 60 * 1000)))
    return `${hours}h left`
  }
  const days = Math.round(diffMs / oneDayMs)
  if (days < 14) {
    return `${days}d left`
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * A single draggable market card.
 *
 * Gestures (only on the top/active card):
 *  • Horizontal drag past threshold → commit Yes (right) or No (left)
 *  • Vertical drag UP past threshold → open details sheet (the FAQ/rules)
 *  • Double-tap → skip this card (fly it upward, no trade)
 *  • Tap-only buttons at the bottom remain as accessibility paths
 *
 * Axis is locked on the first move so a clear horizontal swipe doesn't
 * accidentally trigger details, and vice versa.
 */
export default function SwipeCard({
  card,
  active,
  stackIndex,
  onCommit,
  onSkip,
  onOpenDetails,
  stagedSide = null,
}: SwipeCardProps) {
  const [dragX, setDragX] = useState(0)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [flyOut, setFlyOut] = useState<SwipeSide | 'skip' | null>(null)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const axisRef = useRef<Axis>('idle')
  const pointerIdRef = useRef<number | null>(null)
  const lastTapRef = useRef<{ time: number, x: number, y: number } | null>(null)

  // Trade commits no longer fly the card out — it snaps back so the user can
  // still see exactly which market they're confirming. The persistent stamp
  // (driven by stagedSide from the parent) makes the choice visually obvious.
  const commitSide = useCallback((side: SwipeSide) => {
    setDragX(0)
    setDragY(0)
    onCommit(side)
  }, [onCommit])

  const commitSkip = useCallback(() => {
    setFlyOut('skip')
    window.setTimeout(onSkip, 180)
  }, [onSkip])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // Block all interactions while a side is staged — user must Confirm/Cancel
    // before they can swipe again, so they can't accidentally re-stage.
    if (!active || flyOut || stagedSide) {
      return
    }
    pointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    startXRef.current = event.clientX
    startYRef.current = event.clientY
    axisRef.current = 'idle'
    setIsDragging(true)
  }, [active, flyOut, stagedSide])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || pointerIdRef.current !== event.pointerId) {
      return
    }
    const deltaX = event.clientX - startXRef.current
    const deltaY = event.clientY - startYRef.current

    // Lock the axis on the first meaningful move so swipe/details don't fight.
    if (axisRef.current === 'idle' && (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6)) {
      axisRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
    }

    if (axisRef.current === 'horizontal') {
      setDragX(deltaX)
      setDragY(0)
    }
    else if (axisRef.current === 'vertical') {
      // Allow upward drag only — downward feels wrong here.
      setDragX(0)
      setDragY(Math.min(0, deltaY))
    }
  }, [isDragging])

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return
    }
    pointerIdRef.current = null
    setIsDragging(false)

    const now = Date.now()
    const releaseX = event.clientX
    const releaseY = event.clientY
    const totalDeltaX = releaseX - startXRef.current
    const totalDeltaY = releaseY - startYRef.current
    const movedTrivially = Math.abs(totalDeltaX) < 5 && Math.abs(totalDeltaY) < 5

    // Double-tap detection — only counts when the pointer barely moved.
    if (movedTrivially) {
      const previous = lastTapRef.current
      if (
        previous
        && now - previous.time < DOUBLE_TAP_MS
        && Math.abs(releaseX - previous.x) < DOUBLE_TAP_RADIUS
        && Math.abs(releaseY - previous.y) < DOUBLE_TAP_RADIUS
      ) {
        lastTapRef.current = null
        commitSkip()
        return
      }
      lastTapRef.current = { time: now, x: releaseX, y: releaseY }
      // Reset drag offsets and exit — single tap should not do anything.
      setDragX(0)
      setDragY(0)
      axisRef.current = 'idle'
      return
    }

    // Vertical drag — release determines whether to open details or spring back.
    if (axisRef.current === 'vertical') {
      if (dragY < -SKIP_DRAG_DISTANCE) {
        onOpenDetails()
      }
      setDragX(0)
      setDragY(0)
      axisRef.current = 'idle'
      return
    }

    // Horizontal drag — commit a side or spring back.
    if (dragX > SWIPE_COMMIT_DISTANCE) {
      commitSide('yes')
    }
    else if (dragX < -SWIPE_COMMIT_DISTANCE) {
      commitSide('no')
    }
    else {
      setDragX(0)
    }
    axisRef.current = 'idle'
  }, [dragX, dragY, commitSide, commitSkip, onOpenDetails])

  // Compute presentation values for the active card.
  let effectiveX = dragX
  let effectiveY = dragY
  if (flyOut === 'yes') {
    effectiveX = 1000
  }
  else if (flyOut === 'no') {
    effectiveX = -1000
  }
  else if (flyOut === 'skip') {
    effectiveY = -1000
  }

  const rotation = Math.max(-MAX_ROTATION_DEG, Math.min(MAX_ROTATION_DEG, effectiveX / 10))
  const dragIntent: SwipeSide | null = effectiveX > 40 ? 'yes' : effectiveX < -40 ? 'no' : null
  // When staged, the stamp is pinned to that side at full opacity — that's the
  // visual cue "you've picked, confirm or cancel". Otherwise it tracks the drag.
  const displayedIntent: SwipeSide | null = stagedSide ?? dragIntent
  const horizontalStrength = stagedSide
    ? 1
    : Math.min(1, Math.abs(effectiveX) / SWIPE_COMMIT_DISTANCE)
  const verticalHint = effectiveY < -20 ? Math.min(1, Math.abs(effectiveY) / SKIP_DRAG_DISTANCE) : 0

  // Cards behind the active one are scaled down and nudged up to form a stack.
  const restingScale = active ? 1 : Math.max(0.9, 1 - stackIndex * 0.05)
  const restingTranslateY = active ? 0 : stackIndex * 10

  const endLabel = formatEndShort(card.endDateIso)

  // Only the active card fetches its price history — keeps the deck cheap
  // when the user is swiping fast. React Query caches the result for 5 min,
  // so re-visiting a card is instant.
  const { history, isLoading: isHistoryLoading } = useCardPriceHistory({
    tokenId: card.yesTokenId,
    createdAtIso: card.createdAtIso,
    resolvedAtIso: card.resolvedAtIso,
    enabled: active,
  })

  return (
    <div
      className={cn(
        'absolute inset-0 touch-none select-none',
        active ? 'z-20 cursor-grab active:cursor-grabbing' : 'pointer-events-none z-10',
        (!isDragging || flyOut) && 'transition-transform duration-200 ease-out',
      )}
      style={{
        transform: active
          ? `translate3d(${effectiveX}px, ${effectiveY}px, 0) rotate(${rotation}deg)`
          : `translateY(${restingTranslateY}px) scale(${restingScale})`,
        opacity: flyOut ? 0 : 1,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border bg-card shadow-xl">
        {/* YES / NO intent overlays while dragging horizontally */}
        <div
          className="
            pointer-events-none absolute top-6 left-6 z-10 -rotate-12 rounded-xl border-4 border-yes px-4 py-1 text-2xl
            font-extrabold tracking-wide text-yes
          "
          style={{ opacity: displayedIntent === 'yes' ? horizontalStrength : 0 }}
        >
          {card.yesLabel.toUpperCase()}
        </div>
        <div
          className="
            pointer-events-none absolute top-6 right-6 z-10 rotate-12 rounded-xl border-4 border-no px-4 py-1 text-2xl
            font-extrabold tracking-wide text-no
          "
          style={{ opacity: displayedIntent === 'no' ? horizontalStrength : 0 }}
        >
          {card.noLabel.toUpperCase()}
        </div>

        {/* "Details" hint while dragging upward */}
        <div
          className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center"
          style={{ opacity: verticalHint }}
        >
          <span className="
            flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground
            shadow-md
          "
          >
            <ChevronUpIcon className="size-3.5" />
            Details
          </span>
        </div>

        {/* Top meta row: category (+ Hot/Trending badge) on the left, end date on the right. */}
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <div className="flex min-w-0 items-center gap-1.5">
            {card.category && (
              <span className="
                rounded-full bg-primary/10 px-2.5 py-0.5 text-2xs font-bold tracking-wide text-primary uppercase
              "
              >
                {card.category}
              </span>
            )}
            {/* Social-proof badge — Hot wins over Trending when both apply.
                Hot is the volume-based "this market is alive right now" signal;
                Trending is the platform-curated cue. Both are derived from data
                already on the card, so no extra fetches. */}
            {card.volume >= HOT_VOLUME_THRESHOLD
              ? (
                  <span className="
                    inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-2xs font-bold
                    tracking-wide text-orange-500 uppercase
                  "
                  >
                    <FlameIcon className="size-3" />
                    Hot
                  </span>
                )
              : card.isTrending
                ? (
                    <span className="
                      inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-bold
                      tracking-wide text-amber-500 uppercase
                    "
                    >
                      <SparklesIcon className="size-3" />
                      Trending
                    </span>
                  )
                : null}
          </div>
          {endLabel && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
              <CalendarIcon className="size-3" />
              {endLabel}
            </span>
          )}
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-4 text-center">
          <div className="size-16 overflow-hidden rounded-2xl">
            <EventIconImage
              src={card.iconUrl}
              alt={card.title}
              sizes="64px"
              containerClassName="size-full rounded-2xl"
            />
          </div>

          <h2 className="line-clamp-3 text-lg/tight font-bold text-pretty">{card.title}</h2>

          {card.question && card.question !== card.title && (
            <p className="line-clamp-2 text-xs/snug text-pretty text-muted-foreground">
              {card.question}
            </p>
          )}

          <div className="flex flex-col items-center gap-0.5">
            <span className="text-5xl font-extrabold tabular-nums">
              {card.yesChance}
              %
            </span>
            <span className="text-xs font-medium text-muted-foreground">chance</span>
          </div>

          {/* Price-history sparkline — only the active card fetches/renders */}
          {active && card.yesTokenId && (
            <CardSparkline
              points={history.points}
              deltaPercent={history.deltaPercent}
              isLoading={isHistoryLoading}
            />
          )}

          {card.volume > 0 && (
            <span className="
              inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-[11px] font-semibold
              text-muted-foreground
            "
            >
              <TrendingUpIcon className="size-3" />
              $
              {Intl.NumberFormat('en', { notation: 'compact' }).format(card.volume)}
              {' '}
              Vol.
            </span>
          )}
        </div>

        {/* "View details" handle — tap-only alternative to drag-up */}
        <button
          type="button"
          disabled={!active}
          onClick={onOpenDetails}
          className="
            mx-4 flex items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold
            text-muted-foreground transition-colors
            hover:bg-muted/60 hover:text-foreground
          "
        >
          <ChevronUpIcon className="size-3" />
          Swipe up for details
        </button>

        {/* Tap-only outcome buttons */}
        <div className="grid grid-cols-2 gap-3 p-4 pt-2">
          <button
            type="button"
            disabled={!active || Boolean(stagedSide)}
            onClick={() => commitSide('no')}
            className="
              flex h-14 items-center justify-center gap-2 rounded-2xl bg-no/10 text-base font-bold text-no
              transition-colors
              hover:bg-no/20
            "
          >
            {card.noLabel}
            <span className="tabular-nums opacity-80">
              {card.noPriceCents}
              ¢
            </span>
          </button>
          <button
            type="button"
            disabled={!active || Boolean(stagedSide)}
            onClick={() => commitSide('yes')}
            className="
              flex h-14 items-center justify-center gap-2 rounded-2xl bg-yes/10 text-base font-bold text-yes
              transition-colors
              hover:bg-yes/20
            "
          >
            {card.yesLabel}
            <span className="tabular-nums opacity-80">
              {card.yesPriceCents}
              ¢
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
