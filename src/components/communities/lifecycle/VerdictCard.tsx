'use client'

import { CameraIcon, ExternalLinkIcon, LinkIcon, LockIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'

import { formatRating, initials } from '@/components/communities/format'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * One juror's verdict, on the page after the reveal: who, what they voted,
 * why, and the source they read. Dissent gets a dashed border, sealed and
 * waiting rows a neutral tag, an overturned vote a greyed pill and a note.
 */

export type VerdictState = 'revealed' | 'sealed' | 'waiting' | 'late' | 'overturned'

export interface VerdictCardProps {
  state: VerdictState
  juror: {
    userId: string
    username: string | null
    image: string | null
    rating: number | null
    markets: number | null
  }
  /** The outcome the juror picked, as shown ("YES", "NO", "DRAW"). Null while sealed. */
  vote?: string | null
  side?: 'yes' | 'no' | null
  reason?: string | null
  source?: { type: 'link' | 'photo'; url: string; label?: string | null } | null
  /** "Sun 14 Dec, 2:12 pm" + on time / late. */
  votedAt?: Date | string | number | null
  wasLate?: boolean
  /** Outvoted, e.g. "2 to 1". */
  dissent?: string | null
  dueAt?: Date | string | number | null
  overturnedAt?: Date | string | number | null
  note?: { text: string; at: Date | string | number } | null
  className?: string
}

function Avatar({ username, image, dim }: { username: string | null; image: string | null; dim?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold',
        dim && 'opacity-50',
      )}
    >
      {image ? <img src={image} alt="" className="size-full object-cover" /> : initials(username)}
    </span>
  )
}

export function VerdictCard({
  state,
  juror,
  vote,
  side,
  reason,
  source,
  votedAt,
  wasLate,
  dissent,
  dueAt,
  overturnedAt,
  note,
  className,
}: VerdictCardProps) {
  const t = useExtracted()
  const locale = useLocale()
  function fmt(value: Date | string | number | null | undefined) {
    if (!value) {
      return ''
    }
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
      .format(new Date(value))
      .toLowerCase()
  }
  const name = juror.username ? `@${juror.username}` : t('Juror')
  const meta = [
    juror.rating !== null ? formatRating(juror.rating) : null,
    juror.markets !== null ? t('{count} markets', { count: String(juror.markets) }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  if (state === 'sealed' || state === 'waiting' || state === 'late') {
    return (
      <div className={cn('flex items-center gap-3 py-2', className)}>
        <Avatar username={juror.username} image={juror.image} dim={state !== 'sealed'} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground">
            {state === 'sealed'
              ? t('Voted {time}', { time: fmt(votedAt) })
              : state === 'late'
                ? t('Missed the {time} deadline', { time: fmt(dueAt) })
                : t('Not voted yet, due {time}', { time: fmt(dueAt) })}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold',
            state === 'sealed' && 'bg-secondary text-secondary-foreground',
            state !== 'sealed' && 'border border-dashed border-muted-foreground/40 text-muted-foreground',
          )}
        >
          {state === 'sealed' && <LockIcon className="size-3" aria-hidden="true" />}
          {state === 'sealed' ? t('Sealed') : state === 'late' ? t('Late') : t('Waiting')}
        </span>
      </div>
    )
  }

  const overturned = state === 'overturned'
  const pill = cn(
    'inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold tracking-wide uppercase',
    overturned && 'bg-secondary text-muted-foreground line-through',
    !overturned && side === 'yes' && 'bg-yes/15 text-yes',
    !overturned && side === 'no' && 'bg-no/15 text-no-text',
    !overturned && !side && 'border border-border bg-background text-foreground',
  )

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-card p-4',
        dissent ? 'border-dashed border-muted-foreground/40' : 'border-border',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar username={juror.username} image={juror.image} />
        <div className="min-w-0 flex-1">
          {juror.username ? (
            <Link href={`/profile/@${juror.username}`} className="block truncate text-sm font-semibold hover:underline">
              {name}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold">{name}</p>
          )}
          {meta && <p className="text-xs text-muted-foreground tabular-nums">{meta}</p>}
        </div>
        {vote && <span className={pill}>{t('Voted {vote}', { vote })}</span>}
      </div>
      {overturned && (
        <p className="rounded-md bg-secondary px-3 py-2 text-xs font-semibold">
          {t('Overturned by Prophit review · {date}', { date: fmt(overturnedAt) })}
        </p>
      )}
      {dissent && (
        <p className="text-xs font-bold text-muted-foreground">{t('Dissent: outvoted {dissent}', { dissent })}</p>
      )}
      {reason && (
        <p className={cn('text-sm/relaxed', overturned ? 'text-muted-foreground' : 'text-foreground')}>{reason}</p>
      )}
      {source && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs font-medium hover:bg-secondary/70"
        >
          {source.type === 'photo' ? (
            <CameraIcon className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <LinkIcon className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 truncate">
            {source.label ?? (source.type === 'photo' ? t('Photo source') : source.url.replace(/^https?:\/\//, ''))}
          </span>
          <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </a>
      )}
      {votedAt && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {fmt(votedAt)}
          {wasLate === undefined ? '' : wasLate ? ` · ${t('late')}` : ` · ${t('on time')}`}
        </p>
      )}
      {note && (
        <div className="rounded-sm bg-background px-3 py-2 text-xs/relaxed">
          <strong className="font-semibold">{t('Note from {name} · {date}:', { name, date: fmt(note.at) })}</strong>{' '}
          {note.text}
        </div>
      )}
    </article>
  )
}
