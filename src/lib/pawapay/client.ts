import type { PawaPayOperationType } from './constants'
import type {
  PawaPayActiveConfiguration,
  PawaPayAvailabilityResult,
  PawaPayDepositRequest,
  PawaPayInitiationResponse,
  PawaPayPayoutRequest,
  PawaPayProviderPrediction,
  PawaPayPublicKey,
  PawaPayStatusLookup,
  PawaPayWalletBalance,
} from './types'

import {
  PAWAPAY_ACTIVE_CONFIGURATION_TTL_MS,
  PAWAPAY_ENV_VARS,
  PAWAPAY_PUBLIC_KEYS_TTL_MS,
  PAWAPAY_REQUEST_TIMEOUT_MS,
  resolvePawaPayApiUrl,
} from './constants'

export class PawaPayApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
    public readonly failureCode?: string,
  ) {
    super(message)
    this.name = 'PawaPayApiError'
  }
}

export class PawaPayConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PawaPayConfigError'
  }
}

export interface PawaPayClientOptions {
  apiUrl?: string
  apiToken?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  now?: () => number
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

function extractFailureCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { failureReason?: { failureCode?: string } }
    return parsed?.failureReason?.failureCode
  } catch {
    return undefined
  }
}

/**
 * Thin typed wrapper over pawaPay v2. One instance per process is fine; the
 * active-configuration and public-key lookups are cached in memory.
 */
export class PawaPayClient {
  private readonly apiUrl: string
  private readonly apiToken: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly now: () => number
  private activeConfigurationCache = new Map<string, CacheEntry<PawaPayActiveConfiguration>>()
  private publicKeysCache: CacheEntry<PawaPayPublicKey[]> | null = null

  constructor(options: PawaPayClientOptions = {}) {
    const token = options.apiToken ?? process.env[PAWAPAY_ENV_VARS.apiToken]?.trim()
    if (!token) {
      throw new PawaPayConfigError(`${PAWAPAY_ENV_VARS.apiToken} is not configured`)
    }
    this.apiToken = token
    this.apiUrl = (options.apiUrl ?? resolvePawaPayApiUrl()).replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? PAWAPAY_REQUEST_TIMEOUT_MS
    this.now = options.now ?? Date.now
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
  ): Promise<T> {
    const url = new URL(`${this.apiUrl}${path}`)
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value)
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchImpl(url.toString(), {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      })
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError' ? 'pawaPay request timed out' : 'pawaPay request failed'
      throw new PawaPayApiError(message, 0, error instanceof Error ? error.message : String(error))
    } finally {
      clearTimeout(timer)
    }

    const text = await response.text()
    if (!response.ok) {
      throw new PawaPayApiError(
        `pawaPay ${init.method ?? 'GET'} ${path} failed (${response.status})`,
        response.status,
        text,
        extractFailureCode(text),
      )
    }
    if (!text) {
      return undefined as T
    }
    try {
      return JSON.parse(text) as T
    } catch {
      throw new PawaPayApiError(`pawaPay ${path} returned invalid JSON`, response.status, text)
    }
  }

  // ─── Toolkit ───────────────────────────────────────────────────────────────

  async getActiveConfiguration(
    params: { country?: string; operationType?: PawaPayOperationType; forceRefresh?: boolean } = {},
  ): Promise<PawaPayActiveConfiguration> {
    const cacheKey = `${params.country ?? '*'}:${params.operationType ?? '*'}`
    const cached = this.activeConfigurationCache.get(cacheKey)
    if (cached && !params.forceRefresh && cached.expiresAt > this.now()) {
      return cached.value
    }
    const value = await this.request<PawaPayActiveConfiguration>('/v2/active-conf', {
      query: { country: params.country, operationType: params.operationType },
    })
    this.activeConfigurationCache.set(cacheKey, { value, expiresAt: this.now() + PAWAPAY_ACTIVE_CONFIGURATION_TTL_MS })
    return value
  }

  async predictProvider(phoneNumber: string): Promise<PawaPayProviderPrediction> {
    return this.request<PawaPayProviderPrediction>('/v2/predict-provider', { method: 'POST', body: { phoneNumber } })
  }

  async getAvailability(
    params: { country?: string; operationType?: PawaPayOperationType } = {},
  ): Promise<PawaPayAvailabilityResult[]> {
    return this.request<PawaPayAvailabilityResult[]>('/v2/availability', {
      query: { country: params.country, operationType: params.operationType },
    })
  }

  async getWalletBalances(): Promise<PawaPayWalletBalance[]> {
    const result = await this.request<{ balances?: PawaPayWalletBalance[] }>('/v2/wallet-balances')
    return result?.balances ?? []
  }

  async getPublicKeys(forceRefresh = false): Promise<PawaPayPublicKey[]> {
    if (this.publicKeysCache && !forceRefresh && this.publicKeysCache.expiresAt > this.now()) {
      return this.publicKeysCache.value
    }
    const value = await this.request<PawaPayPublicKey[]>('/v2/public-key/http')
    this.publicKeysCache = { value, expiresAt: this.now() + PAWAPAY_PUBLIC_KEYS_TTL_MS }
    return value
  }

  // ─── Deposits ──────────────────────────────────────────────────────────────

  async initiateDeposit(request: PawaPayDepositRequest): Promise<PawaPayInitiationResponse> {
    return this.request<PawaPayInitiationResponse>('/v2/deposits', { method: 'POST', body: request })
  }

  async getDeposit(depositId: string): Promise<PawaPayStatusLookup> {
    return this.request<PawaPayStatusLookup>(`/v2/deposits/${encodeURIComponent(depositId)}`)
  }

  async resendDepositCallback(depositId: string): Promise<unknown> {
    return this.request(`/v2/deposits/resend-callback/${encodeURIComponent(depositId)}`, { method: 'POST' })
  }

  // ─── Payouts ───────────────────────────────────────────────────────────────

  async initiatePayout(request: PawaPayPayoutRequest): Promise<PawaPayInitiationResponse> {
    return this.request<PawaPayInitiationResponse>('/v2/payouts', { method: 'POST', body: request })
  }

  async getPayout(payoutId: string): Promise<PawaPayStatusLookup> {
    return this.request<PawaPayStatusLookup>(`/v2/payouts/${encodeURIComponent(payoutId)}`)
  }

  async failEnqueuedPayout(payoutId: string): Promise<unknown> {
    return this.request(`/v2/payouts/fail-enqueued/${encodeURIComponent(payoutId)}`, { method: 'POST' })
  }

  async resendPayoutCallback(payoutId: string): Promise<unknown> {
    return this.request(`/v2/payouts/resend-callback/${encodeURIComponent(payoutId)}`, { method: 'POST' })
  }
}

let sharedClient: PawaPayClient | null = null

/** Process-wide client built from env. Throws PawaPayConfigError when the token is missing. */
export function getPawaPayClient(): PawaPayClient {
  sharedClient ??= new PawaPayClient()
  return sharedClient
}

export function isPawaPayConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[PAWAPAY_ENV_VARS.apiToken]?.trim())
}
