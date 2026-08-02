'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { Search, Link2, Loader2, CheckCircle, TrendingUp } from 'lucide-react'
import { pullPlatformEventAction } from '../../../_actions/market-actions'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface PlatformEvent {
  id: string
  slug: string
  title: string
  icon_url?: string | null
  end_date?: string | null
  active_markets_count?: number | null
  total_markets_count?: number | null
}

interface Props {
  communityId: string
  communitySlug: string
}

export default function PlatformMarketPicker({ communityId, communitySlug }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [events, setEvents] = useState<PlatformEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPulling, startPulling] = useTransition()

  // Debounced fetch
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({
          tag: 'trending',
          mainTag: '',
          status: 'active',
          homeFeed: 'true',
          limit: '20',
        })
        if (search.trim()) {
          params.set('search', search.trim())
        }
        const res = await fetch(`/api/events?${params.toString()}`, { signal: controller.signal })
        if (res.ok) {
          const data = await res.json()
          setEvents(Array.isArray(data) ? data : [])
        }
      }
      catch {
        // ignore aborted/network errors
      }
      finally {
        setIsLoading(false)
      }
    }, 300)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [search])

  const selectedEvent = useMemo(
    () => events.find(e => e.id === selectedId),
    [events, selectedId],
  )

  async function handlePull() {
    if (!selectedEvent) {
      return
    }
    startPulling(async () => {
      const result = await pullPlatformEventAction(communityId, communitySlug, {
        event_id: selectedEvent.id,
        title: selectedEvent.title,
        resolution_date: selectedEvent.end_date ?? undefined,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Market added to community!', {
        description: 'Members can start trading immediately.',
      })
      router.refresh()
      router.push(`/community/${communitySlug}` as any)
    })
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-6">
      <div>
        <h2 className="font-semibold">Pull from Platform</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Add an existing Prophit market to your community. Your jury will resolve it independently.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search markets..."
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {isLoading
          ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
                    <div className="size-10 shrink-0 animate-pulse rounded-lg bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            )
          : events.length === 0
            ? (
                <div className="py-12 text-center">
                  <TrendingUp className="mx-auto mb-3 size-10 text-muted-foreground/30" />
                  <p className="font-medium">No markets found</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {search ? 'Try a different search term.' : 'No active platform markets right now.'}
                  </p>
                </div>
              )
            : (
                <div className="max-h-96 overflow-y-auto space-y-2 -mx-2 px-2">
                  {events.map(event => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setSelectedId(event.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
                        selectedId === event.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'hover:border-border/80 hover:bg-muted/30',
                      )}
                    >
                      {event.icon_url
                        ? (
                            <img
                              src={event.icon_url}
                              alt=""
                              className="size-10 shrink-0 rounded-lg object-cover"
                            />
                          )
                        : (
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                              <TrendingUp className="size-4 text-muted-foreground" />
                            </div>
                          )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">{event.title}</p>
                        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                          {event.active_markets_count != null && (
                            <span>
                              {event.active_markets_count}
                              {' '}
                              active
                            </span>
                          )}
                          {event.end_date && (
                            <span>
                              Ends
                              {' '}
                              {new Date(event.end_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {selectedId === event.id && (
                        <CheckCircle className="size-5 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}
      </div>

      {selectedEvent && (
        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => setSelectedId(null)} disabled={isPulling}>
            Cancel
          </Button>
          <Button onClick={handlePull} disabled={isPulling}>
            {isPulling
              ? <Loader2 className="mr-2 size-4 animate-spin" />
              : <Link2 className="mr-2 size-4" />}
            Add to Community
          </Button>
        </div>
      )}
    </div>
  )
}
