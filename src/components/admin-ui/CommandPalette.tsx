'use client'

import type { AdminNavItem } from './nav'
import { CornerDownLeftIcon, SearchIcon } from 'lucide-react'
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { ADMIN_NAV } from './nav'

interface AdminCommandContextValue {
  open: () => void
  toggle: () => void
}

const AdminCommandContext = createContext<AdminCommandContextValue | null>(null)

export function useAdminCommand(): AdminCommandContextValue {
  const ctx = use(AdminCommandContext)
  if (!ctx) {
    throw new Error('useAdminCommand must be used within AdminCommandProvider')
  }
  return ctx
}

interface FlatItem extends AdminNavItem {
  groupLabel?: string
}

function flatten(): FlatItem[] {
  return ADMIN_NAV.flatMap(group =>
    group.items.map(item => ({ ...item, groupLabel: group.label })),
  )
}

function matches(item: FlatItem, query: string): boolean {
  if (!query) {
    return true
  }
  const haystack = [item.label, item.groupLabel ?? '', ...(item.keywords ?? [])].join(' ').toLowerCase()
  return query.toLowerCase().split(/\s+/).every(token => haystack.includes(token))
}

export function AdminCommandProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const allItems = useMemo(() => flatten(), [])
  const results = useMemo(() => allItems.filter(item => matches(item, query)), [allItems, query])

  const open = useCallback(() => {
    setQuery('')
    setActiveIndex(0)
    setIsOpen(true)
  }, [])

  const toggle = useCallback(() => setIsOpen(prev => !prev), [])

  // Global ⌘K / Ctrl+K listener.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsOpen((prev) => {
          if (!prev) {
            setQuery('')
            setActiveIndex(0)
          }
          return !prev
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const select = useCallback((item: FlatItem) => {
    if (item.comingSoon) {
      return
    }
    setIsOpen(false)
    router.push(item.href as Parameters<typeof router.push>[0])
  }, [router])

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(prev => Math.min(prev + 1, results.length - 1))
    }
    else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(prev => Math.max(prev - 1, 0))
    }
    else if (event.key === 'Enter') {
      event.preventDefault()
      const item = results[activeIndex]
      if (item) {
        select(item)
      }
    }
  }

  const contextValue = useMemo(() => ({ open, toggle }), [open, toggle])

  return (
    <AdminCommandContext value={contextValue}>
      {children}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          showCloseButton={false}
          className="overflow-hidden p-0 sm:max-w-lg"
        >
          <DialogTitle className="sr-only">Command menu</DialogTitle>

          <div className="flex items-center gap-2 border-b border-border/60 px-3">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Jump to a section…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {results.length === 0
              ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">No results.</p>
                )
              : (
                  results.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={item.comingSoon}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => select(item)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm',
                        index === activeIndex && 'bg-accent text-accent-foreground',
                        item.comingSoon && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <item.icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1">{item.label}</span>
                      {item.groupLabel && (
                        <span className="text-xs text-muted-foreground">{item.groupLabel}</span>
                      )}
                      {item.comingSoon && (
                        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">Soon</span>
                      )}
                      {index === activeIndex && !item.comingSoon && (
                        <CornerDownLeftIcon className="size-3.5 text-muted-foreground" />
                      )}
                    </button>
                  ))
                )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminCommandContext>
  )
}
