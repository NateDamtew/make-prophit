'use client'

import type { QuickViewCard } from './useQuickViewDeck'
import { CalendarIcon, ExternalLinkIcon, FileTextIcon, LinkIcon, XIcon } from 'lucide-react'
import { useEffect } from 'react'

interface CardDetailsSheetProps {
  card: QuickViewCard | null
  open: boolean
  onClose: () => void
  /** Optional referral code so the "View full market" link still earns. */
  affiliateCode?: string
}

function formatEndDate(iso: string | null): string | null {
  if (!iso) {
    return null
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const now = Date.now()
  const diffMs = date.getTime() - now
  const oneDayMs = 24 * 60 * 60 * 1000

  if (diffMs <= 0) {
    return 'Ended'
  }
  if (diffMs < oneDayMs) {
    const hours = Math.max(1, Math.round(diffMs / (60 * 60 * 1000)))
    return `Ends in ${hours}h`
  }
  const days = Math.round(diffMs / oneDayMs)
  if (days < 14) {
    return `Ends in ${days}d`
  }
  return `Ends ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

/**
 * Bottom sheet that shows the deeper market info: rules, resolution source,
 * end date, and a link to the full event page. Triggered by dragging the
 * active card upward (or tapping the details handle).
 */
export default function CardDetailsSheet({ card, open, onClose, affiliateCode }: CardDetailsSheetProps) {
  // Lock scrolling underneath while the sheet is open.
  useEffect(() => {
    if (!open) {
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!card) {
    return null
  }

  const endLabel = formatEndDate(card.endDateIso)
  const eventHref = `/event/${card.eventSlug}${affiliateCode ? `?r=${encodeURIComponent(affiliateCode)}` : ''}`

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Sheet */}
      <div
        className={`
          fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden
          rounded-t-3xl border bg-card shadow-2xl transition-transform duration-300 ease-out
          ${
    open ? 'translate-y-0' : 'translate-y-full'
    }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Market details"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-3">
          <div className="min-w-0">
            {card.category && (
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {card.category}
              </p>
            )}
            <h2 className="mt-1 text-lg/snug font-bold text-pretty">{card.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="
              flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors
              hover:bg-muted hover:text-foreground
            "
          >
            <XIcon className="size-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {/* Quick stats */}
          <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border bg-background/40 p-3">
            <div className="text-center">
              <p className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">Chance</p>
              <p className="mt-0.5 text-base font-extrabold tabular-nums">
                {card.yesChance}
                %
              </p>
            </div>
            <div className="border-x text-center">
              <p className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">Volume</p>
              <p className="mt-0.5 text-base font-extrabold tabular-nums">
                $
                {Intl.NumberFormat('en', { notation: 'compact' }).format(card.volume)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">Ends</p>
              <p className="mt-0.5 truncate text-sm font-extrabold">{endLabel ?? '—'}</p>
            </div>
          </div>

          {/* Question */}
          {card.question && (
            <section className="mb-4">
              <h3 className="
                mb-1.5 flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase
              "
              >
                <FileTextIcon className="size-3.5" />
                Question
              </h3>
              <p className="text-sm/relaxed text-pretty">{card.question}</p>
            </section>
          )}

          {/* Resolution rules */}
          {card.rules
            ? (
                <section className="mb-4">
                  <h3 className="
                    mb-1.5 flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase
                  "
                  >
                    <CalendarIcon className="size-3.5" />
                    Resolution Rules
                  </h3>
                  <p className="text-sm/relaxed whitespace-pre-wrap text-muted-foreground">
                    {card.rules}
                  </p>
                </section>
              )
            : (
                <section className="
                  mb-4 rounded-xl border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground
                "
                >
                  No resolution rules provided for this market.
                </section>
              )}

          {/* Resolution source */}
          {card.resolutionSource && (
            <section className="mb-4">
              <h3 className="
                mb-1.5 flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase
              "
              >
                <LinkIcon className="size-3.5" />
                Resolution Source
              </h3>
              <p className="text-sm/relaxed text-muted-foreground">{card.resolutionSource}</p>
            </section>
          )}
        </div>

        {/* Footer — link out to the full market page (comments, charts, etc.) */}
        <div className="border-t bg-card p-3">
          <a
            href={eventHref}
            target="_blank"
            rel="noopener noreferrer"
            className="
              flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold
              text-primary-foreground transition-opacity
              active:opacity-80
            "
          >
            Open full market
            <ExternalLinkIcon className="size-4" />
          </a>
        </div>
      </div>
    </>
  )
}
