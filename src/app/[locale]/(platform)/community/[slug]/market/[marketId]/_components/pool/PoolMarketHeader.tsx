'use client'

import type { ReactNode } from 'react'

import { CheckIcon, ShareIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useEffect, useState } from 'react'

import EventIconImage from '@/components/EventIconImage'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { shareOrCopy } from '@/lib/native-share'
import { cn } from '@/lib/utils'

import type { PoolCommunityRecord, PoolMarketRecord } from './pool-market-types'

import { communityPath } from './pool-market-types'

/**
 * Header for pool markets, laid out exactly like the platform `EventHeader`:
 * icon, category line, title, and the share action. The "category" is the
 * community the market belongs to.
 */

const headerIconButtonClass =
  'size-10 rounded-sm border border-transparent bg-transparent text-foreground transition-colors hover:bg-muted/80 focus-visible:ring-1 focus-visible:ring-ring md:h-9 md:w-9'
const SHARE_SUCCESS_FEEDBACK_DURATION_MS = 2_000

function useScrollPastThreshold(threshold: number) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(
    function trackScrollPastThreshold() {
      function handleWindowScroll() {
        setScrolled(window.scrollY > threshold)
      }

      window.addEventListener('scroll', handleWindowScroll)
      return function removeWindowScrollListener() {
        window.removeEventListener('scroll', handleWindowScroll)
      }
    },
    [threshold],
  )

  return scrolled
}

function useShareFeedback() {
  const [shareSuccess, setShareSuccess] = useState(false)

  useEffect(
    function resetShareSuccess() {
      if (!shareSuccess) {
        return
      }
      const handle = window.setTimeout(() => setShareSuccess(false), SHARE_SUCCESS_FEEDBACK_DURATION_MS)
      return () => window.clearTimeout(handle)
    },
    [shareSuccess],
  )

  return { shareSuccess, setShareSuccess }
}

function PoolMarketIcon({
  market,
  community,
  className,
  sizes,
}: {
  market: Pick<PoolMarketRecord, 'image_url' | 'title'>
  community: Pick<PoolCommunityRecord, 'icon_url' | 'name'>
  className?: string
  sizes?: string
}) {
  const iconUrl = market.image_url?.trim() || community.icon_url?.trim() || ''
  if (!iconUrl) {
    return (
      <div
        aria-hidden="true"
        className={cn('size-full rounded-sm bg-linear-to-br from-primary/70 to-primary', className)}
      />
    )
  }
  return (
    <EventIconImage
      src={iconUrl}
      alt={market.title || community.name}
      sizes={sizes ?? '(min-width: 1024px) 64px, 40px'}
      containerClassName={cn('size-full rounded-sm', className)}
    />
  )
}

function PoolShare({ title }: { title: string }) {
  const t = useExtracted()
  const { shareSuccess, setShareSuccess } = useShareFeedback()

  async function handleShare() {
    const result = await shareOrCopy({ url: window.location.href, title })
    if (result === 'copied') {
      setShareSuccess(true)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(headerIconButtonClass, 'size-auto p-0')}
      onClick={() => void handleShare()}
      aria-label={t('Copy event link')}
    >
      {shareSuccess ? <CheckIcon className="size-4 text-primary" /> : <ShareIcon className="size-4" />}
    </Button>
  )
}

interface PoolMarketHeaderProps {
  market: PoolMarketRecord
  community: PoolCommunityRecord
  actions?: ReactNode
}

export default function PoolMarketHeader({ market, community, actions }: PoolMarketHeaderProps) {
  const t = useExtracted()
  const scrolled = useScrollPastThreshold(20)

  return (
    <div
      className={cn('relative z-10 -mx-4 flex items-center gap-3 px-4 transition-all ease-in-out', {
        'sticky top-0 bg-background py-3 pr-6 lg:top-28 lg:translate-y-1': scrolled,
      })}
    >
      {scrolled && <span className="pointer-events-none absolute inset-x-4 bottom-0 border-b" />}
      <div className="relative z-10 flex flex-1 items-center gap-2 lg:gap-4">
        <div
          className={cn('shrink-0 rounded-sm transition-all ease-in-out', scrolled ? 'size-10' : 'size-10 lg:size-16')}
        >
          <PoolMarketIcon market={market} community={community} sizes={scrolled ? '40px' : undefined} />
        </div>

        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col items-start transition-all ease-in-out',
            scrolled ? 'justify-center gap-0' : 'justify-start gap-0.5',
          )}
        >
          <div
            className={cn(
              `flex max-w-full min-w-0 items-center gap-1 overflow-hidden text-muted-foreground transition-all ease-in-out`,
              scrolled
                ? 'pointer-events-none max-h-0 -translate-y-1 opacity-0'
                : 'max-h-6 translate-y-0 text-xs opacity-100 lg:text-sm',
            )}
            aria-hidden={scrolled}
          >
            <Link href="/communities" className="block min-w-0 truncate transition-colors hover:text-foreground">
              {t('Communities')}
            </Link>
            <span className="shrink-0" aria-hidden>
              ·
            </span>
            <Link
              href={communityPath(community.slug)}
              className="block min-w-0 flex-1 truncate transition-colors hover:text-foreground"
              title={community.name}
            >
              {community.name}
            </Link>
          </div>

          <h1
            className={cn(
              'min-w-0 leading-tight! font-semibold text-pretty transition-all ease-in-out',
              scrolled ? 'text-sm lg:text-base' : 'text-xl lg:text-2xl',
            )}
          >
            {market.title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3 text-foreground">
        {actions}
        <PoolShare title={market.title} />
      </div>
    </div>
  )
}
