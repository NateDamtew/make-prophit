'use client'

import { useExtracted } from 'next-intl'
import { useMemo, useState } from 'react'

import type { HomeNewsFeed, HomeNewsStory } from '@/lib/home-news'

import {
  formatChanceLabel,
  HOME_FEED_CARD_CLASS,
  HOME_FEED_PLACEHOLDER_CARD_CLASS,
  HomeFeedPlaceholderNote,
  HomeFeedSectionHeading,
} from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedPrimitives'
import { Link } from '@/i18n/navigation'
import { formatTimeAgo } from '@/lib/formatters'
import { cn } from '@/lib/utils'

interface HomeFeedNewsProps {
  currentTimestamp: number | null
  feed: HomeNewsFeed
}

const SIDE_STORY_COUNT = 3

function resolveStoryTime(story: HomeNewsStory, currentTimestamp: number | null) {
  if (!story.publishedAt) {
    return '[time ago]'
  }

  return formatTimeAgo(story.publishedAt, currentTimestamp ?? Date.now())
}

interface HeadlineLinkProps {
  story: HomeNewsStory
  className?: string
}

function HeadlineLink({ story, className }: HeadlineLinkProps) {
  if (!story.url) {
    return <span className={className}>{story.headline}</span>
  }

  return (
    <a
      href={story.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('transition-colors hover:text-primary', className)}
    >
      <span className="absolute inset-0" aria-hidden="true" />
      {story.headline}
    </a>
  )
}

interface OutletLineProps {
  story: HomeNewsStory
  currentTimestamp: number | null
  size?: 'sm' | 'md'
}

function OutletLine({ story, currentTimestamp, size = 'sm' }: OutletLineProps) {
  const timeLabel = resolveStoryTime(story, currentTimestamp)

  return (
    <div className={cn('mt-auto flex items-center gap-1.5', size === 'md' ? 'text-[13px]' : 'text-xs')}>
      {story.outlet.logoUrl ? (
        <img src={story.outlet.logoUrl} alt="" className={cn('rounded', size === 'md' ? 'size-5' : 'size-4')} />
      ) : (
        <span
          className={cn(
            'rounded border border-dashed border-muted-foreground/40 bg-muted',
            size === 'md' ? 'size-5' : 'size-4',
          )}
          aria-hidden="true"
        />
      )}
      <span className="font-bold">{story.outlet.name}</span>
      <span className="text-muted-foreground">· {timeLabel}</span>
    </div>
  )
}

interface ImageSlotProps {
  story: HomeNewsStory
  className: string
  label: string
}

function ImageSlot({ story, className, label }: ImageSlotProps) {
  if (story.imageUrl) {
    return <img src={story.imageUrl} alt="" className={cn('object-cover', className)} />
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center border-dashed border-muted-foreground/40 bg-muted text-xs text-muted-foreground',
        className,
      )}
      aria-hidden="true"
    >
      {label}
    </div>
  )
}

interface StoryCardProps {
  story: HomeNewsStory
  currentTimestamp: number | null
  isPlaceholder: boolean
}

function LeadStory({ story, currentTimestamp, isPlaceholder }: StoryCardProps) {
  const t = useExtracted()

  return (
    <article
      className={cn(
        isPlaceholder ? HOME_FEED_PLACEHOLDER_CARD_CLASS : HOME_FEED_CARD_CLASS,
        'min-w-0 flex-[1.6_1_420px] overflow-hidden',
      )}
    >
      <ImageSlot story={story} className="h-65 w-full border-b" label="[Lead story image]" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        {story.category ? (
          <span className="text-[11px] leading-[14px] font-bold tracking-[0.1em] text-primary uppercase">
            {story.category}
          </span>
        ) : null}
        <h3 className="m-0 text-[28px] leading-[34px] font-bold tracking-tight text-balance">
          <HeadlineLink story={story} />
        </h3>
        {story.summary ? <p className="m-0 text-[15px] leading-[22px] text-muted-foreground">{story.summary}</p> : null}
        <OutletLine story={story} currentTimestamp={currentTimestamp} size="md" />
        {story.relatedMarket ? (
          <Link
            href={story.relatedMarket.href}
            className="relative z-10 mt-1 flex min-h-12 items-center gap-2.5 rounded-xl border bg-muted px-3.5 text-[13px] transition-colors hover:border-foreground/25"
          >
            <span className="text-muted-foreground">{t('Related market')}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{story.relatedMarket.title}</span>
            <span className="font-bold text-yes tabular-nums">{formatChanceLabel(story.relatedMarket.chance)}</span>
          </Link>
        ) : null}
      </div>
    </article>
  )
}

