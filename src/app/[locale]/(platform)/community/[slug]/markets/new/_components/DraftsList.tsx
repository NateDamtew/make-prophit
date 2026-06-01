'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  FileEdit,
  Send,
  Trash2,
  Calendar,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Rocket,
} from 'lucide-react'
import { deleteMarketAction } from '../../../_actions/market-actions'
import SubmitForReviewDialog from './SubmitForReviewDialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Draft {
  id: string
  title: string
  description: string | null
  resolution_source: string | null
  resolution_rules: string | null
  resolution_date: Date | null
  created_at: Date
  review_status: string | null
  review_feedback: string | null
  reviewed_at: Date | null
  last_deploy_error: string | null
  event_id: string | null
}

interface Props {
  communityId: string
  communitySlug: string
  drafts: Draft[]
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
        <FileEdit className="size-3" />
        Draft
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-600">
        <Clock className="size-3" />
        Review by Admin
      </span>
    )
  }
  if (status === 'approved') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-blue-600">
        <CheckCircle className="size-3" />
        Approved
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase text-destructive">
        <XCircle className="size-3" />
        Rejected
      </span>
    )
  }
  if (status === 'deploying' || status === 'deploy_retry') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-blue-600">
        <Rocket className="size-3" />
        {status === 'deploy_retry' ? 'Retrying' : 'Deploying'}
      </span>
    )
  }
  if (status === 'deploy_failed') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase text-destructive">
        <AlertCircle className="size-3" />
        Deploy Failed
      </span>
    )
  }
  if (status === 'deploy_blocked') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-600">
        <AlertCircle className="size-3" />
        Blocked
      </span>
    )
  }
  return null
}

export default function DraftsList({ communityId, communitySlug, drafts }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [submitDialog, setSubmitDialog] = useState<{ id: string, title: string } | null>(null)

  function handleDelete(draftId: string) {
    if (!confirm('Delete this draft? This cannot be undone.')) {
      return
    }
    startTransition(async () => {
      const result = await deleteMarketAction(draftId, communityId, communitySlug)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Draft deleted')
      router.refresh()
    })
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-12 text-center">
        <FileEdit className="mx-auto mb-3 size-10 text-muted-foreground/30" />
        <p className="font-medium">No drafts yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Drafts you save will appear here. Submit them for review when ready.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {drafts.map((draft) => {
          const status = draft.review_status
          const isEditable = !status || status === 'rejected'
          const canSubmit = isEditable
          const canDelete = isEditable

          return (
            <div key={draft.id} className="rounded-2xl border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={status} />
                    <span className="text-xs text-muted-foreground">
                      Saved {new Date(draft.created_at).toLocaleDateString()}
                    </span>
                    {draft.reviewed_at && (
                      <span className="text-xs text-muted-foreground">
                        · Reviewed {new Date(draft.reviewed_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-semibold">{draft.title}</p>
                  {draft.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {draft.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Rejection feedback */}
              {status === 'rejected' && draft.review_feedback && (
                <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <XCircle className="size-3.5" />
                    Admin feedback
                  </div>
                  <p className="mt-1 text-sm text-destructive/90">{draft.review_feedback}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    You can revise this draft and resubmit for review.
                  </p>
                </div>
              )}

              {/* Deploy failure */}
              {(status === 'deploy_failed' || status === 'deploy_blocked') && draft.last_deploy_error && (
                <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <AlertCircle className="size-3.5" />
                    Deployment issue
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {status === 'deploy_blocked'
                      ? 'A platform admin is investigating. We\'ll notify you when it\'s resolved.'
                      : 'Auto-retry attempted. Platform admin has been notified.'}
                  </p>
                </div>
              )}

              {/* In-review banner */}
              {status === 'pending' && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <Clock className="size-3.5 shrink-0" />
                  Waiting for platform admin to review. You can&apos;t edit until they respond.
                </div>
              )}

              {/* Approved / deploying banner */}
              {(status === 'approved' || status === 'deploying' || status === 'deploy_retry') && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-700 dark:text-blue-400">
                  <Rocket className="size-3.5 shrink-0" />
                  {status === 'approved'
                    ? 'Approved by admin. Deployment will start shortly.'
                    : 'Deploying on-chain. Members will be able to trade in 5–15 minutes.'}
                </div>
              )}

              <div className="mt-3 space-y-2 text-sm">
                {draft.resolution_source && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Source</p>
                    <p className="text-muted-foreground">{draft.resolution_source}</p>
                  </div>
                )}
                {draft.resolution_date && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="size-3" />
                    Resolves {new Date(draft.resolution_date).toLocaleDateString()}
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3">
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(draft.id)}
                    disabled={isPending}
                    className={cn(
                      'text-destructive',
                      'hover:bg-destructive/10 hover:text-destructive',
                    )}
                  >
                    <Trash2 className="mr-1.5 size-3.5" />
                    Delete
                  </Button>
                )}
                {canSubmit && (
                  <Button
                    size="sm"
                    onClick={() => setSubmitDialog({ id: draft.id, title: draft.title })}
                    disabled={isPending}
                  >
                    <Send className="mr-1.5 size-3.5" />
                    {status === 'rejected' ? 'Revise & Resubmit' : 'Submit for Review'}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {submitDialog && (
        <SubmitForReviewDialog
          open={true}
          onOpenChange={(open) => { if (!open) setSubmitDialog(null) }}
          marketId={submitDialog.id}
          marketTitle={submitDialog.title}
          communityId={communityId}
          communitySlug={communitySlug}
        />
      )}
    </>
  )
}
