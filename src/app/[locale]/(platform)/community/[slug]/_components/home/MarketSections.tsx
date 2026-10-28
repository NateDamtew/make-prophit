'use client'

import { PlusIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'

import { EmptyState } from '@/components/communities/states/EmptyState'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

import type { PresetMarket } from '../presets/types'
import type { MarketGroup } from './market-groups'

import PoolMarketCard from '../classic/PoolMarketCard'

/**
 * The market list every layout shares: sections for open, closing soon,
 * with the jury, on hold and resolved. Variant decides the grid: one or two
 * columns, or a lead card followed by the rest.
 */

interface MarketSectionsProps {
  groups: Record<MarketGroup, PresetMarket[]>
  communitySlug: string
  communityIconUrl: string | null
  jurySize: number
  isOwner: boolean
  variant?: 'grid' | 'list'
  /** Which sections to draw, in order. */
  order?: MarketGroup[]
  /** Hide the first open market (the layout drew it as a lead). */
  skipLeadId?: string | null
  className?: string
}

const DEFAULT_ORDER: MarketGroup[] = ['closing', 'open', 'deciding', 'held', 'resolved']

export default function MarketSections({
  groups,
  communitySlug,
  communityIconUrl,
  jurySize,
  isOwner,
  variant = 'grid',
  order = DEFAULT_ORDER,
  skipLeadId = null,
  className,
}: MarketSectionsProps) {
  const t = useExtracted()
  const titles: Record<MarketGroup, string> = {
    closing: t('Closing soon'),
    open: t('Open'),
    deciding: t('With the jury'),
    held: t('Result in, payouts held'),
    resolved: t('Resolved'),
  }
  const total = Object.values(groups).reduce((sum, list) => sum + list.length, 0)

  if (total === 0) {
    return isOwner ? (
      <EmptyState
        title={t('Your members are waiting')}
        body={t(
          'Add a market from your suggestions, or write your own. Each one is checked by Prophit before it opens.',
        )}
        action={
          <Button nativeButton={false} render={<Link href={`/community/${communitySlug}/markets/new`} />}>
            <PlusIcon className="size-4" aria-hidden="true" />
            {t('Create a market')}
          </Button>
        }
      />
    ) : (
      <EmptyState
        dashed
        title={t('No markets open right now')}
        body={t('New markets show up here as soon as the community posts them.')}
      />
    )
  }

  return (
    <div className={cn('flex flex-col gap-8', className)}>
      {order.map((group) => {
        const list = groups[group].filter((market) => market.id !== skipLeadId)
        if (list.length === 0) {
          return null
        }
        return (
          <section key={group} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[17px] font-bold">{titles[group]}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">{list.length}</span>
            </div>
            <div className={cn('grid gap-3', variant === 'grid' && 'sm:grid-cols-2')}>
              {list.map((market) => (
                <PoolMarketCard
                  key={market.id}
                  market={market}
                  communitySlug={communitySlug}
                  communityIconUrl={communityIconUrl}
                  jurySize={jurySize}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
