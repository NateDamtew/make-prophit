/**
 * Platform admins are the wallets in ADMIN_WALLETS, and a user is an admin only
 * when one of those wallets is linked to their account through Sign-In With
 * Ethereum (the `wallets` table, written only after a signature check).
 *
 * Nothing a user can edit grants admin: not `users.address` (better-auth's
 * `name`), not the email (saved unverified from Settings) and not the username.
 * Matching those let any account make itself an admin.
 */

function parseAdminWalletsEnv(value: string): string[] {
  const trimmed = value.trim()

  if (!trimmed) {
    return []
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
    }
  } catch {
    //
  }

  return trimmed
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export function getAdminWallets(): string[] {
  return parseAdminWalletsEnv(process.env.ADMIN_WALLETS ?? '')
}

/** Whether `address` is one of the ADMIN_WALLETS. Says nothing about who controls it; see admin-users.ts. */
export function isAdminWallet(address?: string | null): boolean {
  if (!address) {
    return false
  }

  return getAdminWallets().includes(address.trim().toLowerCase())
}
