'use client'

import { FileEdit, Link2, WandSparkles } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import DraftsList from './DraftsList'
import MarketWizard from './MarketWizard'
import PlatformMarketPicker from './PlatformMarketPicker'

type Mode = 'quickcreate' | 'platform' | 'drafts'

interface Props {
  communityId: string
  communitySlug: string
  communityName: string
  communityIcon: string | null
  drafts: any[]
}

function isValidMode(value: string | null): value is Mode {
  return value === 'quickcreate' || value === 'platform' || value === 'drafts'
}

const TABS: Array<{ id: Mode, label: string, icon: typeof WandSparkles }> = [
  { id: 'quickcreate', label: 'Quick Create', icon: WandSparkles },
  { id: 'platform', label: 'Pull from Platform', icon: Link2 },
  { id: 'drafts', label: 'Draft', icon: FileEdit },
]

/**
 * Single unified creation flow. Quick Create is the 5-step wizard (AI drafter
 * + templates baked into step 1); Pull from Platform reuses an existing market;
 * Draft lists saved-but-unsubmitted markets. Legacy `?tab=canvas|advanced`
 * values fall back to Quick Create.
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
    : 'quickcreate'
  const [mode, setMode] = useState<Mode>(initialMode)

  useEffect(() => {
    const param = searchParams.get('tab')
    if (isValidMode(param) && param !== mode) {
      setMode(param)
    }
    else if (!isValidMode(param) && mode !== 'quickcreate') {
      setMode('quickcreate')
    }
  }, [searchParams, mode])

  function switchMode(next: Mode) {
    setMode(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'quickcreate') {
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
      {/* Mode pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = mode === tab.id
          const showBadge = tab.id === 'drafts' && drafts.length > 0
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchMode(tab.id)}
              className={cn(
                `
                  flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold tracking-wide uppercase
                  transition-colors
                `,
                isActive
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {tab.label}
              {showBadge && (
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-2xs font-bold text-primary">
                  {drafts.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {mode === 'quickcreate' && (
        <MarketWizard
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
    </>
  )
}
