'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  TrendingUp,
  Users,
  Scale,
  Star,
  Info,
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertCircle,
  Crown,
  Gavel,
} from 'lucide-react'
import Link from 'next/link'
import { submitReviewAction, castJuryVoteAction } from '../_actions/community-actions'
import { useTabIndicatorPosition } from '@/hooks/useTabIndicatorPosition'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type TabId = 'markets' | 'members' | 'jury' | 'reviews' | 'about'

const TABS: { id: TabId, label: string, icon: React.ElementType }[] = [
  { id: 'markets', label: 'Markets', icon: TrendingUp },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'jury', label: 'Jury', icon: Scale },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'about', label: 'About', icon: Info },
]

function StarPicker({ value, onChange }: { value: number, onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
          className="transition-transform hover:scale-110"
        >
          <Star
            className={cn(
              'size-6 transition-colors',
              star <= (hovered || value)
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground/30',
            )}
          />
        </button>
      ))}
    </div>
  )
}

function MarketStatusBadge({ status }: { status: string }) {
  if (status === 'resolved') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
        <CheckCircle className="size-3" />
        Resolved
      </span>
    )
  }
  if (status === 'disputed') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <AlertCircle className="size-3" />
        Disputed
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      <TrendingUp className="size-3" />
      Active
    </span>
  )
}

function VoteButton({
  vote,
  current,
  onClick,
}: {
  vote: 'yes' | 'no' | 'disputed'
  current: string
  onClick: () => void
}) {
  const styles = {
    yes: 'border-green-500/30 bg-green-500/10 text-green-600 hover:bg-green-500/20',
    no: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
    disputed: 'border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20',
  }
  const icons = {
    yes: CheckCircle,
    no: XCircle,
    disputed: AlertCircle,
  }
  const Icon = icons[vote]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
        styles[vote],
        current === vote && 'ring-2 ring-current ring-offset-1',
      )}
    >
      <Icon className="size-3.5" />
      {vote === 'yes' ? 'Yes' : vote === 'no' ? 'No' : 'Disputed'}
    </button>
  )
}

interface Props {
  community: {
    id: string
    slug: string
    name: string
    description: string | null
    rules: string | null
    terms: string | null
    jury_size: number
    max_members: number
    type: string
    created_at: Date
  }
  members: Array<{
    user_id: string
    role: string
    username: string | null
    image: string | null
    joined_at: Date
  }>
  markets: Array<{
    id: string
    title: string
    description: string | null
    status: string
    resolved_outcome: string | null
    resolution_date: Date | null
    event_id: string | null
    created_at: Date
  }>
  reviews: Array<{
    id: string
    rating: number
    review_text: string | null
    created_at: Date
    username: string | null
    user_image: string | null
  }>
  memberRole: string | null
  currentUserId: string | null
}