function SideStory({ story, currentTimestamp, isPlaceholder }: StoryCardProps) {
  return (
    <article
      className={cn(
        isPlaceholder ? HOME_FEED_PLACEHOLDER_CARD_CLASS : HOME_FEED_CARD_CLASS,
        'flex-1 flex-row gap-3.5 p-3.5',
      )}
    >
      <ImageSlot
        story={story}
        className="size-24 shrink-0 rounded-[10px] border text-center text-[11px]"
        label="[Image]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {story.category ? (
          <span className="text-[10px] leading-[14px] font-bold tracking-[0.1em] text-primary uppercase">
            {story.category}
          </span>
        ) : null}
        <h3 className="m-0 text-base leading-[22px] font-bold tracking-[-0.01em]">
          <HeadlineLink story={story} />
        </h3>
        <OutletLine story={story} currentTimestamp={currentTimestamp} />
      </div>
    </article>
  )
}

function GridStory({ story, currentTimestamp, isPlaceholder }: StoryCardProps) {
  return (
    <article className={cn(isPlaceholder ? HOME_FEED_PLACEHOLDER_CARD_CLASS : HOME_FEED_CARD_CLASS, 'overflow-hidden')}>
      <ImageSlot story={story} className="h-[130px] w-full border-b" label="[Story image]" />
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        {story.category ? (
          <span className="text-[10px] leading-[14px] font-bold tracking-[0.1em] text-primary uppercase">
            {story.category}
          </span>
        ) : null}
        <h3 className="m-0 text-base leading-[22px] font-bold tracking-[-0.01em]">
          <HeadlineLink story={story} />
        </h3>
        <OutletLine story={story} currentTimestamp={currentTimestamp} />
      </div>
    </article>
  )
}

export default function HomeFeedNews({ currentTimestamp, feed }: HomeFeedNewsProps) {
  const t = useExtracted()
  const [activeOutlet, setActiveOutlet] = useState<string | null>(null)
  const stories = useMemo(
    () => (activeOutlet ? feed.stories.filter((story) => story.outlet.name === activeOutlet) : feed.stories),
    [activeOutlet, feed.stories],
  )
  const [lead, ...rest] = stories
  const sideStories = rest.slice(0, SIDE_STORY_COUNT)
  const gridStories = rest.slice(SIDE_STORY_COUNT)

  if (!lead) {
    return null
  }

  return (
    <section aria-labelledby="home-feed-news">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <HomeFeedSectionHeading id="home-feed-news">{t('News')}</HomeFeedSectionHeading>
          {feed.isPlaceholder ? (
            <HomeFeedPlaceholderNote>{t('Sample stories until a news source is connected')}</HomeFeedPlaceholderNote>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('Filter news by outlet')}>
          <button
            type="button"
            aria-pressed={activeOutlet === null}
            onClick={() => setActiveOutlet(null)}
            className={cn(
              'h-10 rounded-full px-4 text-[13px] font-bold transition-colors',
              activeOutlet === null
                ? 'bg-primary text-primary-foreground'
                : 'border bg-card hover:border-foreground/25',
            )}
          >
            {t('All outlets')}
          </button>
          {feed.outlets.map((outlet) => (
            <button
              key={outlet}
              type="button"
              aria-pressed={activeOutlet === outlet}
              onClick={() => setActiveOutlet(outlet)}
              className={cn(
                'h-10 rounded-full px-4 text-[13px] font-semibold transition-colors',
                activeOutlet === outlet
                  ? 'bg-primary font-bold text-primary-foreground'
                  : 'border bg-card hover:border-foreground/25',
              )}
            >
              {outlet}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        <LeadStory story={lead} currentTimestamp={currentTimestamp} isPlaceholder={feed.isPlaceholder} />
        {sideStories.length > 0 ? (
          <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
            {sideStories.map((story) => (
              <SideStory
                key={story.id}
                story={story}
                currentTimestamp={currentTimestamp}
                isPlaceholder={feed.isPlaceholder}
              />
            ))}
          </div>
        ) : null}
      </div>

      {gridStories.length > 0 ? (
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
          {gridStories.map((story) => (
            <GridStory
              key={story.id}
              story={story}
              currentTimestamp={currentTimestamp}
              isPlaceholder={feed.isPlaceholder}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
