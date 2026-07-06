function hasNonEmptyEnvValue(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}

function parseBooleanEnv(value: string | undefined) {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }

  return null
}

function hasBuildSiteUrlEnv(env: NodeJS.ProcessEnv) {
  return hasNonEmptyEnvValue(env.SITE_URL)
    || hasNonEmptyEnvValue(env.VERCEL_PROJECT_PRODUCTION_URL)
}

export function hasPublicShellPrerenderEnv(env: NodeJS.ProcessEnv) {
  return hasBuildSiteUrlEnv(env)
    && hasNonEmptyEnvValue(env.POSTGRES_URL)
    && hasNonEmptyEnvValue(env.REOWN_APPKIT_PROJECT_ID)
}

export function resolvePublicShellPrerenderMode(env: NodeJS.ProcessEnv) {
  const explicitMode = parseBooleanEnv(env.BUILD_PRERENDER_PUBLIC_SHELL)
  // FORK OVERRIDE: default OFF (upstream auto-enables when SITE_URL +
  // POSTGRES_URL + REOWN_APPKIT_PROJECT_ID are all present, which our prod is).
  // The home content added in the Jul-2026 sync (featured-markets carousel, hot
  // topics, featured news) isn't static-prerender-safe inside our client-only
  // Dynamic.xyz provider tree (AppKitProvider mounts Dynamic only after
  // hydration because cacheComponents streaming hydration crashes its widgets),
  // so baking the public shell fails `next build` with a prerender-error on
  // /[locale]. Defaulting off routes every deferPublicShellPrerenderIfNeeded()
  // caller through connection() → runtime rendering, where those data fetches
  // are legal. Re-enable explicitly with BUILD_PRERENDER_PUBLIC_SHELL=true if
  // the home tree is ever made prerender-safe.
  return explicitMode ?? false
}
