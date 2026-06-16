import type { DefaultNetworkKey } from '@/lib/network'
import { http } from 'viem'
import { polygon, polygonAmoy } from 'viem/chains'
import { createConfig } from 'wagmi'
import { DEFAULT_NETWORK_KEY } from '@/lib/network'

const NETWORK_CHAIN_BY_KEY = {
  amoy: polygonAmoy,
  polygon,
} as const satisfies Record<DefaultNetworkKey, typeof polygon | typeof polygonAmoy>

export const defaultNetwork = NETWORK_CHAIN_BY_KEY[DEFAULT_NETWORK_KEY]

export function createDynamicWagmiConfig() {
  return createConfig({
    chains: [defaultNetwork] as const,
    multiInjectedProviderDiscovery: false,
    transports: {
      [polygon.id]: http(),
      [polygonAmoy.id]: http(),
    },
  })
}
