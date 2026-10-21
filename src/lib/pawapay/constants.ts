/**
 * pawaPay v2 API — identifiers verified against docs.pawapay.io on 2026-10-20.
 *
 * We talk to the REST API directly with a thin typed client (no SDK), mirroring
 * the rhino client. The API token is a server-only env var; nothing in here is
 * imported by client components.
 */

export const PAWAPAY_SANDBOX_API_URL = 'https://api.sandbox.pawapay.io'
export const PAWAPAY_PRODUCTION_API_URL = 'https://api.pawapay.io'

/** Env var names (server-only). */
export const PAWAPAY_ENV_VARS = {
  apiToken: 'PAWAPAY_API_TOKEN',
  environment: 'PAWAPAY_ENV',
  apiUrl: 'PAWAPAY_API_URL',
  allowUnsignedCallbacks: 'PAWAPAY_ALLOW_UNSIGNED_CALLBACKS',
} as const

export type PawaPayEnvironment = 'sandbox' | 'production'

export const PAWAPAY_REQUEST_TIMEOUT_MS = 20_000
export const PAWAPAY_ACTIVE_CONFIGURATION_TTL_MS = 10 * 60_000
export const PAWAPAY_PUBLIC_KEYS_TTL_MS = 60 * 60_000

/** Amount string pattern enforced by pawaPay (no trailing zeros, up to 3 decimals, no leading zeros). */
export const PAWAPAY_AMOUNT_PATTERN = /^(0|[1-9]\d{0,17})(\.\d{0,3}[1-9])?$/

/** `customerMessage` constraints: 4–22 chars, alphanumerics and spaces only. */
export const PAWAPAY_CUSTOMER_MESSAGE_PATTERN = /^[a-z\d ]{4,22}$/i

/** MSISDN: digits only, country code included, no leading zero. */
export const PAWAPAY_MSISDN_PATTERN = /^[1-9]\d{7,14}$/

export const PAWAPAY_OPERATION_TYPES = ['DEPOSIT', 'PAYOUT', 'REFUND', 'REMITTANCE'] as const
export type PawaPayOperationType = (typeof PAWAPAY_OPERATION_TYPES)[number]

export const PAWAPAY_PROVIDER_STATUSES = ['OPERATIONAL', 'DELAYED', 'CLOSED'] as const
export type PawaPayProviderStatus = (typeof PAWAPAY_PROVIDER_STATUSES)[number]

export const PAWAPAY_DECIMALS = ['NONE', 'TWO_PLACES'] as const
export type PawaPayDecimalsInAmount = (typeof PAWAPAY_DECIMALS)[number]

/** Immediate response to an initiation. */
export const PAWAPAY_INITIATION_STATUSES = ['ACCEPTED', 'REJECTED', 'DUPLICATE_IGNORED'] as const
export type PawaPayInitiationStatus = (typeof PAWAPAY_INITIATION_STATUSES)[number]

/** Lifecycle statuses reported by status checks and callbacks. */
export const PAWAPAY_TRANSACTION_STATUSES = [
  'ACCEPTED',
  'ENQUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'IN_RECONCILIATION',
] as const
export type PawaPayTransactionStatus = (typeof PAWAPAY_TRANSACTION_STATUSES)[number]

export const PAWAPAY_FINAL_STATUSES: ReadonlySet<PawaPayTransactionStatus> = new Set(['COMPLETED', 'FAILED'])

/**
 * Sandbox-only test MSISDNs for Kenya (MPESA_KEN), from docs.pawapay.io/v2/docs/test_numbers.
 * Kept here so tests and the admin integrations card can reference them; they do nothing in production.
 */
export const PAWAPAY_SANDBOX_TEST_NUMBERS_KEN = {
  deposit: {
    completed: '254703456789',
    submitted: '254703456129',
    payerLimitReached: '254703456019',
    paymentNotApproved: '254703456039',
    insufficientBalance: '254703456049',
    transactionAlreadyInProcess: '254703456059',
    unspecifiedFailure: '254703456069',
  },
  payout: {
    completed: '254703456789',
    submitted: '254703456129',
    recipientNotFound: '254703456089',
    walletLimitReached: '254703456099',
    recipientLimitReached: '254703456109',
    unspecifiedFailure: '254703456119',
  },
} as const

export function resolvePawaPayEnvironment(env: NodeJS.ProcessEnv = process.env): PawaPayEnvironment {
  return env[PAWAPAY_ENV_VARS.environment]?.trim().toLowerCase() === 'production' ? 'production' : 'sandbox'
}

export function resolvePawaPayApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[PAWAPAY_ENV_VARS.apiUrl]?.trim()
  if (override) {
    return override.replace(/\/+$/, '')
  }
  return resolvePawaPayEnvironment(env) === 'production' ? PAWAPAY_PRODUCTION_API_URL : PAWAPAY_SANDBOX_API_URL
}
