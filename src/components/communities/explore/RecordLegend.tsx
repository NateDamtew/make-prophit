'use client'

import { useExtracted } from 'next-intl'

import { RECORD_MARK_CLASS } from '@/components/communities/explore/RecordBars'

/** The key to the little bars on every card. */
export function RecordLegend({ noun }: { noun: string }) {
  const t = useExtracted()
  const rows = [
    { className: RECORD_MARK_CLASS.stood, label: t('Decided on time, and it stood') },
    { className: RECORD_MARK_CLASS.late, label: t('Jury late, everyone refunded') },
    { className: RECORD_MARK_CLASS.overturned, label: t('Overturned on appeal') },
    { className: RECORD_MARK_CLASS.pending, label: t('Not decided yet') },
  ]
  return (
    <aside className="rounded-2xl border bg-card p-5 text-card-foreground">
      <h2 className="text-lg leading-6 font-bold tracking-tight">{t('Reading a record')}</h2>
      <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">
        {t('The little bars on each card are {noun} last 10 results.', { noun })}
      </p>
      <ul className="mt-3 grid gap-2 text-[13px]">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2.5">
            <span className={`box-border h-3 w-1.5 rounded-[2px] ${row.className}`} aria-hidden="true" />
            {row.label}
          </li>
        ))}
      </ul>
    </aside>
  )
}
