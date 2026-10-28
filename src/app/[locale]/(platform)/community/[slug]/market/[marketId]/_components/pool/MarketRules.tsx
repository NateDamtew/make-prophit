'use client'

import { useExtracted, useLocale } from 'next-intl'

import type { PoolSummary } from '@/lib/pools/service'

import { formatBps, formatCloseLabel, formatMoney } from '@/components/communities/format'

import type { PoolMarketRecord } from './pool-market-types'

/**
 * "Rules & resolution" as a plain definition list: what counts, where the
 * jury looks, when it closes, and the pool's terms. Always open; nothing to
 * expand.
 */

const RULES_URL_REGEX = /((?:https?:\/\/|www\.)[^\s<>"']+)/g
const RULES_URL_TRAILING_PUNCTUATION_REGEX = /([)\].,!?;:]+)$/

function renderRulesTextWithLinks(text: string) {
  return text.split(RULES_URL_REGEX).map((part, index) => {
    if (index % 2 === 0) {
      return part
    }
    const trailingMatch = part.match(RULES_URL_TRAILING_PUNCTUATION_REGEX)
    const trailing = trailingMatch?.[1] ?? ''
    const urlPart = trailing ? part.slice(0, -trailing.length) : part
    const href = urlPart.startsWith('http') ? urlPart : `https://${urlPart}`
    return (
      <span key={`rules-link-${index}`}>
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-[3px]">
          {urlPart}
        </a>
        {trailing || null}
      </span>
    )
  })
}

function resolveSourceUrl(value: string | null): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || !/^(https?:\/\/|www\.)\S+$/i.test(trimmed)) {
    return ''
  }
  const href = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

interface MarketRulesProps {
  market: PoolMarketRecord
  summary: PoolSummary | null
  closesAt: number | null
}

export default function MarketRules({ market, summary, closesAt }: MarketRulesProps) {
  const t = useExtracted()
  const locale = useLocale()
  const description = market.description?.trim() ?? ''
  const rules = market.resolution_rules?.trim() ?? ''
  const sourceUrl = resolveSourceUrl(market.resolution_source)
  const sourceText = sourceUrl ? '' : (market.resolution_source?.trim() ?? '')
  const currency = summary?.pool.currency ?? null

  const rows: Array<{ key: string; label: string; value: React.ReactNode }> = []
  if (description) {
    rows.push({ key: 'about', label: t('What this is'), value: renderRulesTextWithLinks(description) })
  }
  if (rules) {
    rows.push({ key: 'rules', label: t('Resolves Yes if'), value: renderRulesTextWithLinks(rules) })
  }
  if (sourceUrl || sourceText) {
    rows.push({
      key: 'source',
      label: t('Source'),
      value: sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all underline underline-offset-[3px]"
        >
          {sourceUrl}
        </a>
      ) : (
        sourceText
      ),
    })
  }
  if (closesAt !== null) {
    rows.push({ key: 'closes', label: t('Closes'), value: formatCloseLabel(closesAt, locale) })
  }
  if (market.resolution_date) {
    rows.push({ key: 'due', label: t('Verdict due'), value: formatCloseLabel(market.resolution_date, locale) })
  }
  if (summary) {
    rows.push({
      key: 'terms',
      label: t('Pool terms'),
      value: t('{rake} of the pool goes to the community and jury · min {min} · max {max} per person', {
        rake: formatBps(summary.pool.rakeBps),
        min: formatMoney(summary.minStakeMinor, currency),
        max: formatMoney(summary.caps.maxPerPersonMinor, currency),
      }),
    })
  }
  rows.push({ key: 'created', label: t('Created'), value: formatCloseLabel(market.created_at, locale) })

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[17px] font-bold">{t('Rules & resolution')}</h2>
      <dl className="divide-y divide-border rounded-xl border border-border bg-card">
        {rows.map((row) => (
          <div key={row.key} className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
            <dt className="text-[13px] font-semibold text-muted-foreground">{row.label}</dt>
            <dd className="text-sm/relaxed whitespace-pre-line tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
