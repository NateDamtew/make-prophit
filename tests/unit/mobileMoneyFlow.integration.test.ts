/**
 * Deposit + payout + callback flow against the dev database with a fake pawaPay
 * (fetch mocked). Runs ONLY with LEDGER_INTEGRATION_TESTS=1 and a non-production
 * POSTGRES_URL. From the worktree:
 *   LEDGER_INTEGRATION_TESTS=1 bun test tests/unit/mobileMoneyFlow.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { Buffer } from 'node:buffer'
import { createHash, generateKeyPairSync, sign as cryptoSign } from 'node:crypto'

const ENABLED = process.env.LEDGER_INTEGRATION_TESTS === '1' && Boolean(process.env.POSTGRES_URL)
const IS_PRODUCTION_DB = (process.env.POSTGRES_URL ?? '').includes('vsytshpanaxxqadgecap')
const KEY_ID = 'HTTP_EC_P256_KEY:1'

type Scenario = {
  depositStatus?: 'ACCEPTED' | 'REJECTED'
  payoutStatus?: 'ACCEPTED' | 'REJECTED'
  lookup?: Record<string, unknown>
}

describe.skipIf(!ENABLED || IS_PRODUCTION_DB)('mobile money flow (integration)', () => {
  let deposits: typeof import('@/lib/mobile-money/deposits')
  let payouts: typeof import('@/lib/mobile-money/payouts')
  let callbacks: typeof import('@/lib/mobile-money/callbacks')
  let intentsRepo: typeof import('@/lib/mobile-money/intents')
  let LedgerService: typeof import('@/lib/ledger/service').LedgerService
  let PawaPayClient: typeof import('@/lib/pawapay/client').PawaPayClient
  let parseMobileMoneySettings: typeof import('@/lib/mobile-money/settings').parseMobileMoneySettings
  let db: typeof import('@/lib/drizzle').db
  let users: typeof import('@/lib/db/schema/auth/tables').users
  let schema: typeof import('@/lib/db/schema/ledger/tables')
  let notifications: typeof import('@/lib/db/schema/notifications/tables').notifications
  let eq: typeof import('drizzle-orm').eq
  let inArray: typeof import('drizzle-orm').inArray

  const suffix = Date.now().toString(36)
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const ecPem = ec.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  let userId: string
  const scenario: Scenario = { depositStatus: 'ACCEPTED', payoutStatus: 'ACCEPTED' }
  const requests: Array<{ url: string; body: unknown }> = []

  function fakeFetch(url: string, init?: RequestInit): Promise<Response> {
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    requests.push({ url, body })
    function json(value: unknown, status = 200) {
      return Promise.resolve(
        new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }),
      )
    }
    if (url.includes('/v2/predict-provider')) {
      return json({ country: 'KEN', provider: 'MPESA_KEN', phoneNumber: String(body.phoneNumber).replace(/\D/g, '') })
    }
    if (url.includes('/v2/active-conf')) {
      return json({
        countries: [
          {
            country: 'KEN',
            providers: [
              {
                provider: 'MPESA_KEN',
                nameDisplayedToCustomer: 'M-Pesa',
                currencies: [
                  {
                    currency: 'KES',
                    operationTypes: [
                      {
                        operationType: 'DEPOSIT',
                        minAmount: '10',
                        maxAmount: '250000',
                        decimalsInAmount: 'NONE',
                        status: 'OPERATIONAL',
                      },
                      {
                        operationType: 'PAYOUT',
                        minAmount: '10',
                        maxAmount: '250000',
                        decimalsInAmount: 'TWO_PLACES',
                        status: 'OPERATIONAL',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })
    }
    if (url.includes('/v2/public-key/http')) {
      return json([{ id: KEY_ID, key: ecPem }])
    }
    if (url.endsWith('/v2/deposits') && init?.method === 'POST') {
      return scenario.depositStatus === 'REJECTED'
        ? json({
            depositId: body.depositId,
            status: 'REJECTED',
            failureReason: { failureCode: 'AMOUNT_OUT_OF_BOUNDS', failureMessage: 'nope' },
          })
        : json({ depositId: body.depositId, status: 'ACCEPTED', created: new Date().toISOString() })
    }
    if (url.endsWith('/v2/payouts') && init?.method === 'POST') {
      return scenario.payoutStatus === 'REJECTED'
        ? json({
            payoutId: body.payoutId,
            status: 'REJECTED',
            failureReason: { failureCode: 'RECIPIENT_NOT_FOUND', failureMessage: 'nope' },
          })
        : json({ payoutId: body.payoutId, status: 'ACCEPTED', created: new Date().toISOString() })
    }
    if (/\/v2\/(deposits|payouts)\/[0-9a-f-]{36}$/i.test(url)) {
      return json(scenario.lookup ?? { status: 'NOT_FOUND' })
    }
    return json({ error: `unexpected ${url}` }, 500)
  }

  function signedCallback(bodyObject: Record<string, unknown>): { request: Request; raw: Uint8Array } {
    const bodyText = JSON.stringify(bodyObject)
    const raw = Buffer.from(bodyText, 'utf8')
    const created = Math.floor(Date.now() / 1000)
    const params = `("@method" "@authority" "@path" "signature-date" "content-digest" "content-type");alg="ecdsa-p256-sha256";keyid="${KEY_ID}";created=${created};expires=${created + 300}`
    const signatureDate = new Date(created * 1000).toUTCString()
    const digest = `sha-256=:${createHash('sha256').update(raw).digest('base64')}:`
    const base = [
      `"@method": POST`,
      `"@authority": beta.makeprophit.com`,
      `"@path": /api/mobile-money/pawapay/callback`,
      `"signature-date": ${signatureDate}`,
      `"content-digest": ${digest}`,
      `"content-type": application/json`,
      `"@signature-params": ${params}`,
    ].join('\n')
    const signature = cryptoSign('sha256', Buffer.from(base, 'utf8'), { key: ec.privateKey, dsaEncoding: 'ieee-p1363' })
    const request = new Request('https://beta.makeprophit.com/api/mobile-money/pawapay/callback', {
      method: 'POST',
      headers: {
        host: 'beta.makeprophit.com',
        'content-type': 'application/json',
        'content-digest': digest,
        'signature-date': signatureDate,
        'signature-input': `sig-pp=${params}`,
        signature: `sig-pp=:${signature.toString('base64')}:`,
      },
      body: bodyText,
    })
    return { request, raw }
  }

  let client: InstanceType<typeof PawaPayClient>
  let settings: ReturnType<typeof parseMobileMoneySettings>

  beforeAll(async () => {
    deposits = await import('@/lib/mobile-money/deposits')
    payouts = await import('@/lib/mobile-money/payouts')
    callbacks = await import('@/lib/mobile-money/callbacks')
    intentsRepo = await import('@/lib/mobile-money/intents')
    ;({ LedgerService } = await import('@/lib/ledger/service'))
    ;({ PawaPayClient } = await import('@/lib/pawapay/client'))
    ;({ parseMobileMoneySettings } = await import('@/lib/mobile-money/settings'))
    ;({ db } = await import('@/lib/drizzle'))
    ;({ users } = await import('@/lib/db/schema/auth/tables'))
    ;({ notifications } = await import('@/lib/db/schema/notifications/tables'))
    schema = await import('@/lib/db/schema/ledger/tables')
    ;({ eq, inArray } = await import('drizzle-orm'))

    client = new PawaPayClient({
      apiToken: 'test-token',
      apiUrl: 'https://api.sandbox.pawapay.io',
      fetchImpl: fakeFetch as unknown as typeof fetch,
    })
    settings = parseMobileMoneySettings({ mobile_money: { enabled: { value: 'true' } } }, {})

    const [user] = await db
      .insert(users)
      .values({
        address: `0xmmflow${suffix}`,
        email: `mm-flow-${suffix}@example.test`,
        username: `mmflow_${suffix}`,
      } as never)
      .returning({ id: users.id })
    userId = user!.id
  })

  afterAll(async () => {
    if (!userId) {
      return
    }
    await db.execute(`ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_no_update` as never)
    try {
      const intentIds = (
        await db
          .select({ id: schema.payment_intents.id })
          .from(schema.payment_intents)
          .where(eq(schema.payment_intents.user_id, userId))
      ).map((r) => r.id)
      if (intentIds.length) {
        await db
          .delete(schema.payment_callback_events)
          .where(inArray(schema.payment_callback_events.intent_id, intentIds))
      }
      await db.delete(schema.payment_intents).where(eq(schema.payment_intents.user_id, userId))
      const accountIds = (
        await db
          .select({ id: schema.ledger_accounts.id })
          .from(schema.ledger_accounts)
          .where(eq(schema.ledger_accounts.owner_id, userId))
      ).map((r) => r.id)
      const txIds = new Set<string>()
      for (const id of accountIds) {
        for (const row of await db
          .select({ t: schema.ledger_entries.transaction_id })
          .from(schema.ledger_entries)
          .where(eq(schema.ledger_entries.account_id, id))) {
          txIds.add(row.t)
        }
      }
      if (txIds.size) {
        await db.delete(schema.ledger_entries).where(inArray(schema.ledger_entries.transaction_id, [...txIds]))
        await db.delete(schema.ledger_transactions).where(inArray(schema.ledger_transactions.id, [...txIds]))
      }
      for (const id of accountIds) {
        await db.delete(schema.ledger_reservations).where(eq(schema.ledger_reservations.account_id, id))
        await db.delete(schema.ledger_accounts).where(eq(schema.ledger_accounts.id, id))
      }
      await db.delete(schema.mobile_money_accounts).where(eq(schema.mobile_money_accounts.user_id, userId))
      await db.delete(schema.ledger_user_profiles).where(eq(schema.ledger_user_profiles.user_id, userId))
      await db.delete(notifications).where(eq(notifications.user_id, userId))
      await db.delete(users).where(eq(users.id, userId))
      // Deleting this run's entries leaves the shared house books with stale cached balances; resync them.
      for (const kind of ['float', 'fees'] as const) {
        const house = await LedgerService.getOrCreateHouseAccount(kind, 'KES')
        const check = await LedgerService.recomputeAccountBalance(house.id)
        await db
          .update(schema.ledger_accounts)
          .set({ balance: check.recomputed, reserved: check.reservedRecomputed })
          .where(eq(schema.ledger_accounts.id, house.id))
      }
    } finally {
      await db.execute(`ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_no_update` as never)
    }
  })

  it('seeds the age + terms acceptance when the profile is created (sign-up is the acceptance)', async () => {
    const profile = await LedgerService.ensureUserProfile(userId, 'KES')
    expect(profile.terms_accepted_at).toBeInstanceOf(Date)
    expect(profile.age_confirmed_at).toBeInstanceOf(Date)
    expect(profile.terms_version).toBeTruthy()
    const intents = await intentsRepo.PaymentIntentRepository.listForUser(userId, { limit: 5 })
    expect(intents).toHaveLength(0)
  })

  it('creates a pending deposit and credits the ledger exactly once from a signed callback', async () => {
    const created = await deposits.createDeposit(
      { userId, phoneInput: '+254 703 456 789', amountInput: '1000' },
      { client, settings },
    )
    expect('data' in created).toBe(true)
    if (!('data' in created)) {
      return
    }
    expect(created.data.state).toBe('pending')
    expect(created.data.currency).toBe('KES')
    const sent = requests.find((r) => r.url.endsWith('/v2/deposits'))!.body as Record<string, unknown>
    expect(sent.amount).toBe('1000')
    expect((sent.payer as { accountDetails: { phoneNumber: string } }).accountDetails.phoneNumber).toBe('254703456789')

    const intent = (await intentsRepo.PaymentIntentRepository.getById(created.data.intentId))!
    const { request, raw } = signedCallback({
      depositId: intent.provider_ref,
      status: 'COMPLETED',
      amount: '1000',
      currency: 'KES',
      country: 'KEN',
      payer: { type: 'MMO', accountDetails: { phoneNumber: '254703456789', provider: 'MPESA_KEN' } },
      providerTransactionId: 'MPESA-TX-1',
      created: new Date().toISOString(),
    })
    const outcome = await callbacks.processPawaPayCallback(request, raw, { settings, client })
    expect(outcome.status).toBe(200)
    expect(outcome.body).toMatchObject({ ok: true, matched: true, action: 'complete' })

    const balance = await LedgerService.getUserBalance(userId, 'KES')
    expect(balance.balance).toBe(100_000n)

    // Replay: same body → duplicate, no double credit.
    const replay = await callbacks.processPawaPayCallback(request, raw, { settings, client })
    expect(replay.body).toMatchObject({ ok: true, duplicate: true })
    expect((await LedgerService.getUserBalance(userId, 'KES')).balance).toBe(100_000n)

    // A second, differently-formatted callback for the same intent is ignored by the state machine.
    const again = signedCallback({
      depositId: intent.provider_ref,
      status: 'COMPLETED',
      amount: '1000',
      currency: 'KES',
      country: 'KEN',
      created: new Date().toISOString(),
      note: 'x',
    })
    const ignored = await callbacks.processPawaPayCallback(again.request, again.raw, { settings, client })
    expect(ignored.body).toMatchObject({ ok: true, matched: true, action: 'ignore' })
    expect((await LedgerService.getUserBalance(userId, 'KES')).balance).toBe(100_000n)

    const refreshed = (await intentsRepo.PaymentIntentRepository.getById(intent.id))!
    expect(refreshed.state).toBe('completed')
    expect(refreshed.provider_transaction_id).toBe('MPESA-TX-1')
    expect(refreshed.callback_count).toBe(2)
    const saved = await intentsRepo.MobileMoneyAccountRepository.listForUser(userId)
    expect(saved[0]?.verified_at).not.toBeNull()
  })

  it('rejects unsigned and badly signed callbacks', async () => {
    const unsigned = new Request('https://beta.makeprophit.com/api/mobile-money/pawapay/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'beta.makeprophit.com' },
      body: '{"depositId":"00000000-0000-4000-8000-000000000000","status":"COMPLETED"}',
    })
    const raw = new Uint8Array(await unsigned.clone().arrayBuffer())
    const outcome = await callbacks.processPawaPayCallback(unsigned, raw, { settings, client })
    expect(outcome.status).toBe(401)

    const tampered = signedCallback({ depositId: '00000000-0000-4000-8000-000000000000', status: 'COMPLETED' })
    const tamperedRaw = Buffer.from('{"depositId":"00000000-0000-4000-8000-000000000000","status":"FAILED"}')
    const bad = await callbacks.processPawaPayCallback(tampered.request, tamperedRaw, { settings, client })
    expect(bad.status).toBe(401)
  })

  it('accepts unsigned callbacks only when explicitly allowed, and records unmatched ones', async () => {
    const permissive = { ...settings, allowUnsignedCallbacks: true }
    const unsigned = new Request('https://beta.makeprophit.com/api/mobile-money/pawapay/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'beta.makeprophit.com' },
      body: JSON.stringify({ depositId: '11111111-1111-4111-8111-111111111111', status: 'COMPLETED', marker: suffix }),
    })
    const raw = new Uint8Array(await unsigned.clone().arrayBuffer())
    const outcome = await callbacks.processPawaPayCallback(unsigned, raw, { settings: permissive, client })
    expect(outcome.status).toBe(200)
    expect(outcome.body).toMatchObject({ ok: true, matched: false })
  })

  it('marks a REJECTED deposit immediately and a FAILED status check as failed', async () => {
    scenario.depositStatus = 'REJECTED'
    const rejected = await deposits.createDeposit(
      { userId, phoneInput: '254703456789', amountInput: '2000' },
      { client, settings },
    )
    scenario.depositStatus = 'ACCEPTED'
    expect('data' in rejected && rejected.data.state).toBe('rejected')
    if ('data' in rejected) {
      expect(rejected.data.failure?.code).toBe('AMOUNT_OUT_OF_BOUNDS')
    }

    const pending = await deposits.createDeposit(
      { userId, phoneInput: '254703456049', amountInput: '500' },
      { client, settings },
    )
    if (!('data' in pending)) {
      throw new Error('expected data')
    }
    const intent = (await intentsRepo.PaymentIntentRepository.getById(pending.data.intentId))!
    scenario.lookup = {
      status: 'FOUND',
      data: {
        depositId: intent.provider_ref,
        status: 'FAILED',
        amount: '500',
        currency: 'KES',
        failureReason: { failureCode: 'INSUFFICIENT_BALANCE', failureMessage: 'low' },
      },
    }
    const result = await deposits.refreshDepositStatus(intent, { client, settings })
    scenario.lookup = undefined
    expect(result?.action).toBe('fail')
    expect((await intentsRepo.PaymentIntentRepository.getById(intent.id))?.failure_code).toBe('INSUFFICIENT_BALANCE')
    expect((await LedgerService.getUserBalance(userId, 'KES')).balance).toBe(100_000n)
  })

  it('reserves on payout creation, settles on COMPLETED with the fee, and releases on FAILED', async () => {
    const fees = await LedgerService.getOrCreateHouseAccount('fees', 'KES')
    const float = await LedgerService.getOrCreateHouseAccount('float', 'KES')
    const feesBefore = await LedgerService.recomputeAccountBalance(fees.id)
    const floatBefore = await LedgerService.recomputeAccountBalance(float.id)
    const created = await payouts.createPayout(
      { userId, phoneInput: '254703456789', amountInput: '300' },
      { client, settings },
    )
    if (!('data' in created)) {
      throw new Error(`payout failed: ${created.error}`)
    }
    expect(created.data.state).toBe('pending')
    expect(created.data.feeMinor).toBe('2500')
    expect(created.data.netMinor).toBe('27500')
    let balance = await LedgerService.getUserBalance(userId, 'KES')
    expect(balance.reserved).toBe(30_000n)
    expect(balance.available).toBe(70_000n)
    const sent = requests.filter((r) => r.url.endsWith('/v2/payouts')).at(-1)!.body as Record<string, unknown>
    expect(sent.amount).toBe('275')

    const intent = (await intentsRepo.PaymentIntentRepository.getById(created.data.intentId))!
    const completed = await payouts.applyPayoutStatus(
      intent.id,
      { status: 'COMPLETED', providerTransactionId: 'MPESA-OUT-1' },
      'callback',
    )
    expect(completed?.action).toBe('complete')
    balance = await LedgerService.getUserBalance(userId, 'KES')
    expect(balance).toMatchObject({ balance: 70_000n, reserved: 0n, available: 70_000n })

    // House books are shared across runs, so compare deltas: cached and recomputed must move together.
    const feesAfter = await LedgerService.recomputeAccountBalance(fees.id)
    const floatAfter = await LedgerService.recomputeAccountBalance(float.id)
    expect(feesAfter.cached - feesBefore.cached).toBe(2_500n)
    expect(feesAfter.recomputed - feesBefore.recomputed).toBe(2_500n)
    expect(floatAfter.cached - floatBefore.cached).toBe(-27_500n)
    expect(floatAfter.recomputed - floatBefore.recomputed).toBe(-27_500n)

    // Second payout fails at the provider → hold released.
    const second = await payouts.createPayout(
      { userId, phoneInput: '254703456789', amountInput: '200' },
      { client, settings },
    )
    if (!('data' in second)) {
      throw new Error(`payout failed: ${second.error}`)
    }
    expect((await LedgerService.getUserBalance(userId, 'KES')).reserved).toBe(20_000n)
    const failed = await payouts.applyPayoutStatus(
      second.data.intentId,
      { status: 'FAILED', failureReason: { failureCode: 'RECIPIENT_NOT_FOUND' } },
      'callback',
    )
    expect(failed?.action).toBe('fail')
    expect(await LedgerService.getUserBalance(userId, 'KES')).toMatchObject({
      balance: 70_000n,
      reserved: 0n,
      available: 70_000n,
    })

    // Rejected at initiation → hold released immediately.
    scenario.payoutStatus = 'REJECTED'
    const rejected = await payouts.createPayout(
      { userId, phoneInput: '254703456789', amountInput: '200' },
      { client, settings },
    )
    scenario.payoutStatus = 'ACCEPTED'
    expect('data' in rejected && rejected.data.state).toBe('rejected')
    expect((await LedgerService.getUserBalance(userId, 'KES')).reserved).toBe(0n)

    // Cannot withdraw more than available.
    const tooMuch = await payouts.createPayout(
      { userId, phoneInput: '254703456789', amountInput: '700.01' },
      { client, settings },
    )
    expect('error' in tooMuch && tooMuch.code).toBe('insufficient_funds')

    const notes = await db.select().from(notifications).where(eq(notifications.user_id, userId))
    expect(notes.every((n) => n.category === 'general')).toBe(true)
    expect(notes.map((n) => (n.metadata as { kind?: string }).kind).sort()).toEqual(
      [
        'mobile_money_deposit_completed',
        'mobile_money_deposit_failed',
        'mobile_money_payout_completed',
        'mobile_money_payout_failed',
      ].sort(),
    )
  })
})
