'use client'

import { useExtracted } from 'next-intl'

import type { HomeFeedMarketCard } from '@/lib/home-feed-types'

import {
  formatChanceLabel,
  HOME_FEED_CARD_CLASS,
  HOME_FEED_PLACEHOLDER_CARD_CLASS,
  HomeFeedChanceBar,
  HomeFeedLiveFlag,
  HomeFeedOutcomeLink,
  HomeFeedTickerTile,
  HomeFeedVolumeLabel,
  useDirectionLabel,
} from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedPrimitives'
import EventIconImage from '@/components/EventIconImage'
import { Link } from '@/i18n/navigation'
import { resolveLeadingDirection } from '@/lib/home-feed-types'
import { cn } from '@/lib/utils'

interface CardProps {
  card: HomeFeedMarketCard
}

function CardTitle({ card, className }: CardProps & { className?: string }) {
  return (
    <h3 className={cn('m-0 text-[15px] leading-5 font-bold tracking-[-0.01em]', className)}>
      <Link href={card.href} className="transition-colors hover:text-primary">
        <span className="absolute inset-0" aria-hidden="true" />
        {card.title}
      </Link>
    </h3>
  )
}

function StoryHeader({ card }: CardProps) {
  return (
    <div className="relative h-28 overflow-hidden bg-muted">
      {card.iconUrl ? (
        <EventIconImage
          src={card.iconUrl}
          alt=""
          sizes="(min-width: 1024px) 320px, 100vw"
          containerClassName="absolute inset-0"
          imageClassName="object-cover"
        />
      ) : (
        <svg
          viewBox="0 0 400 112"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 size-full"
          aria-hidden="true"
        >
          <circle cx="200" cy="150" r="130" fill="none" className="stroke-foreground/10" strokeWidth="1.5" />
          <circle cx="200" cy="150" r="100" fill="none" className="stroke-foreground/10" strokeWidth="1.5" />
          <circle cx="200" cy="150" r="70" fill="none" className="stroke-primary/50" strokeWidth="1.5" />
          <circle cx="200" cy="150" r="40" className="fill-primary/15" />
        </svg>
      )}
      <div
        className="absolute inset-x-0 bottom-0 h-14 bg-linear-to-t from-background/80 to-transparent"
        aria-hidden="true"
      />
      {card.category ? (
        <span className="absolute bottom-2.5 left-3 rounded-md bg-background/85 px-2 py-0.5 text-[10px] leading-[14px] font-bold tracking-[0.12em] text-foreground uppercase">
          {card.category}
        </span>
      ) : null}
    </div>
  )
}

interface OutcomeRowsProps {
  card: HomeFeedMarketCard
  showButtons: boolean
}

