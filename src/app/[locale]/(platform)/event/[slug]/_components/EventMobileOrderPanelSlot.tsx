'use client'

import dynamic from 'next/dynamic'

import type { Event, Market, Outcome } from '@/types'

import EventOrderPanelLedgerGate from '@/app/[locale]/(platform)/event/[slug]/_components/EventOrderPanelLedgerGate'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useLedgerUser } from '@/hooks/useLedgerUser'

const EventOrderPanelMobile = dynamic(
  () => import('@/app/[locale]/(platform)/event/[slug]/_components/EventOrderPanelMobile'),
  { ssr: false, loading: () => null },
)

interface EventMobileOrderPanelSlotProps {
  event: Event
  initialMarket: Market | null
  initialOutcome: Outcome | null
}

export default function EventMobileOrderPanelSlot({
  event,
  initialMarket,
  initialOutcome,
}: EventMobileOrderPanelSlotProps) {
  const isMobile = useIsMobile()
  // Fork: local-currency users cannot spend their ledger balance through the on-chain panel.
  const ledgerUser = useLedgerUser()

  if (!isMobile || ledgerUser.isLoading) {
    return null
  }
  // Polymarket-venue events trade from a Polymarket wallet, not the ledger balance.
  if (ledgerUser.currency && event.venue !== 'polymarket') {
    return <EventOrderPanelLedgerGate currency={ledgerUser.currency} isMobile />
  }

  return <EventOrderPanelMobile event={event} initialMarket={initialMarket} initialOutcome={initialOutcome} />
}
