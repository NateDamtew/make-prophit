import type {
  PublicQuoteParams,
  RhinoBridgeStatus,
  RhinoConfig,
  RhinoPublicQuote,
  RhinoUserQuote,
  UserQuoteParams,
} from '@/lib/rhino/types'
import {
  RHINO_AUTH_URL,
  RHINO_BRIDGE_BASE,
} from '@/lib/rhino/constants'

/**
 * Server-side rhino.fi bridge client.
 *
 * - Public reads (`getConfig`, `getPublicQuote`) need no auth.
 * - Authenticated writes (`getUserQuote`, `commitQuote`, `getBridgeStatus`)
 *   exchange a server-only `RHINO_API_KEY` for a short-lived JWT (1h TTL),
 *   cached at module scope and refreshed before expiry.
 *
 * This module must only be imported from server code (server actions / route
 * handlers) — it reads `process.env.RHINO_API_KEY`.
 */

export class RhinoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message)
    this.name = 'RhinoApiError'
  }
}

const REQUEST_TIMEOUT_MS = 15_000
const JWT_REFRESH_MARGIN_MS = 60_000

async function rhinoFetch(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  const text = await response.text()
  if (!response.ok) {
    throw new RhinoApiError(`rhino ${init?.method ?? 'GET'} ${url} failed (${response.status})`, response.status, text)
  }
  return text ? JSON.parse(text) : null
}

// ── Public (no auth) ────────────────────────────────────────────────────────

export async function getRhinoConfig(): Promise<RhinoConfig> {
  return await rhinoFetch(`${RHINO_BRIDGE_BASE}/configs`) as RhinoConfig
}

export async function getPublicQuote(params: PublicQuoteParams): Promise<RhinoPublicQuote> {
  const query = new URLSearchParams({
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    chainIn: params.chainIn,
    chainOut: params.chainOut,
    amount: params.amount,
    mode: params.mode,
  })
  return await rhinoFetch(`${RHINO_BRIDGE_BASE}/quote/bridge-swap/public?${query}`) as RhinoPublicQuote
}

// ── Authenticated (JWT from RHINO_API_KEY) ──────────────────────────────────

let cachedJwt: { token: string, expiresAt: number } | null = null

async function getJwt(): Promise<string> {
  const apiKey = process.env.RHINO_API_KEY
  if (!apiKey) {
    throw new RhinoApiError('RHINO_API_KEY is not configured', 0, '')
  }

  if (cachedJwt && cachedJwt.expiresAt - JWT_REFRESH_MARGIN_MS > Date.now()) {
    return cachedJwt.token
  }

  const result = await rhinoFetch(RHINO_AUTH_URL, {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  }) as { jwt?: string }

  if (!result?.jwt) {
    throw new RhinoApiError('rhino auth returned no jwt', 0, JSON.stringify(result))
  }

  // JWTs expire after ~1h; cache conservatively and let getJwt refresh early.
  cachedJwt = { token: result.jwt, expiresAt: Date.now() + 55 * 60_000 }
  return result.jwt
}

async function authedFetch(url: string, init?: RequestInit): Promise<unknown> {
  const jwt = await getJwt()
  return await rhinoFetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: jwt },
  })
}

export async function getUserQuote(params: UserQuoteParams): Promise<RhinoUserQuote> {
  return await authedFetch(`${RHINO_BRIDGE_BASE}/quote/bridge-swap/user`, {
    method: 'POST',
    body: JSON.stringify({ ...params, amountNative: '0' }),
  }) as RhinoUserQuote
}

export async function commitQuote(quoteId: string): Promise<unknown> {
  return await authedFetch(`${RHINO_BRIDGE_BASE}/quote/commit/${encodeURIComponent(quoteId)}`, {
    method: 'POST',
  })
}

/**
 * NB: `/history/bridge` requires a SECRET API key — a PUBLIC key returns 403.
 * For delivery tracking we instead poll the recipient deposit wallet's on-chain
 * USDC balance on Polygon (we control that and need no extra key). This is kept
 * for when/if a secret key is configured.
 */
export async function getBridgeStatus(bridgeId: string): Promise<RhinoBridgeStatus> {
  return await authedFetch(`${RHINO_BRIDGE_BASE}/history/bridge/${encodeURIComponent(bridgeId)}`) as RhinoBridgeStatus
}
