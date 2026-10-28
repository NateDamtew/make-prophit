import { and, eq, sql } from 'drizzle-orm'

import { getAdminWallets } from '@/lib/admin'
import { wallets } from '@/lib/db/schema/auth/tables'
import { db } from '@/lib/drizzle'

function adminWalletCondition(adminWallets: string[]) {
  return sql`LOWER(${wallets.address}) IN (${sql.join(
    adminWallets.map((wallet) => sql`${wallet}`),
    sql`, `,
  )})`
}

/** Whether the user has signed in with one of the ADMIN_WALLETS (SIWE-verified `wallets` rows only). */
export async function isAdminUser(userId: string | null | undefined): Promise<boolean> {
  const adminWallets = getAdminWallets()
  if (!userId || adminWallets.length === 0) {
    return false
  }

  const rows = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.user_id, userId), adminWalletCondition(adminWallets)))
    .limit(1)

  return rows.length > 0
}

/** Ids of every user who has signed in with one of the ADMIN_WALLETS, for admin notifications. */
export async function listAdminUserIds(): Promise<string[]> {
  const adminWallets = getAdminWallets()
  if (adminWallets.length === 0) {
    return []
  }

  const rows = await db
    .selectDistinct({ userId: wallets.user_id })
    .from(wallets)
    .where(adminWalletCondition(adminWallets))

  return rows.map((row) => row.userId)
}
