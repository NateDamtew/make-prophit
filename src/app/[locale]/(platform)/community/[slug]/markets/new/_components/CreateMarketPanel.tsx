'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Sparkles, Link2, FileEdit } from 'lucide-react'
import CustomMarketCreator from './CustomMarketCreator'
import PlatformMarketPicker from './PlatformMarketPicker'
import DraftsList from './DraftsList'
import { cn } from '@/lib/utils'

type Mode = 'custom' | 'platform' | 'drafts'

interface Props {
  communityId: string
  communitySlug: string
  drafts: any[]
}

function isValidMode(value: string | null): value is Mode {
  return value === 'custom' || value === 'platform' || value === 'drafts'
}

export default function CreateMarketPanel({ communityId, communitySlug, drafts }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialMode: Mode = isValidMode(searchParams.get('tab'))
    ? (searchParams.get('tab') as Mode)
    : 'custom'
  const [mode, setMode] = useState<Mode>(initialMode)

  // Keep mode in sync with URL when the query param changes
  useEffect(() => {
    const param = searchParams.get('tab')
    if (isValidMode(param) && param !== mode) {
      setMode(param)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function switchMode(next: Mode) {
    setMode(next)
    // Persist to URL so refresh/back works
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'custom') {
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
      {/* Mode tabs */}
      <div className="mb-6 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => switchMode('custom')}
          className={cn(
            'group flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all',
            mode === 'custom'
              ? 'border-primary bg-primary/5'
              : 'hover:border-border/80 hover:bg-muted/30',
          )}
        >
          <div className={cn(
            'flex size-9 items-center justify-center rounded-lg transition-colors',
            mode === 'custom' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}
          >
            <Sparkles className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Create Custom</p>
            <p className="mt-0.5 text-xs text-muted-foreground">AI-assisted with Gemini</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => switchMode('platform')}
          className={cn(
            'group flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all',
            mode === 'platform'
              ? 'border-primary bg-primary/5'
              : 'hover:border-border/80 hover:bg-muted/30',
          )}
        >
          <div className={cn(
            'flex size-9 items-center justify-center rounded-lg transition-colors',
            mode === 'platform' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}
          >
            <Link2 className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Pull from Platform</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Use existing markets</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => switchMode('drafts')}
          className={cn(
            'group flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all',
            mode === 'drafts'
              ? 'border-primary bg-primary/5'
              : 'hover:border-border/80 hover:bg-muted/30',
          )}
        >
          <div className={cn(
            'flex size-9 items-center justify-center rounded-lg transition-colors',
            mode === 'drafts' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}
          >
            <FileEdit className="size-4" />
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold">Drafts</p>
            {drafts.length > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {drafts.length}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Saved markets</p>
        </button>
      </div>

      {/* Mode content */}
      {mode === 'custom' && (
        <CustomMarketCreator
          communityId={communityId}
          communitySlug={communitySlug}
        />
      )}
      {mode === 'platform' && (
        <PlatformMarketPicker
          communityId={communityId}
          communitySlug={communitySlug}
        />
      )}
      {mode === 'drafts' && (
        <DraftsList
          communityId={communityId}
          communitySlug={communitySlug}
          drafts={drafts}
        />
      )}
    </>
  )
}
