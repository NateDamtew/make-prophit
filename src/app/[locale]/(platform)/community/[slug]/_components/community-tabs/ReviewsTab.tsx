'use client'

import type { CommunityReviewSummary, CommunitySummary } from './types'
import { Star } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { submitReviewAction } from '../../_actions/community-actions'
import { StarPicker } from './shared'

interface ReviewsTabProps {
  community: CommunitySummary
  reviews: CommunityReviewSummary[]
  memberRole: string | null
}

export function ReviewsTab({ community, reviews, memberRole }: ReviewsTabProps) {
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [isSubmittingReview, startReviewTransition] = useTransition()

  const averageRating = useMemo(
    () => (reviews.length > 0 ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length : 0),
    [reviews],
  )

  function handleSubmit() {
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

  return (
    <div className="space-y-6">
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
            <p className="mt-1 text-xs text-muted-foreground">
              {reviews.length}
              {' '}
              reviews
            </p>
          </div>
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = reviews.filter(r => r.rating === star).length
              const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-3 shrink-0">{star}</span>
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-4 shrink-0 text-right text-muted-foreground">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {memberRole && (
        <div className="space-y-3 rounded-xl border p-5">
          <p className="text-sm font-medium">Leave a Review</p>
          <StarPicker value={rating} onChange={setRating} />
          <textarea
            value={reviewText}
            onChange={e => setReviewText(e.target.value)}
            placeholder="Share your experience with this community..."
            className="
              w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none
              placeholder:text-muted-foreground
              focus:ring-1 focus:ring-primary
            "
            rows={3}
            maxLength={1000}
          />
          <Button size="sm" onClick={handleSubmit} disabled={isSubmittingReview || rating === 0}>
            {isSubmittingReview ? 'Submitting...' : 'Submit Review'}
          </Button>
        </div>
      )}

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
                <div className="
                  flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium
                "
                >
                  {review.user_image
                    ? <img src={review.user_image} alt="" className="size-9 rounded-full object-cover" />
                    : (review.username?.[0] ?? '?').toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
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
  )
}
