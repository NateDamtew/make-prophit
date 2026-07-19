import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hasPublicShellPrerenderEnv,
  resolvePublicShellPrerenderMode,
} from '@/lib/public-shell-env'
import { deferPublicShellPrerenderIfNeeded } from '@/lib/public-shell-rendering'

const mocks = vi.hoisted(() => ({
  io: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/cache', () => ({
  io: mocks.io,
}))

beforeEach(() => {
  mocks.io.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('public shell env detection', () => {
  // FORK OVERRIDE: env detection stays truthful, but the fork defaults the mode
  // OFF (our client-only Dynamic tree can't be statically prerendered). Complete
  // env alone no longer auto-enables it — an explicit opt-in is required.
  it('detects complete build-time public shell env but keeps the fork mode off', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      NEXT_PHASE: 'phase-production-build',
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
      NEXT_PHASE: 'phase-production-build',
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

  it('does not infer prerendering from runtime-only env', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-server',
      POSTGRES_URL: 'postgres://user:pass@localhost:5432/app',
      REOWN_APPKIT_PROJECT_ID: 'project-id',
      SITE_URL: 'https://markets.example.com',
    }

    expect(hasPublicShellPrerenderEnv(env)).toBe(true)
    expect(resolvePublicShellPrerenderMode(env)).toBe(false)
  })

  it('lets an explicit override force the build mode', () => {
    expect(resolvePublicShellPrerenderMode({
      NODE_ENV: 'test',
      NEXT_PHASE: 'phase-production-build',
      BUILD_PRERENDER_PUBLIC_SHELL: 'false',
      POSTGRES_URL: 'postgres://user:pass@localhost:5432/app',
      REOWN_APPKIT_PROJECT_ID: 'project-id',
      SITE_URL: 'https://markets.example.com',
    })).toBe(false)

    expect(resolvePublicShellPrerenderMode({
      NODE_ENV: 'test',
      NEXT_PHASE: 'phase-production-server',
      BUILD_PRERENDER_PUBLIC_SHELL: 'true',
    })).toBe(true)
  })

  it('prerenders when Vercel build-time env is complete', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')
    vi.stubEnv('POSTGRES_URL', 'postgres://user:pass@localhost:5432/app')
    vi.stubEnv('REOWN_APPKIT_PROJECT_ID', 'project-id')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'markets.example.com')

    await deferPublicShellPrerenderIfNeeded()

    expect(mocks.io).not.toHaveBeenCalled()
  })

  it('defers runtime data when Docker build-time env is unavailable', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')
    vi.stubEnv('POSTGRES_URL', '')
    vi.stubEnv('REOWN_APPKIT_PROJECT_ID', '')
    vi.stubEnv('SITE_URL', '')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')

    await deferPublicShellPrerenderIfNeeded()

    expect(mocks.io).toHaveBeenCalledOnce()
  })

  it('uses runtime data after an env-less Docker build', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-server')
    vi.stubEnv('POSTGRES_URL', 'postgres://user:pass@localhost:5432/app')
    vi.stubEnv('REOWN_APPKIT_PROJECT_ID', 'project-id')
    vi.stubEnv('SITE_URL', 'https://markets.example.com')

    await deferPublicShellPrerenderIfNeeded()

    expect(mocks.io).toHaveBeenCalledOnce()
  })
})
