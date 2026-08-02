'use client'

import type { SwipeSide } from './SwipeCard'
import type { QuickViewCard } from './useQuickViewDeck'
import { Loader2Icon, RotateCcwIcon, ShareIcon, WalletIcon, XIcon, ZapIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/components/ui/toast'
import SiteLogoIcon from '@/components/SiteLogoIcon'
import { Button } from '@/components/ui/button'
import { useAppKit } from '@/hooks/useAppKit'
import { useBalance } from '@/hooks/useBalance'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import { authClient } from '@/lib/auth-client'
import { OUTCOME_INDEX } from '@/lib/constants'
import { shareOrCopy } from '@/lib/native-share'
import { cn } from '@/lib/utils'
import { useUser } from '@/stores/useUser'
import CardDetailsSheet from './CardDetailsSheet'
import QuickViewWalkthrough from './QuickViewWalkthrough'
import SwipeCard from './SwipeCard'
import { usePlaceQuickTrade } from './usePlaceQuickTrade'
import { useQuickViewDeck } from './useQuickViewDeck'

const { useSession } = authClient

const STAKE_CHIPS = [1, 5, 10] as const
const DEFAULT_STAKE = 1
const MAX_CUSTOM_STAKE = 10_000

/**
 * Total payout if the side wins: each share pays $1, so shares = stake/price
 * and payout = stake / (cents/100). At 50¢ price, $1 stakes pays $2.
 * Returns 0 if price is invalid so the UI hides the "Win" line.
 */
function calculatePotentialReturn(stake: number, priceCents: number): number {
  if (!Number.isFinite(stake) || stake <= 0 || priceCents <= 0 || priceCents > 100) {
    return 0
  }
  return stake / (priceCents / 100)
}

function formatMoney(value: number): string {
  if (value >= 1000) {
    return `$${Math.round(value).toLocaleString('en-US')}`
  }
  if (value >= 10) {
    return `$${value.toFixed(0)}`
  }
  return `$${value.toFixed(2)}`
}

interface StagedTrade {
  card: QuickViewCard
  side: SwipeSide
}

export default function QuickView({ open, onClose }: { open: boolean, onClose: () => void }) {
  const hasHydrated = useHasHydrated()
  const { open: openWallet } = useAppKit()
  const { data: session } = useSession()
  const user = useUser()
  const { balance } = useBalance()
  const site = useSiteIdentity()

  const isAuthenticated = hasHydrated && (Boolean(session?.user) || Boolean(user))
  const hasBalance = (balance?.raw ?? 0) > 0

  const placeQuickTrade = usePlaceQuickTrade()
  const { cards, isLoading, isError, refetch } = useQuickViewDeck(open)

  const [index, setIndex] = useState(0)
  const [staged, setStaged] = useState<StagedTrade | null>(null)
  const [stake, setStake] = useState<number>(DEFAULT_STAKE)
  const [isCustomMode, setIsCustomMode] = useState(false)
  const [customInput, setCustomInput] = useState<string>('')
  const [isPlacing, setIsPlacing] = useState(false)
  const [detailsCard, setDetailsCard] = useState<QuickViewCard | null>(null)

  const affiliateCode = user?.affiliate_code?.trim() ?? ''

  // Reset the deck position whenever the view is (re)opened.
  useEffect(() => {
    if (open) {
      setIndex(0)
      setStaged(null)
      setStake(DEFAULT_STAKE)
      setIsCustomMode(false)
      setCustomInput('')
    }
  }, [open])

  const handleCommit = useCallback((card: QuickViewCard, side: SwipeSide) => {
    setStaged({ card, side })
  }, [])

  const advance = useCallback(() => {
    setStaged(null)
    setIsCustomMode(false)
    setCustomInput('')
    setIndex(current => current + 1)
  }, [])

  const handleSkip = useCallback(() => {
    // Double-tap or drag-up-to-skip: drop the card without trading.
    setStaged(null)
    setIsCustomMode(false)
    setCustomInput('')
    setIndex(current => current + 1)
  }, [])

  const handleOpenDetails = useCallback((card: QuickViewCard) => {
    setDetailsCard(card)
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!staged || isPlacing) {
      return
    }

    if (!isAuthenticated) {
      void openWallet()
      return
    }

    if (!hasBalance) {
      toast.info('Add funds to start trading.', {
        description: 'Deposit to your wallet, then swipe to trade.',
      })
      return
    }

    const { card, side } = staged
    const isYes = side === 'yes'
    const sideLabel = isYes ? card.yesLabel : card.noLabel

    // Place a real MARKET BUY through the same pipeline as the event order panel.
    setIsPlacing(true)
    const result = await placeQuickTrade({
      tokenId: isYes ? card.yesTokenId : card.noTokenId,
      conditionId: card.conditionId,
      eventSlug: card.eventSlug,
      outcomeIndex: isYes ? OUTCOME_INDEX.YES : OUTCOME_INDEX.NO,
      priceCents: isYes ? card.yesPriceCents : card.noPriceCents,
      amountUsd: stake,
      negRisk: card.negRisk,
    })
    setIsPlacing(false)

    if (result.status === 'success') {
      toast.success(`Bought ${sideLabel} · ${formatMoney(stake)}`, {
        description: card.title,
      })
      advance()
      return
    }

    if (result.status === 'error') {
      toast.error('Trade failed', { description: result.message })
    }
    // 'not-ready' (onboarding opened) and 'cancelled' (signature dismissed)
    // leave the trade staged so the user can retry after resolving it.
  }, [staged, isPlacing, isAuthenticated, hasBalance, openWallet, placeQuickTrade, stake, advance])

  const visibleCards = useMemo(() => cards.slice(index, index + 3), [cards, index])
  const isDeckFinished = !isLoading && cards.length > 0 && index >= cards.length

  // Potential return for the currently-staged trade (if any) — hoisted out of
  // JSX so we don't need an IIFE during render.
  const stagedPriceCents = staged
    ? (staged.side === 'yes' ? staged.card.yesPriceCents : staged.card.noPriceCents)
    : 0
  const stagedPotentialReturn = staged ? calculatePotentialReturn(stake, stagedPriceCents) : 0
  const stagedProfit = stagedPotentialReturn - stake

  /**
   * Share the currently-visible market (or the platform itself when the deck
   * is empty/finished). Native OS share sheet on mobile, clipboard on desktop —
   * same util as the event-page share. The user's affiliate code is preserved
   * so referral attribution works.
   */
  const handleShare = useCallback(async () => {
    if (typeof window === 'undefined') {
      return
    }
    const topCard = visibleCards[0] ?? null
    const path = topCard ? `/event/${topCard.eventSlug}` : '/'
    const url = new URL(path, window.location.origin)
    if (affiliateCode) {
      url.searchParams.set('r', affiliateCode)
    }
    const result = await shareOrCopy({
      url: url.toString(),
      title: topCard?.title ?? `${site.name} · Flash Trade`,
    })
    if (result === 'copied') {
      toast.success('Link copied')
    }
  }, [visibleCards, affiliateCode, site.name])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
        {/* Left: branded title — [Logo] {SiteName} | Flash Trade */}
        <div className="flex min-w-0 items-center gap-2 text-foreground">
          <SiteLogoIcon
            logoSvg={site.logoSvg}
            logoImageUrl={site.logoImageUrl}
            alt={`${site.name} logo`}
            className="size-6 shrink-0 text-current [&_svg]:size-6 [&_svg_*]:fill-current [&_svg_*]:stroke-current"
            imageClassName="size-6 object-contain"
            size={24}
          />
          <span className="truncate text-base font-bold">{site.name}</span>
          <span aria-hidden="true" className="text-muted-foreground/60">|</span>
          <span className="flex items-center gap-1 truncate text-sm font-semibold text-muted-foreground">
            <ZapIcon className="size-3.5 text-primary" />
            Flash Trade
          </span>
        </div>

        {/* Right: share + close */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share"
            className="
              flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors
              hover:bg-muted hover:text-foreground
            "
          >
            <ShareIcon className="size-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Flash Trade"
            className="
              flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors
              hover:bg-muted hover:text-foreground
            "
          >
            <XIcon className="size-5" />
          </button>
        </div>
      </div>

      {/* Deck */}
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-4">
        <div className="relative min-h-0 flex-1">
          {isLoading && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2Icon className="size-7 animate-spin" />
              <span className="text-sm">Loading markets…</span>
            </div>
          )}

          {isError && !isLoading && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">Couldn’t load markets.</p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          )}

          {!isLoading && !isError && cards.length === 0 && (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              No binary markets available right now.
            </div>
          )}

          {isDeckFinished && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                <ZapIcon className="size-8 text-primary" />
              </div>
              <div>
                <p className="text-lg font-semibold">You’re all caught up</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You’ve swiped through every trending market.
                </p>
              </div>
              <Button
                onClick={() => {
                  setIndex(0)
                  setStaged(null)
                  void refetch()
                }}
              >
                <RotateCcwIcon className="mr-1.5 size-4" />
                Start over
              </Button>
            </div>
          )}

          {/* Card stack — render back-to-front so the active card is on top.
              When a side is staged, the back cards are suppressed so the user
              isn't disoriented by the next market peeking out while they're
              still confirming the current one. */}
          {!isDeckFinished && visibleCards.map((card, stackIndex) => {
            const isTopCard = stackIndex === 0
            const isStagedCard = staged?.card.conditionId === card.conditionId
            // Hide all non-top cards while staged so the deck behind doesn't
            // peek out and confuse the user.
            if (staged && !isStagedCard) {
              return null
            }
            return (
              <SwipeCard
                key={card.conditionId}
                card={card}
                active={isTopCard && !staged && !detailsCard}
                stackIndex={stackIndex}
                stagedSide={isStagedCard ? staged.side : null}
                onCommit={side => handleCommit(card, side)}
                onSkip={handleSkip}
                onOpenDetails={() => handleOpenDetails(card)}
              />
            )
          })}
        </div>

        {/* Confirm bar — appears after a swipe stages a side. */}
        {staged && (
          <div className="mt-4 rounded-2xl border bg-card p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">You picked</span>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-bold',
                    staged.side === 'yes' ? 'bg-yes/15 text-yes' : 'bg-no/15 text-no',
                  )}
                >
                  {staged.side === 'yes' ? staged.card.yesLabel : staged.card.noLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStaged(null)
                  setIsCustomMode(false)
                  setCustomInput('')
                }}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>

            {/* Stake chips: preset amounts + Custom toggle */}
            <div className="mb-3 flex gap-2">
              {STAKE_CHIPS.map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setStake(chip)
                    setIsCustomMode(false)
                  }}
                  className={cn(
                    'flex-1 rounded-xl border py-2 text-sm font-semibold transition-colors',
                    !isCustomMode && stake === chip
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  $
                  {chip}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setIsCustomMode(true)
                  setCustomInput(String(stake))
                }}
                className={cn(
                  'flex-1 rounded-xl border py-2 text-sm font-semibold transition-colors',
                  isCustomMode
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                Custom
              </button>
            </div>

            {/* Inline input shown only in Custom mode */}
            {isCustomMode && (
              <div className="mb-3">
                <div className="
                  flex items-center rounded-xl border border-primary bg-primary/5 px-3
                  focus-within:ring-2 focus-within:ring-primary/40
                "
                >
                  <span className="text-base font-semibold text-muted-foreground">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    max={MAX_CUSTOM_STAKE}
                    value={customInput}
                    placeholder="0.00"
                    autoFocus
                    onChange={(event) => {
                      const raw = event.target.value
                      setCustomInput(raw)
                      const parsed = Number.parseFloat(raw)
                      if (Number.isFinite(parsed) && parsed > 0) {
                        setStake(Math.min(parsed, MAX_CUSTOM_STAKE))
                      }
                    }}
                    className="h-10 w-full bg-transparent pl-1 text-base font-semibold tabular-nums outline-none"
                  />
                </div>
              </div>
            )}

            {/* Potential return — small reassuring line above Confirm.
                  Heads up: at extreme prices (e.g. 1¢) this number can look
                  huge — that's mathematical, but liquidity at that price is
                  usually thin. We label it "if correct" to avoid implying
                  it's guaranteed. */}
            {stagedPotentialReturn > 0 && stake > 0 && (
              <div className="mb-2 flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Win if correct</span>
                <span className="font-bold text-foreground tabular-nums">
                  {formatMoney(stagedPotentialReturn)}
                  {stagedProfit > 0 && (
                    <span className="ml-1.5 font-semibold text-yes">
                      +
                      {formatMoney(stagedProfit)}
                    </span>
                  )}
                </span>
              </div>
            )}

            {isAuthenticated
              ? (
                  <Button
                    className="h-12 w-full text-base"
                    onClick={handleConfirm}
                    disabled={isPlacing || stake <= 0}
                  >
                    {isPlacing
                      ? <Loader2Icon className="mr-2 size-4 animate-spin" />
                      : null}
                    {hasBalance
                      ? `Confirm · ${formatMoney(stake)}`
                      : 'Add funds to trade'}
                  </Button>
                )
              : (
                  <Button className="h-12 w-full text-base" onClick={() => void openWallet()}>
                    <WalletIcon className="mr-2 size-4" />
                    Connect wallet to trade
                  </Button>
                )}
          </div>
        )}

        {/* Hint when idle */}
        {!staged && !isDeckFinished && cards.length > 0 && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Swipe right for
            {' '}
            <span className="font-semibold text-yes">Yes/Up</span>
            , left for
            {' '}
            <span className="font-semibold text-no">No/Down</span>
          </p>
        )}
      </div>

      <QuickViewWalkthrough />

      <CardDetailsSheet
        card={detailsCard}
        open={Boolean(detailsCard)}
        onClose={() => setDetailsCard(null)}
        affiliateCode={affiliateCode}
      />
    </div>
  )
}
