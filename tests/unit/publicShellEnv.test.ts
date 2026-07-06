import { describe, expect, it } from 'vitest'
import {
  hasPublicShellPrerenderEnv,
  resolvePublicShellPrerenderMode,
} from '@/lib/public-shell-env'

describe('public shell env detection', () => {
  // FORK OVERRIDE: env detection stays truthful, but the fork defaults the mode
  // OFF (our client-only Dynamic tree can't be statically prerendered). Complete
  // env alone no longer auto-enables it — an explicit opt-in is required.
  it('detects complete build-time public shell env but keeps the fork mode off', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      POSTGRES_URL: 'postgres://user:pass@localhost:5432/app',
      REOWN_APPKIT_PROJECT_ID: 'project-id',
      SITE_URL: 'https://markets.example.com',
    }

    expect(hasPublicShellPrerenderEnv(env)).toBe(true)
    expect(resolvePublicShellPrerenderMode(env)).toBe(false)
  })

  it('accepts VERCEL_PROJECT_PRODUCTION_URL instead of SITE_URL', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      POSTGRES_URL: 'postgres://user:pass@localhost:5432/app',
      REOWN_APPKIT_PROJECT_ID: 'project-id',
      VERCEL_PROJECT_PRODUCTION_URL: 'markets.example.com',
    }

    expect(hasPublicShellPrerenderEnv(env)).toBe(true)
    expect(resolvePublicShellPrerenderMode(env)).toBe(false)
  })

  it('disables prerendering when the database is unavailable at build time', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      REOWN_APPKIT_PROJECT_ID: 'project-id',
      SITE_URL: 'https://markets.example.com',
    }

    expect(hasPublicShellPrerenderEnv(env)).toBe(false)
    expect(resolvePublicShellPrerenderMode(env)).toBe(false)
  })

  it('lets an explicit override force the build mode', () => {
    expect(resolvePublicShellPrerenderMode({
      NODE_ENV: 'test',
      BUILD_PRERENDER_PUBLIC_SHELL: 'false',
      POSTGRES_URL: 'postgres://user:pass@localhost:5432/app',
      REOWN_APPKIT_PROJECT_ID: 'project-id',
      SITE_URL: 'https://markets.example.com',
    })).toBe(false)

    expect(resolvePublicShellPrerenderMode({
      NODE_ENV: 'test',
      BUILD_PRERENDER_PUBLIC_SHELL: 'true',
    })).toBe(true)
  })
})