export default function CommunityTabs({
  community,
  members,
  markets,
  reviews,
  memberRole,
  currentUserId,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('markets')
  const { tabRef, indicatorStyle, isInitialized } = useTabIndicatorPosition({
    tabs: TABS,
    activeTab,
  })

  // Review state
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [isSubmittingReview, startReviewTransition] = useTransition()

  // Jury vote state
  const [voteMap, setVoteMap] = useState<Record<string, string>>({})
  const [reasoningMap, setReasoningMap] = useState<Record<string, string>>({})
  const [isVoting, startVoteTransition] = useTransition()

  const isJuror = memberRole === 'juror' || memberRole === 'admin'

  function handleSubmitReview() {
    if (rating === 0) {
      toast.error('Please select a rating.')
      return
    }
    startReviewTransition(async () => {
      const result = await submitReviewAction(community.id, community.slug, {
        rating,
        review_text: reviewText || undefined,
      })
      if (result.error) {
        toast.error(result.error)
      }
      else {
        toast.success('Review submitted!')
        setRating(0)
        setReviewText('')
      }
    })
  }

  function handleCastVote(marketId: string) {
    const vote = voteMap[marketId]
    const reasoning = reasoningMap[marketId]
    if (!vote || !reasoning) {
      toast.error('Please select a vote and provide reasoning.')
      return
    }
    startVoteTransition(async () => {
      const result = await castJuryVoteAction(
        marketId,
        community.id,
        community.slug,
        { vote: vote as 'yes' | 'no' | 'disputed', reasoning },
      )
      if (result.error) {
        toast.error(result.error)
      }
      else {
        toast.success('Vote cast successfully!')
      }
    })
  }

  const jurors = members.filter(m => m.role === 'juror' || m.role === 'admin')
  const averageRating = reviews.length > 0
    ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length
    : 0

  return (
    <div className="overflow-hidden rounded-2xl border">
      {/* Tab bar */}
      <div className="relative">
        <div className="flex items-center gap-1 overflow-x-auto px-4 pt-4 sm:gap-2">
          {TABS.map((tab, index) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                ref={el => { tabRef.current[index] = el }}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 pb-3 text-sm font-semibold transition-colors',
                  activeTab === tab.id
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border/80" />
        <div
          className={cn(
            'pointer-events-none absolute bottom-0 h-0.5 bg-primary',
            { 'transition-all duration-300 ease-out': isInitialized },
          )}
          style={{ left: `${indicatorStyle.left}px`, width: `${indicatorStyle.width}px` }}
        />
      </div>

      <div className="p-4 sm:p-6">
        {/* Markets tab */}
        {activeTab === 'markets' && (
          <div className="space-y-3">
            {markets.length === 0
              ? (
                  <div className="py-16 text-center">
                    <TrendingUp className="mx-auto mb-3 size-10 text-muted-foreground/30" />
                    <p className="font-medium">No markets yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {memberRole === 'admin' ? 'Add markets from the admin panel.' : 'Markets will appear here once created.'}
                    </p>
                  </div>
                )
              : markets.map(market => (
                  <div
                    key={market.id}
                    className="flex items-start justify-between gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{market.title}</p>
                      {market.description && (
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {market.description}
                        </p>
                      )}
                      {market.resolution_date && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Resolves: {new Date(market.resolution_date).toLocaleDateString()}
                        </p>
                      )}
                      {market.resolved_outcome && (
                        <p className="mt-1 text-xs font-medium">
                          Outcome:
                          {' '}
                          <span className={market.resolved_outcome === 'yes' ? 'text-green-600' : 'text-destructive'}>
                            {market.resolved_outcome.toUpperCase()}
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <MarketStatusBadge status={market.status} />
                      {market.event_id && (
                        <Link
                          href={`/event/${market.event_id}` as any}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Trade
                          <ExternalLink className="size-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
          </div>
        )}

        {/* Members tab */}
        {activeTab === 'members' && (
          <div className="space-y-2">
            {members.map(member => (
              <div key={member.user_id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-muted/30">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-sm">
                  {member.image
                    ? <img src={member.image} alt="" className="size-9 rounded-full object-cover" />
                    : (member.username?.[0] ?? '?').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">
                    {member.username ? `@${member.username}` : 'Anonymous'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Joined {new Date(member.joined_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                  member.role === 'admin' && 'bg-primary/10 text-primary',
                  member.role === 'juror' && 'bg-amber-500/10 text-amber-600',
                  member.role === 'member' && 'bg-muted text-muted-foreground',
                )}
                >
                  {member.role === 'admin' && <Crown className="size-3" />}
                  {member.role === 'juror' && <Gavel className="size-3" />}
                  {member.role === 'admin' ? 'Admin' : member.role === 'juror' ? 'Juror' : 'Member'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Jury tab */}
        {activeTab === 'jury' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/30 p-4 text-sm">
              <p className="font-medium">
                {jurors.length}
                {' '}
                of
                {' '}
                {community.jury_size}
                {' '}
                jury seats filled
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {community.jury_size <= 2
                  ? 'Unanimous vote required to resolve markets.'
                  : `${Math.ceil(community.jury_size * 0.75)} of ${community.jury_size} votes needed (>75%).`}
              </p>
            </div>

            <div className="space-y-2">
              {jurors.map(juror => (
                <div key={juror.user_id} className="flex items-center gap-3 rounded-xl border p-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-sm font-medium text-amber-600">
                    {juror.image
                      ? <img src={juror.image} alt="" className="size-9 rounded-full object-cover" />
                      : <Gavel className="size-4" />}
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {juror.username ? `@${juror.username}` : 'Anonymous'}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{juror.role}</p>
                  </div>
                </div>
              ))}
            </div>

            {isJuror && markets.filter(m => m.status === 'active').length > 0 && (
              <div className="space-y-4 border-t pt-4">
                <p className="font-medium text-sm">Pending Markets to Vote On</p>
                {markets.filter(m => m.status === 'active').map(market => (
                  <div key={market.id} className="rounded-xl border p-4 space-y-3">
                    <p className="font-medium">{market.title}</p>
                    <div className="flex gap-2">
                      {(['yes', 'no', 'disputed'] as const).map(v => (
                        <VoteButton
                          key={v}
                          vote={v}
                          current={voteMap[market.id] ?? ''}
                          onClick={() => setVoteMap(prev => ({ ...prev, [market.id]: v }))}
                        />
                      ))}
                    </div>
                    <textarea
                      placeholder="Provide reasoning for your vote (required)..."
                      value={reasoningMap[market.id] ?? ''}
                      onChange={e => setReasoningMap(prev => ({ ...prev, [market.id]: e.target.value }))}
                      className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                      rows={2}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleCastVote(market.id)}
                      disabled={isVoting}
                    >
                      {isVoting ? 'Submitting...' : 'Submit Vote'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reviews tab */}
        {activeTab === 'reviews' && (
          <div className="space-y-6">
            {/* Summary */}
            {reviews.length > 0 && (
              <div className="flex items-center gap-6 rounded-xl bg-muted/30 p-5">
                <div className="text-center">
                  <p className="text-4xl font-bold">{averageRating.toFixed(1)}</p>
                  <div className="mt-1 flex justify-center">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star
                        key={s}
                        className={cn(
                          'size-4',
                          s <= Math.round(averageRating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30',
                        )}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{reviews.length} reviews</p>
                </div>
                <div className="flex-1 space-y-1.5">
                  {[5, 4, 3, 2, 1].map(star => {
                    const count = reviews.filter(r => r.rating === star).length
                    const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0
                    return (
                      <div key={star} className="flex items-center gap-2 text-xs">
                        <span className="w-3 shrink-0">{star}</span>
                        <Star className="size-3 fill-amber-400 text-amber-400" />
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-4 shrink-0 text-right text-muted-foreground">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Write a review */}
            {memberRole && (
              <div className="rounded-xl border p-5 space-y-3">
                <p className="font-medium text-sm">Leave a Review</p>
                <StarPicker value={rating} onChange={setRating} />
                <textarea
                  value={reviewText}
                  onChange={e => setReviewText(e.target.value)}
                  placeholder="Share your experience with this community..."
                  className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
                  rows={3}
                  maxLength={1000}
                />
                <Button size="sm" onClick={handleSubmitReview} disabled={isSubmittingReview || rating === 0}>
                  {isSubmittingReview ? 'Submitting...' : 'Submit Review'}
                </Button>
              </div>
            )}

            {/* Review list */}
            <div className="space-y-4">
              {reviews.length === 0
                ? (
                    <div className="py-12 text-center">
                      <Star className="mx-auto mb-3 size-10 text-muted-foreground/30" />
                      <p className="font-medium">No reviews yet</p>
                      {memberRole && (
                        <p className="mt-1 text-sm text-muted-foreground">Be the first to review this community.</p>
                      )}
                    </div>
                  )
                : reviews.map(review => (
                    <div key={review.id} className="flex gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                        {review.user_image
                          ? <img src={review.user_image} alt="" className="size-9 rounded-full object-cover" />
                          : (review.username?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {review.username ? `@${review.username}` : 'Anonymous'}
                          </span>
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map(s => (
                              <Star
                                key={s}
                                className={cn(
                                  'size-3',
                                  s <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30',
                                )}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(review.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {review.review_text && (
                          <p className="mt-1 text-sm text-muted-foreground">{review.review_text}</p>
                        )}
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        )}

        {/* About tab */}
        {activeTab === 'about' && (
          <div className="space-y-6 text-sm">
            {community.description && (
              <div>
                <p className="mb-2 font-semibold">About</p>
                <p className="text-muted-foreground">{community.description}</p>
              </div>
            )}
            {community.rules && (
              <div>
                <p className="mb-2 font-semibold">Community Rules</p>
                <div className="rounded-xl bg-muted/30 p-4 text-muted-foreground whitespace-pre-wrap">
                  {community.rules}
                </div>
              </div>
            )}
            {community.terms && (
              <div>
                <p className="mb-2 font-semibold">Terms & Conditions</p>
                <div className="rounded-xl bg-muted/30 p-4 text-muted-foreground whitespace-pre-wrap">
                  {community.terms}
                </div>
              </div>
            )}
            <div>
              <p className="mb-2 font-semibold">Governance</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border p-3 text-center">
                  <p className="text-2xl font-bold">{community.jury_size}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Jury Size</p>
                </div>
                <div className="rounded-xl border p-3 text-center">
                  <p className="text-2xl font-bold">{community.max_members}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Max Members</p>
                </div>
                <div className="rounded-xl border p-3 text-center">
                  <p className="text-lg font-bold">
                    {community.jury_size <= 2 ? '100%' : '>75%'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Consensus</p>
                </div>
                <div className="rounded-xl border p-3 text-center">
                  <p className="text-lg font-bold capitalize">{community.type}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Access</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Community created {new Date(community.created_at).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
