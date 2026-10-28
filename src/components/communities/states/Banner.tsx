import type { ReactNode } from 'react'

import { MoonIcon, PauseIcon, SearchCheckIcon, SparklesIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A banner tells someone what state a community or market is in and what it
 * means for their money. Always neutral: an icon, a title, two sentences,
 * optionally one action. Never red.
 */

export type BannerTone = 'paused' | 'dormant' | 'level0' | 'review'

const ICONS: Record<BannerTone, typeof PauseIcon> = {
  paused: PauseIcon,
  dormant: MoonIcon,
  level0: SparklesIcon,
  review: SearchCheckIcon,
}

interface BannerProps {
  tone: BannerTone
  title: string
  body: ReactNode
  action?: ReactNode
  className?: string
}

export function Banner({ tone, title, body, action, className }: BannerProps) {
  const Icon = ICONS[tone]
  return (
    <div className={cn('flex gap-3 rounded-xl bg-secondary p-4', className)} role="status">
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[15px] font-bold">{title}</p>
        <div className="text-[13px]/relaxed text-muted-foreground">{body}</div>
        {action && <div className="pt-1">{action}</div>}
      </div>
    </div>
  )
}
