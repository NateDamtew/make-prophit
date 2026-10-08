// FORK: plain viem chains — the fork runs Dynamic, not Reown AppKit.
import {
  arbitrum,
  avalanche,
  base,
  blast,
  bsc,
  celo,
  cronos,
  gnosis,
  linea,
  mainnet,
  mantle,
  opBNB,
  optimism,
  scroll,
  sonic,
  unichain,
  worldchain,
  zkSync,
} from 'viem/chains'

const SUPPORTED_EVM_SOURCE_NETWORKS = [
  mainnet,
  arbitrum,
  base,
  bsc,
  optimism,
  avalanche,
  gnosis,
  linea,
  scroll,
  zkSync,
  blast,
  mantle,
  opBNB,
  worldchain,
  unichain,
  celo,
  cronos,
  sonic,
] as const

export const supportedEvmChainIds = SUPPORTED_EVM_SOURCE_NETWORKS.map(({ id }) => Number(id))
