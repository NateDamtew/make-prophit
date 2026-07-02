export const POLYGON_MAINNET_CHAIN_ID = 137

export const AMOY_CHAIN_ID = 80_002

export type DefaultNetworkKey = 'amoy' | 'polygon'

export function parseNetworkChainId(value: string | number | null | undefined, fallback = AMOY_CHAIN_ID) {
  const parsed = typeof value === 'number' ? value : Number(value?.trim() ?? '')
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

// The network key is resolved from NEXT_PUBLIC_NETWORK_KEY at BUILD time —
// Next.js inlines NEXT_PUBLIC_* into the client bundle, so unlike upstream's
// runtime `window.__PUBLIC_RUNTIME_CONFIG__` lookup there is no module-load
// race (that race locked the wallet config to the wrong chain and broke
// sign-in). Defaults to Polygon mainnet, the fork's launch target.
//
// While Kuest's shared infra (relayer/CLOB/exchanges) is in pre-mainnet
// testing it runs on AMOY — set NEXT_PUBLIC_NETWORK_KEY=amoy (and
// CHAIN_ID=80002) to match it, and remove both at mainnet launch. Everything
// keys off this: chainId, IS_TEST_MODE, the collateral token (test USDC vs
// native USDC), viem/wagmi networks, and the explorer base.
export const DEFAULT_NETWORK_KEY: DefaultNetworkKey
  = process.env.NEXT_PUBLIC_NETWORK_KEY === 'amoy' ? 'amoy' : 'polygon'

const NETWORK_CONFIG = {
  amoy: {
    chainId: AMOY_CHAIN_ID,
    isTestMode: true,
    polygonScanBase: 'https://amoy.polygonscan.com',
  },
  polygon: {
    chainId: POLYGON_MAINNET_CHAIN_ID,
    isTestMode: false,
    polygonScanBase: 'https://polygonscan.com',
  },
} as const satisfies Record<DefaultNetworkKey, {
  chainId: number
  isTestMode: boolean
  polygonScanBase: string
}>

const defaultNetworkConfig = NETWORK_CONFIG[DEFAULT_NETWORK_KEY]

export const DEFAULT_CHAIN_ID = defaultNetworkConfig.chainId

export const IS_TEST_MODE = defaultNetworkConfig.isTestMode

export const POLYGON_SCAN_BASE = defaultNetworkConfig.polygonScanBase
