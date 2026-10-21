import type {
  PawaPayDecimalsInAmount,
  PawaPayInitiationStatus,
  PawaPayOperationType,
  PawaPayProviderStatus,
  PawaPayTransactionStatus,
} from './constants'

/** `failureReason` object present on rejections, failures, and error responses. */
export interface PawaPayFailureReason {
  failureCode: string
  failureMessage?: string
}

/** One metadata item: arbitrary string key/value pairs plus an optional PII flag. */
export type PawaPayMetadataItem = Record<string, string | boolean | undefined> & { isPII?: boolean }

export interface PawaPayAccountDetails {
  phoneNumber: string
  provider: string
}

export interface PawaPayPartyMmo {
  type: 'MMO'
  accountDetails: PawaPayAccountDetails
}

// ─── Active configuration ────────────────────────────────────────────────────

export interface PawaPayOperationConfiguration {
  operationType: PawaPayOperationType | 'USSD_DEPOSIT' | 'PUSH_DEPOSIT' | 'NAME_LOOKUP'
  minAmount?: string
  maxAmount?: string
  decimalsInAmount?: PawaPayDecimalsInAmount
  status?: PawaPayProviderStatus
  callbackUrl?: string
  authType?: 'PROVIDER_AUTH' | 'PREAUTH' | 'REDIRECT_AUTH'
  pinPrompt?: 'AUTOMATIC' | 'MANUAL'
  pinPromptRevivable?: boolean
  pinPromptInstructions?: Record<string, string>
  authTokenInstructions?: Record<string, string>
}

export interface PawaPayCurrencyConfiguration {
  currency: string
  displayName?: string
  operationTypes: PawaPayOperationConfiguration[]
}

export interface PawaPayProviderConfiguration {
  provider: string
  displayName?: string
  nameDisplayedToCustomer?: string
  logo?: string
  currencies: PawaPayCurrencyConfiguration[]
}

export interface PawaPayCountryConfiguration {
  country: string
  displayName?: { en?: string; fr?: string }
  prefix?: string
  flag?: string
  providers: PawaPayProviderConfiguration[]
}

export interface PawaPayActiveConfiguration {
  companyName?: string
  signatureConfiguration?: {
    signedRequestsOnly?: boolean
    signedCallbacks?: boolean
  }
  countries: PawaPayCountryConfiguration[]
}

// ─── Predict provider ────────────────────────────────────────────────────────

export interface PawaPayProviderPrediction {
  country: string
  provider: string
  phoneNumber: string
}

// ─── Deposits ────────────────────────────────────────────────────────────────

export interface PawaPayDepositRequest {
  depositId: string
  amount: string
  currency: string
  payer: PawaPayPartyMmo
  clientReferenceId?: string
  customerMessage?: string
  preAuthorisationCode?: string
  metadata?: PawaPayMetadataItem[]
}

export interface PawaPayInitiationResponse {
  depositId?: string | null
  payoutId?: string | null
  status: PawaPayInitiationStatus
  created?: string
  failureReason?: PawaPayFailureReason
}

/** Shape shared by status-check `data` and callback bodies. */
export interface PawaPayTransactionRecord {
  depositId?: string
  payoutId?: string
  status: PawaPayTransactionStatus
  amount: string
  currency: string
  country?: string
  payer?: PawaPayPartyMmo
  recipient?: PawaPayPartyMmo
  customerMessage?: string
  clientReferenceId?: string
  created?: string
  providerTransactionId?: string
  failureReason?: PawaPayFailureReason
  metadata?: PawaPayMetadataItem[] | Record<string, unknown>
}

export type PawaPayStatusLookup =
  | { status: 'FOUND'; data: PawaPayTransactionRecord }
  | { status: 'NOT_FOUND'; data?: undefined }

// ─── Payouts ─────────────────────────────────────────────────────────────────

export interface PawaPayPayoutRequest {
  payoutId: string
  amount: string
  currency: string
  recipient: PawaPayPartyMmo
  clientReferenceId?: string
  customerMessage?: string
  metadata?: PawaPayMetadataItem[]
}

// ─── Toolkit ─────────────────────────────────────────────────────────────────

export interface PawaPayPublicKey {
  id: string
  /** PEM-encoded public key. */
  key: string
}

export interface PawaPayWalletBalance {
  country: string
  provider: string
  currency: string
  balance: string
}

export interface PawaPayAvailabilityResult {
  country: string
  providers: Array<{
    provider: string
    operationTypes: Array<{ operationType: string; status: PawaPayProviderStatus }>
  }>
}
