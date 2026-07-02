export const POLYGON_MAINNET_CHAIN_ID = 137

export const AMOY_CHAIN_ID = 80_002

export type DefaultNetworkKey = 'amoy' | 'polygon'

export function parseNetworkChainId(value: string | number | null | undefined, fallback = AMOY_CHAIN_ID) {
  const parsed = typeof value === 'number' ? value : Number(value?.trim() ?? '')
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

// This fork is Polygon-mainnet only (see CLAUDE.md). Pin the network key to a
// constant so the wagmi/Dynamic chain config can never race to Amoy at
// module-load time. Resolving this from runtime config (as upstream does) meant
// that if `window.__PUBLIC_RUNTIME_CONFIG__` wasn't set at the instant this
// module first evaluated, it fell back to Amoy — and that wrong value locked
// into the wallet config, so Dynamic blocked sign-in with a "network not
// available" prompt. Chain restriction is for trading, not authentication.
export const DEFAULT_NETWORK_KEY: DefaultNetworkKey = 'polygon'

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