function OutcomeRows({ card, showButtons }: OutcomeRowsProps) {
  return (
    <div className="flex flex-col gap-3">
      {card.outcomes.map((outcome) => (
        <div key={outcome.key} className="relative z-10 flex items-center gap-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex justify-between gap-2 text-sm font-medium">
              <Link href={outcome.marketHref} className="truncate hover:underline" title={outcome.label}>
                {outcome.label}
              </Link>
              <span className="font-bold tabular-nums">{formatChanceLabel(outcome.chance)}</span>
            </div>
            <HomeFeedChanceBar chance={outcome.chance} />
          </div>
          {showButtons ? (
            <div className="flex gap-1">
              <HomeFeedOutcomeLink href={outcome.yesHref} label="Yes" tone="yes" className="h-10 w-11 text-[13px]" />
              <HomeFeedOutcomeLink href={outcome.noHref} label="No" tone="no" className="h-10 w-11 text-[13px]" />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function BinaryActions({ card, size = 'lg' }: CardProps & { size?: 'lg' | 'md' }) {
  const upChance = card.chance
  const downChance = upChance == null ? null : 100 - upChance
  const className = size === 'lg' ? 'h-11 flex-1' : 'h-10 flex-1 text-[13px]'

  return (
    <div className="relative z-10 flex gap-2">
      <HomeFeedOutcomeLink
        href={card.yesHref}
        label={card.yesLabel}
        tone="yes"
        className={className}
        hoverLabel={upChance == null ? null : formatChanceLabel(upChance)}
      />
      <HomeFeedOutcomeLink
        href={card.noHref}
        label={card.noLabel}
        tone="no"
        className={className}
        hoverLabel={downChance == null ? null : formatChanceLabel(downChance)}
      />
    </div>
  )
}

/** Top stories: image header, title, outcome rows with Yes/No or one big chance. */
export function HomeFeedStoryCard({ card }: CardProps) {
  const t = useExtracted()
  const isMultiOutcome = card.outcomes.length > 0

  return (
    <article className={cn(HOME_FEED_CARD_CLASS, 'overflow-hidden')}>
      <StoryHeader card={card} />
      <div className="flex flex-1 flex-col gap-3.5 p-4">
        <CardTitle card={card} className="text-base leading-[22px]" />
        {isMultiOutcome ? (
          <OutcomeRows card={card} showButtons />
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl leading-10 font-bold tracking-[-0.03em] tabular-nums">
                {formatChanceLabel(card.chance)}
              </span>
              <span className="text-[13px] text-muted-foreground">{t('chance')}</span>
            </div>
            <BinaryActions card={card} />
          </>
        )}
        <div className="mt-auto flex items-center gap-2">
          {card.isLive ? <HomeFeedLiveFlag /> : null}
          <HomeFeedVolumeLabel volume={card.volume} />
        </div>
      </div>
    </article>
  )
}

/** Crypto, up or down: ticker tile, title, direction chip, Up/Down, LIVE + asset. */
export function HomeFeedUpDownCard({ card }: CardProps) {
  const directionLabel = useDirectionLabel()
  const leading = resolveLeadingDirection(card.chance)

  return (
    <article className={cn(HOME_FEED_CARD_CLASS, 'gap-4 p-4')}>
      <div className="flex items-center gap-3">
        <HomeFeedTickerTile label={card.ticker} />
        <CardTitle card={card} className="flex-1" />
        {leading ? (
          <span
            className={cn(
              'shrink-0 rounded-lg px-2 py-1 text-[13px] font-bold tabular-nums',
              leading.direction === 'up' ? 'bg-yes/12 text-yes' : 'bg-no/12 text-no-text',
            )}
          >
            {leading.chance}% {directionLabel(leading.direction)}
          </span>
        ) : null}
      </div>
      <BinaryActions card={card} />
      <div className="mt-auto flex items-center gap-2">
        {card.isLive ? (
          <HomeFeedLiveFlag>{card.assetName ? <span>{card.assetName}</span> : null}</HomeFeedLiveFlag>
        ) : (
          <HomeFeedVolumeLabel volume={card.volume} />
        )}
      </div>
    </article>
  )
}

/** Finance and commodities, Politics lead card: ticker tile, title, big %, direction word, Up/Down, volume. */
export function HomeFeedBigChanceCard({ card }: CardProps) {
  const directionLabel = useDirectionLabel()
  const t = useExtracted()
  const leading = card.isUpDown ? resolveLeadingDirection(card.chance) : null
  const isMultiOutcome = card.outcomes.length > 0

  return (
    <article className={cn(HOME_FEED_CARD_CLASS, 'gap-4 p-4')}>
      <div className="flex items-start gap-3">
        <HomeFeedTickerTile label={card.ticker} />
        <CardTitle card={card} className="flex-1" />
      </div>
      {isMultiOutcome ? (
        <OutcomeRows card={card} showButtons={false} />
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] leading-8 font-bold tracking-[-0.03em] tabular-nums">
              {leading ? `${leading.chance}%` : formatChanceLabel(card.chance)}
            </span>
            {leading ? (
              <span className={cn('text-[13px] font-bold', leading.direction === 'up' ? 'text-yes' : 'text-no-text')}>
                {directionLabel(leading.direction)}
              </span>
            ) : (
              <span className="text-[13px] text-muted-foreground">{t('chance')}</span>
            )}
          </div>
          <BinaryActions card={card} />
        </>
      )}
      <div className="mt-auto flex items-center gap-2">
        {card.isLive ? <HomeFeedLiveFlag /> : null}
        <HomeFeedVolumeLabel volume={card.volume} />
      </div>
    </article>
  )
}

/** Politics follow-up cards: title plus bar rows, no buy buttons. */
export function HomeFeedOutcomeBarsCard({ card }: CardProps) {
  return (
    <article className={cn(HOME_FEED_CARD_CLASS, 'gap-3.5 p-4')}>
      <CardTitle card={card} />
      {card.outcomes.length > 0 ? (
        <OutcomeRows card={card} showButtons={false} />
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm font-medium">
            <span className="truncate">{card.yesLabel}</span>
            <span className="font-bold tabular-nums">{formatChanceLabel(card.chance)}</span>
          </div>
          <HomeFeedChanceBar chance={card.chance} />
        </div>
      )}
      <div className="mt-auto flex items-center gap-2">
        {card.isLive ? <HomeFeedLiveFlag /> : null}
        <HomeFeedVolumeLabel volume={card.volume} />
      </div>
    </article>
  )
}

/** Sports: two team bars plus home/draw/away buttons. */
export function HomeFeedSportsCard({ card }: CardProps) {
  const t = useExtracted()
  const sports = card.sports

  if (!sports) {
    return <HomeFeedOutcomeBarsCard card={card} />
  }

  return (
    <article className={cn(HOME_FEED_CARD_CLASS, 'gap-3.5 p-4')}>
      <CardTitle card={card} />
      <div className="flex flex-col gap-2.5">
        {[sports.team1, sports.team2].map((team) => (
          <div key={team.name} className="flex flex-col gap-1.5">
            <div className="flex justify-between gap-2 text-sm font-medium">
              <span className="truncate">{team.name}</span>
              <span className="font-bold tabular-nums">{formatChanceLabel(team.chance)}</span>
            </div>
            <HomeFeedChanceBar chance={team.chance} />
          </div>
        ))}
      </div>
      <div className="relative z-10 flex flex-wrap gap-2">
        {sports.buttons.map((button) => (
          <Link
            key={button.key}
            href={button.href}
            className="inline-flex h-11 min-w-0 flex-[1_1_60px] items-center justify-center rounded-[10px] border bg-muted px-2 text-[13px] font-semibold transition-colors hover:border-foreground/25"
          >
            <span className="truncate">{button.tone === 'draw' ? t('Draw') : button.label}</span>
          </Link>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
        {card.isLive ? <HomeFeedLiveFlag /> : null}
        <HomeFeedVolumeLabel volume={card.volume} />
        {sports.startLabel ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{sports.startLabel}</span>
          </>
        ) : null}
      </div>
    </article>
  )
}

/** Dashed placeholder shown while fewer than three sports markets are live. */
export function HomeFeedSportsPlaceholderCard() {
  return (
    <article className={cn(HOME_FEED_PLACEHOLDER_CARD_CLASS, 'gap-3.5 p-4')} aria-label="[Sports market question]">
      <h3 className="m-0 text-[15px] leading-5 font-bold text-muted-foreground">[Sports market question]</h3>
      <div className="flex flex-col gap-2.5 text-sm font-medium text-muted-foreground">
        <div className="flex justify-between">
          <span>[Team A]</span>
          <span className="font-bold">--%</span>
        </div>
        <div className="flex justify-between">
          <span>[Team B]</span>
          <span className="font-bold">--%</span>
        </div>
      </div>
      <div className="mt-auto text-xs text-muted-foreground">[$0 Vol.] · [Date and time]</div>
    </article>
  )
}
