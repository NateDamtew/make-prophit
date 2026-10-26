'use client'

import type { ReactNode } from 'react'

import { ChevronRightIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'

import type { HomeFeedDirection } from '@/lib/home-feed-types'

import EventIconImage from '@/components/EventIconImage'
import { useOutcomeLabel } from '@/hooks/useOutcomeLabel'
import { Link } from '@/i18n/navigation'
import { formatVolume } from '@/lib/formatters'
import { cn } from '@/lib/utils'

export const HOME_FEED_CARD_CLASS =
  'group relative flex flex-col rounded-2xl border bg-card text-card-foreground transition-colors hover:border-foreground/25'

export const HOME_FEED_PLACEHOLDER_CARD_CLASS =
  'relative flex flex-col rounded-2xl border border-dashed border-muted-foreground/40 bg-card text-card-foreground'

export const HOME_FEED_CARD_GRID_CLASS = 'grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))]'

interface HomeFeedSectionHeadingProps {
  children: ReactNode
  href?: string
  id: string
  size?: 'section' | 'panel'
}

export function HomeFeedSectionHeading({ children, href, id, size = 'section' }: HomeFeedSectionHeadingProps) {
  const content = (
    <>
      {children}
      {href ? <ChevronRightIcon className="size-[18px] text-muted-foreground" aria-hidden="true" /> : null}
    </>
  )

  return (
    <h2
      id={id}
      className={cn('font-bold tracking-tight', size === 'section' ? 'text-[22px] leading-7' : 'text-lg leading-6')}
    >
      {href ? (
        <Link href={href} className="inline-flex items-center gap-2 transition-colors hover:text-primary">
          {content}
        </Link>
      ) : (
        <span className="inline-flex items-center gap-2">{content}</span>
      )}
    </h2>
  )
}

interface HomeFeedPlaceholderNoteProps {
  children: ReactNode
}

export function HomeFeedPlaceholderNote({ children }: HomeFeedPlaceholderNoteProps) {
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-muted-foreground/40 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </span>
  )
}

interface HomeFeedOutcomeLinkProps {
  className?: string
  href: string
  label: string
  tone: 'yes' | 'no'
  /** Shown on hover in place of the label, e.g. the chance of this outcome. */
  hoverLabel?: string | null
}

export function HomeFeedOutcomeLink({ className, href, label, tone, hoverLabel }: HomeFeedOutcomeLinkProps) {
  const normalizeOutcomeLabel = useOutcomeLabel()
  const resolvedLabel = normalizeOutcomeLabel(label) || label

  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center rounded-[10px] border text-sm font-semibold transition-colors',
        tone === 'yes'
          ? 'border-yes/30 bg-yes/10 text-yes hover:bg-yes/20'
          : 'border-no/35 bg-no/10 text-no-text hover:bg-no/20',
        hoverLabel ? 'group/outcome' : null,
        className,
      )}
    >
      <span className={cn('truncate', hoverLabel && 'group-hover/outcome:hidden')}>{resolvedLabel}</span>
      {hoverLabel ? (
        <span className="hidden tabular-nums group-hover/outcome:inline" aria-hidden="true">
          {hoverLabel}
        </span>
      ) : null}
    </Link>
  )
}

interface HomeFeedChanceBarProps {
  chance: number | null
}

export function HomeFeedChanceBar({ chance }: HomeFeedChanceBarProps) {
  const width = chance == null ? 0 : Math.max(0, Math.min(100, chance))

  return (
    <div className="h-1 rounded-full bg-muted" aria-hidden="true">
      <div className="h-1 rounded-full bg-primary" style={{ width: `${width}%` }} />
    </div>
  )
}

export function formatChanceLabel(chance: number | null) {
  return chance == null ? '--%' : `${Math.round(chance)}%`
}

interface HomeFeedTickerTileProps {
  label: string | null
  /** The event's own icon; the text ticker is only the fallback. */
  iconUrl?: string | null
}

export function HomeFeedTickerTile({ label, iconUrl }: HomeFeedTickerTileProps) {
  if (iconUrl) {
    return (
      <EventIconImage
        src={iconUrl}
        alt=""
        sizes="40px"
        containerClassName="size-10 shrink-0 rounded-[10px] bg-muted"
        imageClassName="object-cover"
      />
    )
  }

  return (
    <span
      className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-muted text-[11px] font-bold tracking-[0.02em]"
      aria-hidden="true"
    >
      {label ?? '—'}
    </span>
  )
}

interface HomeFeedLiveFlagProps {
  children?: ReactNode
  className?: string
}

export function HomeFeedLiveFlag({ children, className }: HomeFeedLiveFlagProps) {
  const t = useExtracted()

  return (
    <span className={cn('inline-flex items-center gap-2 text-xs text-muted-foreground', className)}>
      <span className="size-1.5 rounded-full bg-no-text" aria-hidden="true" />
      <span className="font-bold text-no-text uppercase">{t('Live')}</span>
      {children}
    </span>
  )
}

interface HomeFeedVolumeLabelProps {
  className?: string
  volume: number
}

export function HomeFeedVolumeLabel({ className, volume }: HomeFeedVolumeLabelProps) {
  const t = useExtracted()

  return (
    <span className={cn('text-xs text-muted-foreground', className)}>
      {t('{amount} Vol.', { amount: formatVolume(volume) })}
    </span>
  )
}

export function useDirectionLabel() {
  const t = useExtracted()

  return function directionLabel(direction: HomeFeedDirection['direction']) {
    return direction === 'up' ? t('Up') : t('Down')
  }
}
