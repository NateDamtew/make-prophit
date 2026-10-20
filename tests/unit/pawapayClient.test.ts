import { describe, expect, it, mock } from 'bun:test'

import { PawaPayApiError, PawaPayClient, PawaPayConfigError } from '@/lib/pawapay/client'
import { resolvePawaPayApiUrl, resolvePawaPayEnvironment } from '@/lib/pawapay/constants'

function jsonResponse(body: unknown, status = 200) {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('PawaPayClient', () => {
  it('requires an API token', () => {
    const previous = process.env.PAWAPAY_API_TOKEN
    delete process.env.PAWAPAY_API_TOKEN
    try {
      expect(() => new PawaPayClient()).toThrow(PawaPayConfigError)
    } finally {
      if (previous !== undefined) {
        process.env.PAWAPAY_API_TOKEN = previous
      }
    }
  })

  it('sends bearer auth, JSON body and query params', async () => {
    const fetchImpl = mock(async () =>
      jsonResponse({ country: 'KEN', provider: 'MPESA_KEN', phoneNumber: '254703456789' }),
    )
    const client = new PawaPayClient({
      apiToken: 'tok',
      apiUrl: 'https://api.sandbox.pawapay.io/',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    const prediction = await client.predictProvider('+254 703 456 789')
    expect(prediction.provider).toBe('MPESA_KEN')

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.sandbox.pawapay.io/v2/predict-provider')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(init.body).toBe(JSON.stringify({ phoneNumber: '+254 703 456 789' }))

    await client.getActiveConfiguration({ country: 'KEN', operationType: 'DEPOSIT' })
    const [confUrl] = fetchImpl.mock.calls[1] as unknown as [string]
    expect(confUrl).toBe('https://api.sandbox.pawapay.io/v2/active-conf?country=KEN&operationType=DEPOSIT')
  })

  it('returns a 200 REJECTED initiation as data, not an error', async () => {
    const fetchImpl = mock(async () =>
      jsonResponse({
        depositId: 'd1',
        status: 'REJECTED',
        failureReason: { failureCode: 'AMOUNT_OUT_OF_BOUNDS', failureMessage: 'too small' },
      }),
    )
    const client = new PawaPayClient({ apiToken: 'tok', fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await client.initiateDeposit({
      depositId: 'd1',
      amount: '1',
      currency: 'KES',
      payer: { type: 'MMO', accountDetails: { phoneNumber: '254703456789', provider: 'MPESA_KEN' } },
    })
    expect(result.status).toBe('REJECTED')
    expect(result.failureReason?.failureCode).toBe('AMOUNT_OUT_OF_BOUNDS')
  })

  it('throws PawaPayApiError with the failure code on non-2xx', async () => {
    const fetchImpl = mock(async () =>
      jsonResponse(
        { status: 'REJECTED', failureReason: { failureCode: 'AUTHENTICATION_ERROR', failureMessage: 'bad token' } },
        401,
      ),
    )
    const client = new PawaPayClient({ apiToken: 'tok', fetchImpl: fetchImpl as unknown as typeof fetch })
    let caught: unknown
    try {
      await client.getPayout('p1')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(PawaPayApiError)
    expect((caught as PawaPayApiError).status).toBe(401)
    expect((caught as PawaPayApiError).failureCode).toBe('AUTHENTICATION_ERROR')
  })

  it('caches active configuration for 10 minutes and public keys for an hour', async () => {
    let now = 1_000_000
    const fetchImpl = mock(async (url: string) =>
      url.includes('public-key') ? jsonResponse([{ id: 'K:1', key: 'PEM' }]) : jsonResponse({ countries: [] }),
    )
    const client = new PawaPayClient({
      apiToken: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => now,
    })

    await client.getActiveConfiguration({ country: 'KEN' })
    await client.getActiveConfiguration({ country: 'KEN' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    now += 11 * 60_000
    await client.getActiveConfiguration({ country: 'KEN' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    await client.getPublicKeys()
    await client.getPublicKeys()
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    await client.getPublicKeys(true)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('maps wallet balances and handles empty bodies', async () => {
    const fetchImpl = mock(async (url: string) =>
      url.includes('wallet-balances')
        ? jsonResponse({ balances: [{ country: 'KEN', provider: 'MPESA_KEN', currency: 'KES', balance: '12345.5' }] })
        : new Response('', { status: 200 }),
    )
    const client = new PawaPayClient({ apiToken: 'tok', fetchImpl: fetchImpl as unknown as typeof fetch })
    const balances = await client.getWalletBalances()
    expect(balances).toHaveLength(1)
    expect(balances[0].balance).toBe('12345.5')
    expect(await client.resendDepositCallback('d1')).toBeUndefined()
    const [resendUrl, resendInit] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit]
    expect(resendUrl).toContain('/v2/deposits/resend-callback/d1')
    expect(resendInit.method).toBe('POST')
  })

  it('surfaces timeouts as PawaPayApiError with status 0', async () => {
    const fetchImpl = mock(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          )
        }),
    )
    const client = new PawaPayClient({ apiToken: 'tok', fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5 })
    let caught: unknown
    try {
      await client.getDeposit('d1')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(PawaPayApiError)
    expect((caught as PawaPayApiError).status).toBe(0)
    expect((caught as PawaPayApiError).message).toContain('timed out')
  })
})

describe('environment resolution', () => {
  it('defaults to sandbox and honours PAWAPAY_ENV / PAWAPAY_API_URL', () => {
    expect(resolvePawaPayEnvironment({})).toBe('sandbox')
    expect(resolvePawaPayEnvironment({ PAWAPAY_ENV: 'production' })).toBe('production')
    expect(resolvePawaPayApiUrl({})).toBe('https://api.sandbox.pawapay.io')
    expect(resolvePawaPayApiUrl({ PAWAPAY_ENV: 'production' })).toBe('https://api.pawapay.io')
    expect(resolvePawaPayApiUrl({ PAWAPAY_API_URL: 'https://example.test/' })).toBe('https://example.test')
  })
})
