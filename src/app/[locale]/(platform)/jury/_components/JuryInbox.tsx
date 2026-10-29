'use client'

import { GavelIcon, LockIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'
import { useState } from 'react'

import type { JuryInbox as JuryInboxData, JuryInboxItem } from '@/lib/communities/jury-service'

import { formatCloseLabel, formatMoney, formatShortCountdown } from '@/components/communities/format'
import { Button } from '@/components/ui/button'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * Jury duty: the markets waiting on this juror's vote, with the time left
 * and how many seats have voted; what is coming up; the last verdicts; and
 * this month's pay. On desktop the chosen market's rule sits beside the list.
 */

interface JuryInboxProps {
  inbox: JuryInboxData
  username: string | null
  serverNow: number
}

function DueCard({
  item,
  now,
  selected,
  onSelect,
}: {
  item: JuryInboxItem
  now: number
  selected: boolean
  onSelect: () => void
}) {
  const t = useExtracted()
  const locale = useLocale()
  const remaining = item.dueAt ? Math.max(0, new Date(item.dueAt).getTime() - now) : null
  const voted = item.myVote !== null
  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-card p-4',
        selected ? 'border-foreground' : 'border-border',
      )}
    >
      <button type="button" onClick={onSelect} className="flex flex-col gap-2 text-left">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tabular-nums">
          {remaining !== null ? (
            <span
              className={cn(
                'rounded-full px-2 py-0.5',
                remaining < 2 * 60 * 60 * 1000 ? 'bg-no/15 text-no-text' : 'bg-secondary text-secondary-foreground',
              )}
            >
              {t('{time} left', { time: formatShortCountdown(remaining) })}
            </span>
          ) : null}
          <span className="text-muted-foreground">
            {t('{voted} of {seats} voted', { voted: String(item.votedCount), seats: String(item.seatCount) })}
          </span>
        </div>
        <h3 className="text-[15px]/snug font-semibold">{item.title}</h3>
        <p className="text-xs text-muted-foreground tabular-nums">
          {item.communityName}
          {item.dueAt ? ` · ${t('Due {time}', { time: formatCloseLabel(item.dueAt, locale) })}` : ''}
        </p>
      </button>
      <Button
        size="lg"
        variant={voted ? 'secondary' : 'default'}
        nativeButton={false}
        render={<Link href={`/jury/${item.marketId}`} />}
        className={cn('h-11 rounded-md font-bold', !voted && 'shadow-lg shadow-primary/20')}
      >
        {voted ? (
          <LockIcon className="size-4" aria-hidden="true" />
        ) : (
          <GavelIcon className="size-4" aria-hidden="true" />
        )}
        {voted ? t('Sealed · change') : t('Vote now')}
      </Button>
    </article>
  )
}

