import { beforeAll, describe, expect, it, mock } from 'bun:test'

import { hoisted } from '../bun-test-helpers'

const mocks = hoisted(() => ({
  captureRouterTransitionStart: mock(),
  init: mock(),
}))

void mock.module('@sentry/nextjs', () => mocks)

async function waitForSentryInit() {
  for (let attempt = 0; attempt < 50 && mocks.init.mock.calls.length === 0; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('client instrumentation', () => {
  let options: any

  beforeAll(async () => {
    // Sentry only loads when a DSN is configured.
    window.__PUBLIC_RUNTIME_CONFIG__ = { sentryDsn: 'https://key@example.ingest.sentry.io/1' }
    await import('@/instrumentation-client')
    await waitForSentryInit()
    options = mocks.init.mock.calls[0]?.[0]
  })

  it('initialises Sentry with the configured DSN', () => {
    expect(options.dsn).toBe('https://key@example.ingest.sentry.io/1')
  })

  it('drops Reown SIWE verification errors', () => {
    const error = new Error('Failed to verify message')

    expect(options.beforeSend({}, { originalException: error })).toBeNull()
  })

  it('keeps unrelated errors', () => {
    const error = new Error('Failed to verify transaction')
    const event = {
      exception: {
        values: [{ value: error.message }],
      },
    }

    expect(options.beforeSend(event, { originalException: error })).toBe(event)
  })
})
