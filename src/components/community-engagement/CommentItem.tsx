'use client'

import type { useMarketComments } from './useComments'
import type { CommentTree } from '@/lib/db/queries/community-comments'
import { MessageSquareIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { formatAbsolute, formatRelativeTime } from '@/components/admin-ui/format'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { CommentComposer } from './CommentComposer'
import { ReactionBar } from './ReactionBar'

interface CommentItemProps {
  comment: CommentTree
  controller: ReturnType<typeof useMarketComments>
  currentUserId: string | null
  /** True when the viewer is community admin/juror — can delete any. */
  isModerator: boolean
  /** True when this is a top-level comment (false for replies, which can't be replied to). */
  canReply: boolean
}

function Avatar({ name, image }: { name: string | null, image: string | null }) {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
      {image
        ? <img src={image} alt="" className="size-8 rounded-full object-cover" />
        : (name?.[0] ?? '?').toUpperCase()}
    </div>
  )
}

export function CommentItem({ comment, controller, currentUserId, isModerator, canReply }: CommentItemProps) {
  const [editing, setEditing] = useState(false)
  const [replying, setReplying] = useState(false)

  const isAuthor = currentUserId === comment.user_id
  const canEdit = isAuthor && !comment.deleted_at
  const canDelete = (isAuthor || isModerator) && !comment.deleted_at

  async function submitReply(body: string) {
    await controller.post.mutateAsync({ body, parent_id: comment.id })
    setReplying(false)
  }

  async function submitEdit(body: string) {
    await controller.edit.mutateAsync({ id: comment.id, body })
    setEditing(false)
  }

  function handleDelete() {
    toast.promise(controller.remove.mutateAsync(comment.id), {
      loading: 'Deleting…',
      success: 'Comment deleted',
      error: err => (err as Error).message,
    })
  }

  const username = comment.author?.username ? `@${comment.author.username}` : 'Anonymous'

  return (
    <div className="flex gap-2.5">
      <Avatar name={comment.author?.username ?? null} image={comment.author?.image ?? null} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-foreground">
            {comment.deleted_at ? 'Deleted' : username}
          </span>
          <time
            dateTime={comment.created_at}
            title={formatAbsolute(comment.created_at)}
            className="text-muted-foreground"
          >
            {formatRelativeTime(comment.created_at)}
          </time>
          {comment.edited_at && !comment.deleted_at && (
            <span className="text-muted-foreground/70" title={`Edited ${formatAbsolute(comment.edited_at)}`}>
              (edited)
            </span>
          )}
        </div>

        {editing
          ? (
              <div className="mt-1.5">
                <CommentComposer
                  placeholder="Edit comment…"
                  submitLabel="Save"
                  autoFocus
                  compact
                  onSubmit={submitEdit}
                  onCancel={() => setEditing(false)}
                />
              </div>
            )
          : (
              <p className={cn(
                'mt-0.5 text-sm whitespace-pre-wrap',
                comment.deleted_at ? 'text-muted-foreground italic' : 'text-foreground',
              )}
              >
                {comment.body}
              </p>
            )}

        {!editing && !comment.deleted_at && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <ReactionBar
              targetType="comment"
              targetId={comment.id}
              initial={comment.reactions as Record<string, { count: number, mine: boolean }>}
              onChange={controller.refetch}
              size="sm"
            />
            {canReply && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => setReplying(v => !v)}
              >
                <MessageSquareIcon className="size-3" />
                Reply
              </Button>
            )}

            {(canEdit || canDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground">
                    <MoreHorizontalIcon className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {canEdit && (
                    <DropdownMenuItem onClick={() => setEditing(true)}>
                      <PencilIcon className="size-3.5" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <DropdownMenuItem variant="destructive" onClick={handleDelete}>
                      <Trash2Icon className="size-3.5" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        {replying && (
          <div className="mt-2">
            <CommentComposer
              placeholder={`Reply to ${username}…`}
              submitLabel="Reply"
              autoFocus
              compact
              onSubmit={submitReply}
              onCancel={() => setReplying(false)}
            />
          </div>
        )}

        {/* Replies (depth 2) */}
        {comment.replies.length > 0 && (
          <div className="mt-3 space-y-3 border-l-2 border-border/50 pl-3">
            {comment.replies.map(reply => (
              <CommentItem
                key={reply.id}
                comment={reply}
                controller={controller}
                currentUserId={currentUserId}
                isModerator={isModerator}
                canReply={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
