/**
 * Local-currency ramp: shillings (or other mobile money) <-> USDC in the
 * user's own Polymarket wallet. The provider is not chosen yet (see
 * RAMP-LANDSCAPE.md); until one is configured for a country, no ramp exists
 * and the fiat funding/withdrawal options stay hidden.
 */

export interface RampQuote {
  fiatAmount: number
  fiatCurrency: string
  usdcAmount: number
  feeFiat: number
  expiresAt: string
}

export interface Ramp {
  id: string
  /** Mobile-money / bank channels this ramp serves in a country (e.g. M-Pesa). */
  channels: string[]
  quote(input: { country: string; fiatCurrency: string; fiatAmount: number }): Promise<RampQuote>
  /** Collect fiat and deliver USDC to a Polymarket Bridge deposit address. */
  fiatToUsdc(input: { quote: RampQuote; phone: string; depositAddress: string }): Promise<{ reference: string }>
  /** Pay fiat out after the user sends USDC to the ramp's address. */
  usdcToFiat(input: { usdcAmount: number; phone: string }): Promise<{ reference: string; payInAddress: string }>
  status(reference: string): Promise<'pending' | 'completed' | 'failed'>
}

/** The ramp serving a country, or null while none is configured (today: always null). */
export function getRampForCountry(_country: string | null): Ramp | null {
  return null
}
