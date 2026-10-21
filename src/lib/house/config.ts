import { eq } from 'drizzle-orm'

import { users } from '@/lib/db/schema/auth/tables'
import { db } from '@/lib/drizzle'

/**
 * The house account: one Kuest trading account (deposit wallet + CLOB
 * credentials stored like any user's) whose EOA key the server holds so it
 * can sign orders on behalf of ledger users.
 *
 * Env:
 *   HOUSE_USER_ID             users.id of the house account (must have a deployed
 *                             deposit wallet, token approvals and trading auth)
 *   HOUSE_SIGNER_PRIVATE_KEY  0x-prefixed private key of that account's EOA
 */

export const HOUSE_ENV = {
  userId: 'HOUSE_USER_ID',
  signerKey: 'HOUSE_SIGNER_PRIVATE_KEY',
} as const

export interface HouseAccount {
  userId: string
  address: `0x${string}`
  depositWalletAddress: `0x${string}`
  referredByUserId: string | null
}

export function isHouseTradingConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[HOUSE_ENV.userId]?.trim() && /^0x[0-9a-fA-F]{64}$/.test(env[HOUSE_ENV.signerKey]?.trim() ?? ''))
}

export function getHouseSignerKey(env: NodeJS.ProcessEnv = process.env): `0x${string}` | null {
  const key = env[HOUSE_ENV.signerKey]?.trim()
  return key && /^0x[0-9a-fA-F]{64}$/.test(key) ? (key as `0x${string}`) : null
}

export async function getHouseAccount(env: NodeJS.ProcessEnv = process.env): Promise<HouseAccount | null> {
  const userId = env[HOUSE_ENV.userId]?.trim()
  if (!userId) {
    return null
  }
  const [row] = await db
    .select({
      id: users.id,
      address: users.address,
      deposit_wallet_address: users.deposit_wallet_address,
      referred_by_user_id: users.referred_by_user_id,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!row?.address || !row.deposit_wallet_address) {
    return null
  }
  return {
    userId: row.id,
    address: row.address as `0x${string}`,
    depositWalletAddress: row.deposit_wallet_address as `0x${string}`,
    referredByUserId: row.referred_by_user_id ?? null,
  }
}
