'use client'

import { Clock3Icon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'

import { formatEventExpiryCountdown } from '@/app/[locale]/(platform)/event/[slug]/_utils/eventExpiryCountdown'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDate } from '@/lib/formatters'
import { formatPoolVolume } from '@/lib/pools/format'

/**
 * The "volume · end date" strip under the chart, same markup as the platform
 * `EventMetaInformation`, with the volume in the pool's local currency.
 */

interface PoolMetaInformationProps {
  totalMinor: bigint
  currency: string | null
  endDate: Date | string | null
  currentTimestamp: number | null
}

export default function PoolMetaInformation({
  totalMinor,
  currency,
  endDate,
  currentTimestamp,
}: PoolMetaInformationProps) {
  const t = useExtracted()
  const locale = useLocale()
  const volumeLabel = t('{amount} Vol.', { amount: formatPoolVolume(totalMinor, currency) })
  const parsedEndTimestamp = endDate ? new Date(endDate).getTime() : Number.NaN
  const expiryTimestamp = Number.isFinite(parsedEndTimestamp) ? parsedEndTimestamp : null
  const remainingTime = expiryTimestamp !== null ? formatEventExpiryCountdown(expiryTimestamp, currentTimestamp) : null
  const expiryTooltip = t({
    id: 'seeResolutionDetails',
    message: 'See rules below for specific resolution details',
  })
  const remainingLabel =
    remainingTime !== null
      ? t({
          id: 'estimatedTimeRemaining',
          message: 'Estimated time remaining: {time}',
          values: { time: remainingTime },
        })
      : null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{volumeLabel}</span>
      {expiryTimestamp !== null && <span className="mx-1.5 h-4 w-px bg-muted-foreground/40" aria-hidden="true" />}
      {expiryTimestamp !== null && (
        <Tooltip>
          <TooltipTrigger>
            <span className="flex items-center gap-1.5 text-sm/tight text-muted-foreground">
              <Clock3Icon className="size-4 text-muted-foreground" strokeWidth={2.5} />
              <span>{formatDate(expiryTimestamp, locale)}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            collisionPadding={16}
            className="w-max max-w-[calc(100vw-2rem)] text-left text-xs leading-4"
          >
            <div className="flex max-w-full min-w-0 flex-col gap-0.5">
              {remainingLabel !== null && <span className="font-semibold whitespace-nowrap">{remainingLabel}</span>}
              <span className="font-normal wrap-break-word text-foreground">{expiryTooltip}</span>
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
