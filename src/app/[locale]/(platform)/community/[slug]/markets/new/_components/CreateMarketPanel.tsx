'use client'

import { FileEdit, Link2, WandSparkles } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import CustomMarketCreator from './CustomMarketCreator'
import DraftsList from './DraftsList'
import { MarketCanvas } from './MarketCanvas'
import PlatformMarketPicker from './PlatformMarketPicker'

type Mode = 'canvas' | 'platform' | 'drafts' | 'advanced'

interface Props {
  communityId: string
  communitySlug: string
  communityName: string
  communityIcon: string | null
  drafts: any[]
}

function isValidMode(value: string | null): value is Mode {
  return value === 'canvas' || value === 'platform' || value === 'drafts' || value === 'advanced'
}

const VISIBLE_TABS: Array<{ id: Exclude<Mode, 'advanced'>, label: string, sub: string, icon: typeof WandSparkles }> = [
  { id: 'canvas', label: 'Quick Create', sub: 'AI canvas + templates', icon: WandSparkles },
  { id: 'platform', label: 'Pull from Platform', sub: 'Use an existing market', icon: Link2 },
  { id: 'drafts', label: 'Drafts', sub: 'Saved markets', icon: FileEdit },
]

/**
 * Phase 2: default mode is the one-screen `canvas`. The legacy 5-step wizard
 * is preserved at `?tab=advanced` so power users (and anyone with a bookmarked
 * URL) can still reach it. The Drafts tab badges count.
 */
export default function CreateMarketPanel({
  communityId,
  communitySlug,
  communityName,
  communityIcon,
  drafts,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialMode: Mode = isValidMode(searchParams.get('tab'))
    ? (searchParams.get('tab') as Mode)
    : 'canvas'
  const [mode, setMode] = useState<Mode>(initialMode)

  // Keep mode in sync with URL when the param changes (back/forward).
  useEffect(() => {
    const param = searchParams.get('tab')
    if (isValidMode(param) && param !== mode) {
      setMode(param)
    }
    else if (!param && mode !== 'canvas') {
      setMode('canvas')
    }
  }, [searchParams, mode])

  function switchMode(next: Mode) {
    setMode(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'canvas') {
      params.delete('tab')
    }
    else {
      params.set('tab', next)
    }
    const queryString = params.toString()
    router.replace(`?${queryString}` as any, { scroll: false })
  }

  return (
    <>
      {mode !== 'advanced' && (
        <div className="mb-6 grid grid-cols-3 gap-2">
          {VISIBLE_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = mode === tab.id
            const showBadge = tab.id === 'drafts' && drafts.length > 0
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchMode(tab.id)}
                className={cn(
                  'group flex flex-col items-center gap-2 rounded-sm border p-4 text-center transition-all',
                  isActive ? 'border-primary bg-primary/5' : 'border-border hover:border-border/80 hover:bg-muted/30',
                )}
              >
                <div className={cn(
                  'flex size-9 items-center justify-center rounded-sm transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
                >
                  <Icon className="size-4" />
                </div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold">{tab.label}</p>
                  {showBadge && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs font-medium text-primary">
                      {drafts.length}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{tab.sub}</p>
              </button>
            )
          })}
        </div>
      )}

      {mode === 'canvas' && (
        <MarketCanvas
          communityId={communityId}
          communitySlug={communitySlug}
          communityName={communityName}
          communityIcon={communityIcon}
        />
      )}
      {mode === 'platform' && (
        <PlatformMarketPicker communityId={communityId} communitySlug={communitySlug} />
      )}
      {mode === 'drafts' && (
        <DraftsList communityId={communityId} communitySlug={communitySlug} drafts={drafts} />
      )}
      {mode === 'advanced' && (
        <div className="grid gap-4">
          <div className="
            flex items-center justify-between gap-3 rounded-sm border border-dashed border-border/70 bg-muted/30 px-4
            py-3 text-xs
          "
          >
            <span className="text-muted-foreground">
              You're in
              {' '}
              <strong>Advanced</strong>
              {' '}
              mode — the original 5-step wizard. The faster AI canvas is one click away.
            </span>
            <button
              type="button"
              onClick={() => switchMode('canvas')}
              className="font-medium text-primary hover:underline"
            >
              Back to Quick Create →
            </button>
          </div>
          <CustomMarketCreator communityId={communityId} communitySlug={communitySlug} />
        </div>
      )}
    </>
  )
}
