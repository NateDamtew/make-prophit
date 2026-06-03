'use client'

import type { Event } from '@/types'
import { CodeXmlIcon } from 'lucide-react'
import { useState } from 'react'
import EventChartEmbedDialog from '@/app/[locale]/(platform)/event/[slug]/_components/EventChartEmbedDialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const headerIconButtonClass = 'size-10 rounded-sm border border-transparent bg-transparent text-foreground transition-colors hover:bg-muted/80 focus-visible:ring-1 focus-visible:ring-ring md:h-9 md:w-9'

interface EventEmbedProps {
  event: Event
}

/**
 * Header-level "Embed" button. Opens the same embed dialog used in the chart
 * toolbar, so the embed action is discoverable right next to Share. Embeds are
 * a passive referral channel — the generated snippet carries the user's
 * affiliate code, so anyone embedding this market plants a referral link.
 */
export default function EventEmbed({ event }: EventEmbedProps) {
  const [open, setOpen] = useState(false)
  const initialMarketId = event.markets[0]?.condition_id ?? null

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(headerIconButtonClass, 'size-auto p-0')}
        onClick={() => setOpen(true)}
        aria-label="Embed this market"
      >
        <CodeXmlIcon className="size-4" />
      </Button>

      <EventChartEmbedDialog
        open={open}
        onOpenChange={setOpen}
        markets={event.markets}
        initialMarketId={initialMarketId}
      />
    </>
  )
}
