'use client'

import type { QuickViewCard } from './useQuickViewDeck'
import { useCallback, useRef, useState } from 'react'
import EventIconImage from '@/components/EventIconImage'
import { cn } from '@/lib/utils'

export type SwipeSide = 'yes' | 'no'

const SWIPE_COMMIT_DISTANCE = 110
const MAX_ROTATION_DEG = 14

interface SwipeCardProps {
  card: QuickViewCard
  /** Whether this is the top (interactive) card. */
  active: boolean
  /** Depth index for stacking the cards behind the active one. */
  stackIndex: number
  onCommit: (side: SwipeSide) => void
}

/**
 * A single draggable market card. Drag/throw right → Yes/Up, left → No/Down.
 * Releasing past the threshold flies the card out and reports the side; below
 * the threshold it springs back. Buttons provide an accessible, tap-only path.
 */
export default function SwipeCard({ card, active, stackIndex, onCommit }: SwipeCardProps) {
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [flyOut, setFlyOut] = useState<SwipeSide | null>(null)
  const startXRef = useRef(0)
  const pointerIdRef = useRef<number | null>(null)

  const commit = useCallback((side: SwipeSide) => {
    setFlyOut(side)
    // Let the fly-out animation play before notifying the parent.
    window.setTimeout(onCommit, 180, side)
  }, [onCommit])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!active || flyOut) {
      return
    }
    pointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    startXRef.current = event.clientX
    setIsDragging(true)
  }, [active, flyOut])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || pointerIdRef.current !== event.pointerId) {
      return
    }
    setDragX(event.clientX - startXRef.current)
  }, [isDragging])

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return
    }
    pointerIdRef.current = null
    setIsDragging(false)

    if (dragX > SWIPE_COMMIT_DISTANCE) {
      commit('yes')
    }
    else if (dragX < -SWIPE_COMMIT_DISTANCE) {
      commit('no')
    }
    else {
      setDragX(0)
    }
  }, [dragX, commit])

  const effectiveX = flyOut ? (flyOut === 'yes' ? 1000 : -1000) : dragX
  const rotation = Math.max(-MAX_ROTATION_DEG, Math.min(MAX_ROTATION_DEG, effectiveX / 10))
  const intent: SwipeSide | null = effectiveX > 40 ? 'yes' : effectiveX < -40 ? 'no' : null
  const intentStrength = Math.min(1, Math.abs(effectiveX) / SWIPE_COMMIT_DISTANCE)

  // Cards behind the active one are scaled down and nudged up to form a stack.
  const restingScale = active ? 1 : Math.max(0.9, 1 - stackIndex * 0.05)
  const restingTranslateY = active ? 0 : stackIndex * 10

  return (
    <div
      className={cn(
        'absolute inset-0 touch-none select-none',
        active ? 'z-20 cursor-grab active:cursor-grabbing' : 'pointer-events-none z-10',
        (!isDragging || flyOut) && 'transition-transform duration-200 ease-out',
      )}
      style={{
        transform: active
          ? `translateX(${effectiveX}px) rotate(${rotation}deg)`
          : `translateY(${restingTranslateY}px) scale(${restingScale})`,
        opacity: flyOut ? 0 : 1,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border bg-card shadow-xl">
        {/* YES / NO intent overlays while dragging */}
        <div
          className="
            pointer-events-none absolute top-6 left-6 z-10 -rotate-12 rounded-xl border-4 border-yes px-4 py-1 text-2xl
            font-extrabold tracking-wide text-yes
          "
          style={{ opacity: intent === 'yes' ? intentStrength : 0 }}
        >
          {card.yesLabel.toUpperCase()}
        </div>
        <div
          className="
            pointer-events-none absolute top-6 right-6 z-10 rotate-12 rounded-xl border-4 border-no px-4 py-1 text-2xl
            font-extrabold tracking-wide text-no
          "
          style={{ opacity: intent === 'no' ? intentStrength : 0 }}
        >
          {card.noLabel.toUpperCase()}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
          <div className="size-20 overflow-hidden rounded-2xl">
            <EventIconImage
              src={card.iconUrl}
              alt={card.title}
              sizes="80px"
              containerClassName="size-full rounded-2xl"
            />
          </div>

          <h2 className="line-clamp-4 text-xl font-bold text-pretty">{card.title}</h2>

          <div className="flex flex-col items-center gap-1">
            <span className="text-5xl font-extrabold tabular-nums">
              {card.yesChance}
              %
            </span>
            <span className="text-sm font-medium text-muted-foreground">chance</span>
          </div>

          {card.volume > 0 && (
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
              $
              {Intl.NumberFormat('en', { notation: 'compact' }).format(card.volume)}
              {' '}
              Vol.
            </span>
          )}
        </div>

        {/* Tap-only outcome buttons (accessible alternative to swiping) */}
        <div className="grid grid-cols-2 gap-3 p-4">
          <button
            type="button"
            disabled={!active}
            onClick={() => commit('no')}
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
            disabled={!active}
            onClick={() => commit('yes')}
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
