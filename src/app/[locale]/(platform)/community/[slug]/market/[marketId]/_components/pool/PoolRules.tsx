'use client'

import { GavelIcon, LinkIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'

import type { PoolSummary } from '@/lib/pools/service'

import { Link } from '@/i18n/navigation'
import { formatPoolMoney } from '@/lib/pools/format'
import { cn } from '@/lib/utils'

import type { PoolCommunityRecord, PoolMarketRecord } from './pool-market-types'

import { communityPath } from './pool-market-types'
import PoolAccordionPanel from './PoolAccordionPanel'

/**
 * "Rules & Resolution" for pool markets: the same accordion, rules text,
 * resolution-source and resolver blocks as the platform event page. The
 * resolver is the community jury instead of an on-chain oracle.
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
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:opacity-80">
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

interface PoolRulesProps {
  market: PoolMarketRecord
  community: PoolCommunityRecord
  summary: PoolSummary | null
}

export default function PoolRules({ market, community, summary }: PoolRulesProps) {
  const t = useExtracted()
  const locale = useLocale()

  const description = market.description?.trim() ?? ''
  const rules = market.resolution_rules?.trim() ?? ''
  const rulesText = [description, rules].filter(Boolean).join('\n\n')
  const sourceUrl = resolveSourceUrl(market.resolution_source)
  const sourceText = sourceUrl ? '' : (market.resolution_source?.trim() ?? '')

  function formatDateLabel(value: Date | string | null | undefined, withTime: boolean) {
    if (!value) {
      return t('—')
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return t('—')
    }
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    }).format(date)
  }

  const resolverBlock = (
    <div className="rounded-lg border p-3">
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-linear-to-r from-primary/80 to-primary text-white',
          )}
        >
          {community.icon_url ? (
            <img src={community.icon_url} alt="" className="size-full object-cover" />
          ) : (
            <GavelIcon className="size-5" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{t('Resolver')}</div>
          <Link href={communityPath(community.slug)} className="text-xs text-primary hover:opacity-80">
            {t('{community} jury · {count} jurors', {
              community: community.name,
              count: String(community.jury_size),
            })}
          </Link>
        </div>
      </div>
    </div>
  )

  const sourceBlock = sourceUrl ? (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <LinkIcon className="size-4 -scale-x-100 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{t('Resolution Source')}</div>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs break-all text-primary hover:opacity-80"
            title={sourceUrl}
          >
            {sourceUrl}
          </a>
        </div>
      </div>
    </div>
  ) : null

  const poolTerms = summary
    ? t('Pool fee {fee}% · Minimum stake {min}', {
        fee: String(summary.pool.rakeBps / 100),
        min: formatPoolMoney(summary.minStakeMinor, summary.pool.currency),
      })
    : null

  return (
    <PoolAccordionPanel initialExpanded={false} title={t('Rules & Resolution')}>
      <div className="space-y-2 p-3">
        {rulesText && (
          <div className="text-sm/relaxed whitespace-pre-line text-foreground">
            {renderRulesTextWithLinks(rulesText)}
          </div>
        )}
        {sourceText && (
          <p className="text-sm text-foreground">
            <span className="font-semibold">{t('Resolution Source')}:</span> {sourceText}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-foreground">
          <p>
            <span className="font-semibold">{t('Created At')}:</span> {formatDateLabel(market.created_at, true)}
          </p>
          {poolTerms && <p className="text-muted-foreground">{poolTerms}</p>}
        </div>
        <p className="text-sm text-foreground">
          <span className="font-semibold">{t('End Date')}:</span> {formatDateLabel(market.resolution_date, false)}
        </p>
        {sourceBlock ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {sourceBlock}
            {resolverBlock}
          </div>
        ) : (
          <div className="mt-3">{resolverBlock}</div>
        )}
      </div>
    </PoolAccordionPanel>
  )
}
