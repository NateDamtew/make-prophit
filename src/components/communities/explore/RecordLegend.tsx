'use client'

import { useExtracted } from 'next-intl'

/** The key to the little bars on every card. */
export function RecordLegend({ noun }: { noun: string }) {
  const t = useExtracted()
  const rows: Array<{ className: string; label: string }> = [
    { className: 'bg-yes', label: t('Decided on time, and it stood') },
    { className: 'bg-muted-foreground/40', label: t('Jury late, everyone refunded') },
    { className: 'bg-no', label: t('Overturned on appeal') },
    { className: 'border border-dashed border-muted-foreground/40', label: t('Not decided yet') },
  ]
  return (
    <aside className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-[13px] font-bold">{t('Reading a record')}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('The little bars on each card are {noun} last 10 results.', { noun })}
      </p>
      <ul className="mt-3 grid gap-2 text-xs">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <span className={`h-3 w-2 rounded-[2px] ${row.className}`} aria-hidden="true" />
            {row.label}
          </li>
        ))}
      </ul>
    </aside>
  )
}
