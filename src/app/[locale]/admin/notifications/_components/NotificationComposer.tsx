'use client'

import { SendIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from '@/components/ui/toast'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function NotificationComposer() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)

  const canSend = title.trim().length > 0 && description.trim().length > 0

  async function send() {
    setConfirmOpen(false)
    setSending(true)
    try {
      const res = await fetch('/admin/api/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, linkUrl: linkUrl || undefined, linkLabel: linkLabel || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to send broadcast')
      }
      toast.success('Broadcast sent to all users')
      setTitle('')
      setDescription('')
      setLinkUrl('')
      setLinkLabel('')
    }
    catch (error) {
      toast.error((error as Error).message)
    }
    finally {
      setSending(false)
    }
  }

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Notifications"
        description="Broadcast an in-app notification to every user. Use sparingly — everyone gets it."
      />

      <Card className="max-w-2xl gap-5 p-6">
        <div className="grid gap-2">
          <Label htmlFor="notif-title">Title</Label>
          <Input
            id="notif-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. New markets are live"
            maxLength={120}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="notif-desc">Message</Label>
          <Textarea
            id="notif-desc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What do you want every user to know?"
            rows={4}
            maxLength={1000}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="notif-link">Link URL (optional)</Label>
            <Input
              id="notif-link"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notif-link-label">Link label (optional)</Label>
            <Input
              id="notif-link-label"
              value={linkLabel}
              onChange={e => setLinkLabel(e.target.value)}
              placeholder="Learn more"
              maxLength={60}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button disabled={!canSend || sending} onClick={() => setConfirmOpen(true)}>
            <SendIcon className="size-4" />
            {sending ? 'Sending…' : 'Broadcast to all users'}
          </Button>
        </div>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send to all users?</DialogTitle>
            <DialogDescription>
              {`"${title}" will be delivered as an in-app notification to every user on the platform. This can't be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={send}>Send broadcast</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
