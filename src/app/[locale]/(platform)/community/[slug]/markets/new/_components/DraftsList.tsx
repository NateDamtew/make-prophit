'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { FileEdit, Send, Trash2, Calendar, Loader2 } from 'lucide-react'
import { publishMarketAction, deleteMarketAction } from '../../../_actions/market-actions'
import { Button } from '@/components/ui/button'

interface Draft {
  id: string
  title: string
  description: string | null
  resolution_source: string | null
  resolution_rules: string | null
  resolution_date: Date | null
  created_at: Date
}

interface Props {
  communityId: string
  communitySlug: string
  drafts: Draft[]
}

export default function DraftsList({ communityId, communitySlug, drafts }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handlePublish(draftId: string) {
    startTransition(async () => {
      const result = await publishMarketAction(draftId, communityId, communitySlug)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Market published!')
      router.refresh()
    })
  }

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
          Drafts you save will appear here. Publish them when you&apos;re ready.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {drafts.map(draft => (
        <div key={draft.id} className="rounded-2xl border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-600">
                  Draft
                </span>
                <span className="text-xs text-muted-foreground">
                  Saved
                  {' '}
                  {new Date(draft.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-2 font-semibold">{draft.title}</p>
              {draft.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {draft.description}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 space-y-2 text-sm">
            {draft.resolution_source && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Source</p>
                <p className="text-muted-foreground">{draft.resolution_source}</p>
              </div>
            )}
            {draft.resolution_rules && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Resolution Rules</p>
                <p className="line-clamp-3 text-muted-foreground whitespace-pre-wrap">
                  {draft.resolution_rules}
                </p>
              </div>
            )}
            {draft.resolution_date && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="size-3" />
                Resolves
                {' '}
                {new Date(draft.resolution_date).toLocaleDateString()}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(draft.id)}
              disabled={isPending}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Delete
            </Button>
            <Button
              size="sm"
              onClick={() => handlePublish(draft.id)}
              disabled={isPending}
            >
              {isPending
                ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                : <Send className="mr-1.5 size-3.5" />}
              Publish
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
