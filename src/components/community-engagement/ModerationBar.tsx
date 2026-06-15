'use client'

import { ArchiveIcon, ArchiveRestoreIcon, LockIcon, LockOpenIcon, PinIcon, PinOffIcon } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface ModerationBarProps {
  marketId: string
  initial: {
    is_pinned: boolean
    is_locked: boolean
    is_archived: boolean
  }
}

/**
 * Small toolbar that surfaces community-admin-only moderation actions next
 * to the market detail. Each action calls the moderation PATCH route which
 * records both the DB change and a community_events row for the activity feed.
 */
export function ModerationBar({ marketId, initial }: ModerationBarProps) {
  const [state, setState] = useState(initial)
  const [pending, startTransition] = useTransition()

  function patch(patch: Partial<typeof initial>, optimistic: Partial<typeof initial>, labels: { success: string }) {
    startTransition(async () => {
      const previous = state
      setState(prev => ({ ...prev, ...optimistic }))
      try {
        const res = await fetch(`/api/communities/markets/${marketId}/moderation`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        if (!res.ok) {
          throw new Error((await res.json().catch(() => ({})))?.error || 'Update failed')
        }
        toast.success(labels.success)
      }
      catch (error) {
        setState(previous)
        toast.error((error as Error).message)
      }
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant={state.is_pinned ? 'default' : 'outline'}
        disabled={pending}
        onClick={() => patch(
          { is_pinned: !state.is_pinned },
          { is_pinned: !state.is_pinned },
          { success: state.is_pinned ? 'Market unpinned' : 'Market pinned to top' },
        )}
      >
        {state.is_pinned ? <PinOffIcon className="size-3.5" /> : <PinIcon className="size-3.5" />}
        {state.is_pinned ? 'Unpin' : 'Pin'}
      </Button>

      <Button
        size="sm"
        variant={state.is_locked ? 'default' : 'outline'}
        disabled={pending}
        onClick={() => patch(
          { is_locked: !state.is_locked },
          { is_locked: !state.is_locked },
          { success: state.is_locked ? 'Comments unlocked' : 'Comments locked' },
        )}
      >
        {state.is_locked ? <LockOpenIcon className="size-3.5" /> : <LockIcon className="size-3.5" />}
        {state.is_locked ? 'Unlock' : 'Lock'}
      </Button>

      <Button
        size="sm"
        variant={state.is_archived ? 'default' : 'outline'}
        disabled={pending}
        onClick={() => patch(
          { is_archived: !state.is_archived },
          { is_archived: !state.is_archived },
          { success: state.is_archived ? 'Market restored' : 'Market archived' },
        )}
      >
        {state.is_archived ? <ArchiveRestoreIcon className="size-3.5" /> : <ArchiveIcon className="size-3.5" />}
        {state.is_archived ? 'Restore' : 'Archive'}
      </Button>
    </div>
  )
}
