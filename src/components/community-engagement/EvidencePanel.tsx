'use client'

import type { EvidenceFeedItem } from '@/lib/db/queries/community-integrity'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLinkIcon, FileCheck2Icon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { formatAbsolute, formatRelativeTime } from '@/components/admin-ui/format'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface EvidencePanelProps {
  marketId: string
  /** True = viewer can add or delete evidence (community admin / juror / platform admin). */
  canManage: boolean
}

async function fetchEvidence(marketId: string): Promise<EvidenceFeedItem[]> {
  const res = await fetch(`/api/communities/markets/${marketId}/evidence`)
  if (!res.ok) {
    throw new Error('Failed to load evidence.')
  }
  return (await res.json()).data ?? []
}

/**
 * Editorial integrity panel — surfaces every URL the community has attached to
 * back up (or contest) a market's eventual resolution. Visible to everyone;
 * editable only by community admins / jurors / platform admins.
 */
export function EvidencePanel({ marketId, canManage }: EvidencePanelProps) {
  const queryClient = useQueryClient()
  const queryKey = ['community-evidence', marketId]
  const query = useQuery({ queryKey, queryFn: () => fetchEvidence(marketId), staleTime: 15_000 })

  const [showForm, setShowForm] = useState(false)
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/communities/markets/${marketId}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), note: note.trim() || null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error || 'Failed to attach evidence.')
      }
      return body
    },
    onSuccess: () => {
      setUrl('')
      setNote('')
      setShowForm(false)
      void queryClient.invalidateQueries({ queryKey })
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/communities/markets/${marketId}/evidence?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error('Failed to delete evidence.')
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  })

  const items = query.data ?? []

  return (
    <Card className="gap-0 p-0">
      <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <FileCheck2Icon className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Editorial evidence</h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {items.length}
          {' '}
          {items.length === 1 ? 'source' : 'sources'}
        </span>
      </header>

      <div className="p-5">
        {items.length === 0 && !query.isLoading
          ? (
              <p className="text-sm text-muted-foreground">
                No evidence attached yet.
                {canManage && ' Add sources that will defend the eventual resolution.'}
              </p>
            )
          : (
              <ul className="space-y-2">
                {items.map(item => (
                  <li key={item.id} className="flex items-start gap-3 rounded-sm border border-border/60 bg-background p-3">
                    <ExternalLinkIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-sm font-medium text-primary hover:underline"
                      >
                        {item.url}
                      </a>
                      {item.note && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p>
                      )}
                      <p className="mt-1 text-2xs text-muted-foreground/80">
                        <span>{item.submittedLabel}</span>
                        {' · '}
                        <time dateTime={item.createdAt} title={formatAbsolute(item.createdAt)}>
                          {formatRelativeTime(item.createdAt)}
                        </time>
                      </p>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => {
                          toast.promise(remove.mutateAsync(item.id), {
                            loading: 'Removing…',
                            success: 'Evidence removed',
                            error: err => (err as Error).message,
                          })
                        }}
                        className="text-muted-foreground hover:text-(--no)"
                        aria-label="Remove evidence"
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

        {canManage && (
          <div className="mt-4 border-t border-border/60 pt-4">
            {showForm
              ? (
                  <div className="grid gap-2">
                    <Input
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      placeholder="https://… (source URL)"
                    />
                    <Input
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="What does this source confirm? (optional)"
                      maxLength={500}
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setUrl(''); setNote('') }}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          toast.promise(add.mutateAsync(), {
                            loading: 'Attaching…',
                            success: 'Evidence added',
                            error: err => (err as Error).message,
                          })
                        }}
                        disabled={!url.trim() || add.isPending}
                      >
                        Attach
                      </Button>
                    </div>
                  </div>
                )
              : (
                  <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
                    <PlusIcon className="size-3.5" />
                    Attach evidence
                  </Button>
                )}
          </div>
        )}
      </div>
    </Card>
  )
}
