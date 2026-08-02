'use client'

import type { useWaitlistTable, WaitlistEntry } from '@/app/[locale]/admin/waitlist/_hooks/useWaitlist'

import { CopyIcon, MailIcon, MoreHorizontalIcon, ShieldXIcon, Trash2Icon, UserCheckIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type WaitlistActions = Pick<ReturnType<typeof useWaitlistTable>, 'updateStatus' | 'sendInvite' | 'deleteEntry'>

export function WaitlistRowActions({ entry, actions }: { entry: WaitlistEntry, actions: WaitlistActions }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmInvite, setConfirmInvite] = useState(false)

  async function copyEmail() {
    await navigator.clipboard.writeText(entry.email)
    toast.success('Email copied')
  }

  function handleInvite() {
    setConfirmInvite(false)
    toast.promise(actions.sendInvite.mutateAsync(entry.id), {
      loading: `Sending invite to ${entry.email}…`,
      success: 'Invite sent',
      error: err => (err as Error).message,
    })
  }

  function handleDelete() {
    setConfirmDelete(false)
    toast.promise(actions.deleteEntry.mutateAsync(entry.id), {
      loading: 'Deleting…',
      success: 'Entry deleted',
      error: err => (err as Error).message,
    })
  }

  function setStatus(status: WaitlistEntry['status']) {
    toast.promise(actions.updateStatus.mutateAsync({ id: entry.id, status }), {
      loading: 'Updating…',
      success: `Marked as ${status}`,
      error: err => (err as Error).message,
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label="Row actions" />}>
            <MoreHorizontalIcon className="size-4" />
          </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setConfirmInvite(true)}>
            <MailIcon className="size-4" />
            Send invite email
          </DropdownMenuItem>
          {entry.status !== 'invited' && (
            <DropdownMenuItem onClick={() => setStatus('invited')}>
              <UserCheckIcon className="size-4" />
              Mark invited
            </DropdownMenuItem>
          )}
          {entry.status !== 'joined' && (
            <DropdownMenuItem onClick={() => setStatus('joined')}>
              <UserCheckIcon className="size-4" />
              Mark joined
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={copyEmail}>
            <CopyIcon className="size-4" />
            Copy email
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {entry.status !== 'spam' && (
            <DropdownMenuItem onClick={() => setStatus('spam')}>
              <ShieldXIcon className="size-4" />
              Mark as spam
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2Icon className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmInvite} onOpenChange={setConfirmInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send invite email?</DialogTitle>
            <DialogDescription>
              {`A Prophit early-access email will be sent to ${entry.email} and the entry will be marked as invited.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmInvite(false)}>Cancel</Button>
            <Button onClick={handleInvite}>Send invite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete waitlist entry?</DialogTitle>
            <DialogDescription>
              {`This permanently removes ${entry.email} from the waitlist. This can't be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
