// FORK: Bun's SQL driver rejects any `sslmode` outside the libpq set, while the
// old postgres.js client tolerated typos. A production env value carrying
// `sslmode=requir` killed the first Bun deploy at `new SQL(...)`. Normalise
// the parameter before Bun parses it: a truncated value maps to the valid mode
// it is a prefix of, anything else unrecognised falls back to `require`.
const VALID_SSL_MODES = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'] as const

export function normalizePostgresSslMode(connectionString: string): string {
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    return connectionString
  }

  const sslmode = url.searchParams.get('sslmode')
  if (sslmode === null || (VALID_SSL_MODES as readonly string[]).includes(sslmode)) {
    return connectionString
  }

  const normalized = sslmode.trim().toLowerCase()
  const fixed = (VALID_SSL_MODES as readonly string[]).includes(normalized)
    ? normalized
    : (VALID_SSL_MODES.find((mode) => normalized.length >= 3 && mode.startsWith(normalized)) ?? 'require')
  console.warn(`[postgres-url] invalid sslmode "${sslmode}" in connection string; using "${fixed}"`)
  url.searchParams.set('sslmode', fixed)
  return url.toString()
}
