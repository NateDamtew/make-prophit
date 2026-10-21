import { NextResponse } from 'next/server'

import { getMobileMoneySettings } from '@/lib/mobile-money/settings'
import { isPawaPayConfigured } from '@/lib/pawapay/client'

/**
 * Public, non-secret description of the mobile-money rail for the client:
 * whether it is on and the per-currency limits/fees to show in the UI.
 */
export async function GET() {
  try {
    const settings = await getMobileMoneySettings()
    const enabled = settings.enabled && isPawaPayConfigured()
    return NextResponse.json(
      {
        enabled,
        currencies: settings.enabledCurrencies.map((currency) => {
          const config = settings.currencies[currency]!
          return {
            currency,
            country: config.country,
            withdrawalFeeMinor: config.withdrawalFeeMinor.toString(),
            minDepositMinor: config.minDepositMinor.toString(),
            maxDepositMinor: config.maxDepositMinor.toString(),
            minPayoutMinor: config.minPayoutMinor.toString(),
            maxPayoutMinor: config.maxPayoutMinor.toString(),
            depositsPaused: config.depositsPaused,
            payoutsPaused: config.payoutsPaused,
          }
        }),
      },
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    )
  } catch {
    return NextResponse.json({ enabled: false, currencies: [] }, { status: 200 })
  }
}
