/**
 * rhino.fi bridge REST API — validated identifiers (live-tested 2026-06-17).
 *
 * We deliberately do NOT use `@rhino.fi/sdk` (multi-MB, pulls in tron/solana/
 * starknet/paradex + a forked ethers). We talk to the REST API directly with a
 * thin typed client, and sign the TON payment through the user's TON wallet.
 */

export const RHINO_API_BASE = process.env.RHINO_API_URL ?? 'https://api.rhino.fi'
export const RHINO_BRIDGE_BASE = `${RHINO_API_BASE}/bridge`
export const RHINO_AUTH_URL = `${RHINO_API_BASE}/authentication/auth/apiKey`

/** rhino chain identifiers (NB: Polygon is `MATIC_POS`, not `POLYGON`). */
export const RHINO_CHAIN = {
  ton: 'TON',
  polygon: 'MATIC_POS',
} as const

/** Token symbols as rhino expects them. */
export const RHINO_TOKEN = {
  usdt: 'USDT',
  usdc: 'USDC',
} as const

/**
 * The TON deposit rail: pay USDT (a TON jetton) → receive native USDC on
 * Polygon — which is exactly our trading collateral (COLLATERAL_TOKEN_ADDRESS
 * `0x3c499c…`), so no on-Polygon swap is ever required.
 */
export const TON_DEPOSIT_ROUTE = {
  chainIn: RHINO_CHAIN.ton,
  chainOut: RHINO_CHAIN.polygon,
  tokenIn: RHINO_TOKEN.usdt,
  tokenOut: RHINO_TOKEN.usdc,
} as const

/**
 * The reverse rail: pay native USDC on Polygon (our trading collateral) →
 * receive USDT on TON at the user's connected TON wallet.
 */
export const TON_WITHDRAWAL_ROUTE = {
  chainIn: RHINO_CHAIN.polygon,
  chainOut: RHINO_CHAIN.ton,
  tokenIn: RHINO_TOKEN.usdc,
  tokenOut: RHINO_TOKEN.usdt,
} as const
