/**
 * Maps pawaPay `failureCode` values to user-facing copy and to whether the
 * failure is final. Mirrors the shape of `trading-flow-errors.ts`.
 *
 * `UNKNOWN_ERROR` is deliberately NOT final: pawaPay says to re-check the
 * status before treating such a transaction as failed.
 */

export interface PawaPayFailureInfo {
  /** Plain-English copy safe to show the customer. */
  message: string
  /** True when the money definitely did not move and the attempt can be retried. */
  final: boolean
  /** True when the user can fix it themselves (balance, limits, wrong number). */
  userActionable: boolean
}

const DEFAULT_FAILURE: PawaPayFailureInfo = {
  message: 'The payment could not be completed. Please try again in a few minutes.',
  final: true,
  userActionable: false,
}

const FAILURE_CODES: Record<string, PawaPayFailureInfo> = {
  INSUFFICIENT_BALANCE: {
    message: 'Your mobile money balance is too low for this amount.',
    final: true,
    userActionable: true,
  },
  PAYMENT_NOT_APPROVED: {
    message: 'The payment was not approved on your phone. Please try again and confirm the prompt.',
    final: true,
    userActionable: true,
  },
  PAYER_LIMIT_REACHED: {
    message: 'This payment would exceed your mobile money account limit.',
    final: true,
    userActionable: true,
  },
  PAYER_NOT_FOUND: {
    message: 'That phone number is not registered for mobile money.',
    final: true,
    userActionable: true,
  },
  RECIPIENT_NOT_FOUND: {
    message: 'That phone number is not registered for mobile money.',
    final: true,
    userActionable: true,
  },
  RECIPIENT_LIMIT_REACHED: {
    message: 'This withdrawal would exceed the limit on the receiving mobile money account.',
    final: true,
    userActionable: true,
  },
  WALLET_LIMIT_REACHED: {
    message: 'Withdrawals are temporarily unavailable. Please try again later.',
    final: true,
    userActionable: false,
  },
  TRANSACTION_ALREADY_IN_PROCESS: {
    message: 'A payment is already in progress on this phone number. Wait for it to finish, then try again.',
    final: true,
    userActionable: true,
  },
  INVALID_PHONE_NUMBER: {
    message: 'Please check the phone number and try again.',
    final: true,
    userActionable: true,
  },
  INVALID_AMOUNT: {
    message: 'That amount is not valid for this provider.',
    final: true,
    userActionable: true,
  },
  AMOUNT_OUT_OF_BOUNDS: {
    message: 'That amount is outside the allowed range for this provider.',
    final: true,
    userActionable: true,
  },
  INVALID_CURRENCY: {
    message: 'This currency is not supported for your provider.',
    final: true,
    userActionable: false,
  },
  PROVIDER_TEMPORARILY_UNAVAILABLE: {
    message: 'Your mobile money provider is temporarily unavailable. Please try again shortly.',
    final: true,
    userActionable: false,
  },
  UNSPECIFIED_FAILURE: {
    message: 'Your provider declined the payment without a reason. Please try again.',
    final: true,
    userActionable: false,
  },
  DEPOSITS_NOT_ALLOWED: {
    message: 'Deposits are not enabled yet. Please try again later.',
    final: true,
    userActionable: false,
  },
  PAYOUTS_NOT_ALLOWED: {
    message: 'Withdrawals are not enabled yet. Please try again later.',
    final: true,
    userActionable: false,
  },
  UNKNOWN_ERROR: {
    message: 'We could not confirm the payment yet. We will keep checking and update you.',
    final: false,
    userActionable: false,
  },
}

export function describePawaPayFailure(failureCode: string | null | undefined): PawaPayFailureInfo {
  if (!failureCode) {
    return DEFAULT_FAILURE
  }
  return FAILURE_CODES[failureCode.toUpperCase()] ?? DEFAULT_FAILURE
}
