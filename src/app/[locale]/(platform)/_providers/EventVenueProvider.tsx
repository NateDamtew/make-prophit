'use client'

import type { ReactNode } from 'react'

import { createContext, useMemo } from 'react'

import type { EventVenue } from '@/lib/polymarket/endpoints'

import { PublicRuntimeConfigContext, usePublicRuntimeConfig } from '@/hooks/usePublicRuntimeConfig'
import { normalizeEventVenue, polymarketRuntimeConfigOverrides } from '@/lib/polymarket/endpoints'

const EventVenueContext = createContext<EventVenue>('kuest')

/**
 * Points every CLOB/data/gamma hook below it at Polymarket for venue =
 * 'polymarket' events. Kuest's services are API-compatible clones, so the
 * existing order book, price, history and websocket hooks work unchanged.
 */
export default function EventVenueProvider({ venue, children }: { venue: unknown; children: ReactNode }) {
  const normalizedVenue = normalizeEventVenue(venue)
  const config = usePublicRuntimeConfig()
  const value = useMemo(
    () => (normalizedVenue === 'polymarket' ? { ...config, ...polymarketRuntimeConfigOverrides() } : config),
    [config, normalizedVenue],
  )

  return (
    <EventVenueContext value={normalizedVenue}>
      <PublicRuntimeConfigContext value={value}>{children}</PublicRuntimeConfigContext>
    </EventVenueContext>
  )
}