export default function JuryInbox({ inbox, username, serverNow }: JuryInboxProps) {
  const t = useExtracted()
  const locale = useLocale()
  const tick = useNowTimestamp()
  const now = tick ?? serverNow
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = inbox.due.find((item) => item.marketId === selectedId) ?? inbox.due[0] ?? null
  const recordHref = username ? `/profile/@${username}?tab=jury` : null

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
          <GavelIcon className="size-4" aria-hidden="true" />
          {t('Jury duty')}
        </p>
        <h1 className="text-[26px]/tight font-bold">
          {inbox.due.length === 0
            ? t('Nothing to vote on')
            : inbox.due.length === 1
              ? t('1 market needs your vote')
              : t('{count} markets need your vote', { count: String(inbox.due.length) })}
        </h1>
        <p className="text-sm/relaxed text-muted-foreground">
          {inbox.due.length === 0
            ? inbox.comingUp[0]?.closesAt
              ? t('Your next market closes {time}. You get a notification the moment voting opens.', {
                  time: formatCloseLabel(inbox.comingUp[0].closesAt, locale),
                })
              : t('You get a notification the moment a market you sit on closes.')
            : t('A missed vote refunds the market and costs you your pay for it.')}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          {inbox.due.length > 0 && (
            <section className="flex flex-col gap-3" aria-label={t('Due now')}>
              {inbox.due.map((item) => (
                <DueCard
                  key={item.marketId}
                  item={item}
                  now={now}
                  selected={selected?.marketId === item.marketId}
                  onSelect={() => setSelectedId(item.marketId)}
                />
              ))}
            </section>
          )}

          {inbox.comingUp.length > 0 && (
            <section className="flex flex-col gap-2" aria-label={t('Coming up')}>
              <h2 className="text-[17px] font-bold">{t('Coming up')}</h2>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {inbox.comingUp.map((item) => (
                  <li key={item.marketId} className="flex flex-col gap-1 px-4 py-3">
                    <Link
                      href={`/community/${item.communitySlug}/market/${item.marketId}`}
                      className="text-sm font-semibold underline-offset-2 hover:underline"
                    >
                      {item.title}
                    </Link>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {item.communityName}
                      {item.closesAt
                        ? `. ${t('Voting opens when it closes {time}.', { time: formatCloseLabel(item.closesAt, locale) })}`
                        : ''}
                      {item.dueAt ? ` ${t('Due {time}.', { time: formatCloseLabel(item.dueAt, locale) })}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {inbox.recent.length > 0 && (
            <section className="flex flex-col gap-2" aria-label={t('Recently voted')}>
              <h2 className="text-[17px] font-bold">{t('Recently voted')}</h2>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {inbox.recent.map((item) => (
                  <li key={item.marketId} className="flex items-center gap-3 px-4 py-3">
                    <Link
                      href={`/community/${item.communitySlug}/market/${item.marketId}`}
                      className="min-w-0 flex-1 truncate text-sm font-semibold underline-offset-2 hover:underline"
                    >
                      {item.title}
                    </Link>
                    <span
                      className={cn(
                        'inline-flex h-6 items-center rounded-full px-2 text-[11px] font-bold uppercase',
                        item.myVote === 'yes' && 'bg-yes/15 text-yes',
                        item.myVote === 'no' && 'bg-no/15 text-no-text',
                        item.myVote === 'disputed' && 'bg-secondary text-secondary-foreground',
                      )}
                    >
                      {item.myVote === 'disputed' ? t('Void') : item.myVote}
                    </span>
                    {item.outcome && item.outcome !== item.myVote ? (
                      <span className="text-xs text-muted-foreground">{t('outvoted')}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="rounded-xl bg-secondary px-4 py-3 text-sm tabular-nums">
            {t('Your jury pay this month: {amount}', {
              amount: formatMoney(inbox.payThisMonthMinor, inbox.currency),
            })}
            {recordHref ? (
              <>
                {' · '}
                <Link href={recordHref} className="font-semibold underline underline-offset-[3px]">
                  {t('See your public record')}
                </Link>
              </>
            ) : null}
          </p>
        </div>

        {selected ? (
          <aside className="hidden lg:block">
            <div className="sticky top-24 flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
              <p className="text-xs font-semibold text-muted-foreground">{selected.communityName}</p>
              <h2 className="text-[17px]/snug font-bold">{selected.title}</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm tabular-nums">
                <dt className="text-muted-foreground">{t('Closed')}</dt>
                <dd>{selected.closesAt ? formatCloseLabel(selected.closesAt, locale) : '—'}</dd>
                <dt className="text-muted-foreground">{t('Your vote due')}</dt>
                <dd>{selected.dueAt ? formatCloseLabel(selected.dueAt, locale) : '—'}</dd>
                <dt className="text-muted-foreground">{t('Pool')}</dt>
                <dd>{formatMoney(selected.poolMinor, selected.currency)}</dd>
              </dl>
              {selected.resolutionRules ? (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">{t('The rule you are judging')}</p>
                  <p className="mt-1 text-sm/relaxed">{selected.resolutionRules}</p>
                  {selected.resolutionSource ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('Source: {source}', { source: selected.resolutionSource })}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground tabular-nums">
                {t('{voted} of {seats} have voted. Votes stay sealed until all are in.', {
                  voted: String(selected.votedCount),
                  seats: String(selected.seatCount),
                })}
              </p>
              <Button
                size="lg"
                nativeButton={false}
                render={<Link href={`/jury/${selected.marketId}`} />}
                className="h-12 rounded-md text-base font-bold"
              >
                {selected.myVote ? t('Change your vote') : t('Vote now')}
              </Button>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
