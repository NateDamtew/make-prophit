'use client'

import type { LucideIcon } from 'lucide-react'
import { BookOpenIcon, CalendarIcon, GlobeIcon, ImageIcon } from 'lucide-react'

interface MarketPreviewProps {
  title: string
  binaryQuestion: string
  resolutionSource: string
  resolutionRules: string
  description: string
  resolutionDate: string
  imageUrl: string
  binaryOutcomeYes: string
  binaryOutcomeNo: string
  communityName: string
  communityIcon: string | null
}

function Row({ icon: Icon, label, children }: { icon: LucideIcon, label: string, children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  )
}

/**
 * Live preview of how the market will appear once published. Mirrors the
 * shape of {@link CommunityMarketCard} so creators see exactly what their
 * community will see.
 */
export function MarketPreview({
  title,
  binaryQuestion,
  resolutionSource,
  resolutionRules,
  description,
  resolutionDate,
  imageUrl,
  binaryOutcomeYes,
  binaryOutcomeNo,
  communityName,
  communityIcon,
}: MarketPreviewProps) {
  const formattedDate = resolutionDate
    ? (() => {
        try {
          return new Date(resolutionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        }
        catch {
          return resolutionDate
        }
      })()
    : null
  const placeholderTitle = 'Your market title will appear here'
  const placeholderQuestion = 'Will the resolution criterion be met?'

  return (
    <div className="rounded-sm border bg-card">
      {/* Card header — mirrors CommunityMarketCard */}
      <div className="flex items-start gap-3 border-b border-border/60 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-base">
          {communityIcon
            ? <img src={communityIcon} alt="" className="size-full rounded-sm object-cover" />
            : '🏛️'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {communityName}
          </p>
          <h3 className="line-clamp-3 text-base/tight font-semibold">
            {title || placeholderTitle}
          </h3>
        </div>
      </div>

      {/* Outcomes preview */}
      <div className="grid grid-cols-2 gap-2 p-4">
        <div className="rounded-sm border border-(--yes)/30 bg-(--yes)/10 px-3 py-2 text-center">
          <p className="text-xs font-medium text-(--yes)">{binaryOutcomeYes || 'Yes'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Awaiting trading</p>
        </div>
        <div className="rounded-sm border border-(--no)/30 bg-(--no)/10 px-3 py-2 text-center">
          <p className="text-xs font-medium text-(--no)">{binaryOutcomeNo || 'No'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Awaiting trading</p>
        </div>
      </div>

      {/* Details */}
      <div className="grid gap-3 border-t border-border/60 p-4">
        <Row icon={BookOpenIcon} label="Binary question">
          {binaryQuestion || placeholderQuestion}
        </Row>
        {description && (
          <Row icon={BookOpenIcon} label="Description">
            <p className="whitespace-pre-wrap text-foreground/80">{description}</p>
          </Row>
        )}
        <Row icon={GlobeIcon} label="Resolution source">
          <span className={resolutionSource ? '' : 'text-muted-foreground italic'}>
            {resolutionSource || 'No source set — the AI assistant can suggest one.'}
          </span>
        </Row>
        <Row icon={BookOpenIcon} label="Resolution rules">
          <p className={`whitespace-pre-wrap ${resolutionRules ? 'text-foreground/80' : 'text-muted-foreground italic'}`}>
            {resolutionRules || 'No rules set yet. Concrete, source-cited rules unlock the review queue.'}
          </p>
        </Row>
        <div className="flex items-center justify-between gap-3 pt-1">
          <Row icon={CalendarIcon} label="Resolves">
            <span className={formattedDate ? '' : 'text-muted-foreground italic'}>
              {formattedDate || 'No date set'}
            </span>
          </Row>
          {imageUrl && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ImageIcon className="size-3.5" />
              Image attached
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
