'use client'

import { MessageCircleIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CommentComposer } from './CommentComposer'
import { CommentItem } from './CommentItem'
import { useMarketComments } from './useComments'

interface CommentsSectionProps {
  marketId: string
  currentUserId: string | null
  /** Pass the viewer's role inside this community (null when not a member). */
  memberRole: string | null
  /** Optional CTA when the viewer isn't a member yet. */
  joinHref?: string
}

const MEMBER_LIKE_ROLES = new Set(['member', 'juror', 'admin'])

export function CommentsSection({ marketId, currentUserId, memberRole, joinHref }: CommentsSectionProps) {
  const controller = useMarketComments(marketId)
  const canComment = currentUserId && memberRole && MEMBER_LIKE_ROLES.has(memberRole)
  const isModerator = memberRole === 'admin' || memberRole === 'juror'

  return (
    <Card className="gap-0 p-0">
      <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <MessageCircleIcon className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Discussion</h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {controller.totalCount}
          {' '}
          {controller.totalCount === 1 ? 'comment' : 'comments'}
        </span>
      </header>

      <div className="space-y-5 p-5">
        {canComment
          ? (
              <CommentComposer
                onSubmit={async (body) => {
                  await controller.post.mutateAsync({ body })
                }}
              />
            )
          : (
              <div className="
                rounded-md border border-dashed border-border/70 px-4 py-3 text-center text-sm text-muted-foreground
              "
              >
                {!currentUserId
                  ? 'Sign in to join the conversation.'
                  : joinHref
                    ? (
                        <>
                          {'Join this community to comment. '}
                          <a href={joinHref} className="font-medium text-primary hover:underline">
                            Join →
                          </a>
                        </>
                      )
                    : 'Join this community to comment.'}
              </div>
            )}

        {controller.error && (
          <div className="rounded-md border border-(--no)/30 bg-(--no)/10 px-3 py-2 text-sm text-(--no)">
            {controller.error}
          </div>
        )}

        {controller.isLoading
          ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-2.5">
                    <Skeleton className="size-8 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            )
          : controller.items.length === 0
            ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No comments yet. Be the first to say something.
                </div>
              )
            : (
                <div className="space-y-5">
                  {controller.items.map(comment => (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      controller={controller}
                      currentUserId={currentUserId}
                      isModerator={isModerator}
                      canReply
                    />
                  ))}
                </div>
              )}
      </div>
    </Card>
  )
}
