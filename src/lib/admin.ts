function parseAdminWalletsEnv(value: string): string[] {
  const trimmed = value.trim()

  if (!trimmed) {
    return []
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.map(item => String(item).toLowerCase())
    }
  }
  catch {
    //
  }

  return trimmed
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
}

let cachedAdminWallets: string[] | null = null
let cachedAdminEmails: string[] | null = null

function getAdminWallets(): string[] {
  if (cachedAdminWallets) {
    return cachedAdminWallets
  }

  const envValue = process.env.ADMIN_WALLETS
  if (!envValue) {
    cachedAdminWallets = []
    return cachedAdminWallets
  }

  cachedAdminWallets = parseAdminWalletsEnv(envValue)
  return cachedAdminWallets
}

function getAdminEmails(): string[] {
  if (cachedAdminEmails) {
    return cachedAdminEmails
  }

  const envValue = process.env.ADMIN_EMAILS
  if (!envValue) {
    cachedAdminEmails = ['nathandamtew@gmail.com']
    return cachedAdminEmails
  }

  cachedAdminEmails = parseAdminWalletsEnv(envValue)
  return cachedAdminEmails
}

function getAdminUsernames(): string[] {
  return ['natedamtew']
}

export function isAdminWallet(addressOrEmail?: string | null): boolean {
  if (!addressOrEmail) {
    return false
  }

  const normalized = addressOrEmail.toLowerCase()
  if (normalized.includes('@')) {
    return getAdminEmails().includes(normalized)
  }

  return getAdminWallets().includes(normalized) || getAdminUsernames().includes(normalized)
}
