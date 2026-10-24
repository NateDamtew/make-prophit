'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookmarkIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useRef, useState } from 'react'

import type { HomeFeedCommunity } from '@/lib/home-feed-types'

import {
  HOME_FEED_CARD_CLASS,
  HOME_FEED_PLACEHOLDER_CARD_CLASS,
  HomeFeedPlaceholderNote,
  HomeFeedSectionHeading,
} from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedPrimitives'
import { joinCommunityAction } from '@/app/[locale]/(platform)/community/[slug]/_actions/community-actions'
import { useAppKit } from '@/hooks/useAppKit'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { useUser } from '@/stores/useUser'

interface HomeFeedCommunitiesProps {
  communities: HomeFeedCommunity[]
}

const PLACEHOLDER_TILE_COUNT = 5
const SCROLL_STEP_PX = 360

function useJoinedCommunityIds(userId: string | null) {
  const query = useQuery({
    queryKey: ['home-feed', 'joined-communities', userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch('/api/me/communities')
      if (!response.ok) {
        return [] as string[]
      }

      const payload = (await response.json()) as { items?: Array<{ id: string }> }
      return (payload.items ?? []).map((item) => item.id)
    },
  })

  return new Set(query.data ?? [])
}

interface FollowButtonProps {
  community: HomeFeedCommunity
  isJoined: boolean
}

function FollowButton({ community, isJoined }: FollowButtonProps) {
  const t = useExtracted()
  const user = useUser()
  const { open: openAppKit } = useAppKit()
  const queryClient = useQueryClient()
  const [isPending, setIsPending] = useState(false)
  const [hasJoined, setHasJoined] = useState(false)
  const joined = isJoined || hasJoined

  async function handleClick() {
    if (!user) {
      void openAppKit()
      return
    }

    if (joined || isPending) {
      return
    }

    setIsPending(true)
    try {
      const result = await joinCommunityAction(community.id)
      if (!result.error) {
        setHasJoined(true)
        void queryClient.invalidateQueries({ queryKey: ['home-feed', 'joined-communities'] })
      }
    } finally {
      setIsPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={joined}
      aria-label={
        joined ? t('Following {name}', { name: community.name }) : t('Follow {name}', { name: community.name })
      }
      title={joined ? t('Following') : t('Follow')}
      className={cn(
        'relative z-10 -mt-2 -mr-2 flex size-11 items-center justify-center rounded-full transition-colors',
        joined ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <BookmarkIcon className={cn('size-[18px]', joined && 'fill-current')} aria-hidden="true" />
    </button>
  )
}

interface CommunityTileProps {
  community: HomeFeedCommunity
  isJoined: boolean
}

function CommunityTile({ community, isJoined }: CommunityTileProps) {
  const t = useExtracted()

  return (
    <article className={cn(HOME_FEED_CARD_CLASS, 'w-42 shrink-0 gap-3 rounded-[14px] p-3')}>
      <div className="flex items-start justify-between">
        <span className="flex size-10 items-center justify-center overflow-hidden rounded-[10px] border bg-muted text-base">
          {community.iconUrl ? (
            <img src={community.iconUrl} alt="" className="size-full object-cover" />
          ) : (
            <span aria-hidden="true">🏛️</span>
          )}
        </span>
        <FollowButton community={community} isJoined={isJoined} />
      </div>
      <div className="flex flex-col gap-1">
        {community.isOpen ? (
          <span className="text-[10px] leading-[14px] font-bold tracking-[0.1em] text-primary uppercase">
            {t('Open')}
          </span>
        ) : (
          <span className="text-[10px] leading-[14px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
            {t('Private')}
          </span>
        )}
        <h3 className="m-0 line-clamp-2 text-sm leading-[19px] font-bold">
          <Link href={community.href} className="transition-colors hover:text-primary">
            <span className="absolute inset-0" aria-hidden="true" />
            {community.name}
          </Link>
        </h3>
      </div>
      <span className="mt-auto flex h-[34px] items-center justify-center rounded-full border bg-muted text-xs font-semibold">
        {t('{count, plural, one {# market} other {# markets}}', { count: community.marketCount })}
      </span>
    </article>
  )
}

function CommunityPlaceholderTile() {
  return (
    <article className={cn(HOME_FEED_PLACEHOLDER_CARD_CLASS, 'w-42 shrink-0 gap-3 rounded-[14px] p-3')}>
      <span className="flex size-10 items-center justify-center rounded-[10px] border border-dashed border-muted-foreground/40 bg-muted text-[10px] text-muted-foreground">
        Logo
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] leading-[14px] font-bold tracking-[0.1em] text-primary uppercase">Open</span>
        <h3 className="m-0 text-sm leading-[19px] font-bold text-muted-foreground">[Community name]</h3>
      </div>
      <span className="mt-auto flex h-[34px] items-center justify-center rounded-full border bg-muted text-xs font-semibold text-muted-foreground">
        [0] markets
      </span>
    </article>
  )
}

export default function HomeFeedCommunities({ communities }: HomeFeedCommunitiesProps) {
  const t = useExtracted()
  const user = useUser()
  const joinedIds = useJoinedCommunityIds(user?.id ?? null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const hasCommunities = communities.length > 0

  function scrollBy(direction: -1 | 1) {
    scrollerRef.current?.scrollBy({ left: direction * SCROLL_STEP_PX, behavior: 'smooth' })
  }

  return (
    <section aria-labelledby="home-feed-communities">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <HomeFeedSectionHeading id="home-feed-communities" href="/communities">
            {t('Popular communities')}
          </HomeFeedSectionHeading>
          {!hasCommunities ? <HomeFeedPlaceholderNote>{t('Placeholder')}</HomeFeedPlaceholderNote> : null}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={t('Previous communities')}
            onClick={() => scrollBy(-1)}
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeftIcon className="size-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t('Next communities')}
            onClick={() => scrollBy(1)}
            className="flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
          >
            <ChevronRightIcon className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div ref={scrollerRef} className="flex gap-3 overflow-x-auto pb-1">
        {hasCommunities
          ? communities.map((community) => (
              <CommunityTile key={community.id} community={community} isJoined={joinedIds.has(community.id)} />
            ))
          : Array.from({ length: PLACEHOLDER_TILE_COUNT }, (_, index) => <CommunityPlaceholderTile key={index} />)}
      </div>
    </section>
  )
}
