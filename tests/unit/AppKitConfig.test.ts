import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { hoisted } from '../bun-test-helpers'

// FORK: appkit.ts builds a plain wagmi config for the Dynamic connector
// (upstream's version builds a Reown WagmiAdapter with cookie SSR storage).
const mocks = hoisted(() => ({
  createConfig: mock(() => 'wagmi-config'),
}))

void mock.module('wagmi', () => ({
  createConfig: mocks.createConfig,
}))

describe('appKit config', () => {
  beforeEach(() => {
    mocks.createConfig.mockClear()
  })

  it('builds a single-chain wagmi config for the Dynamic connector', async () => {
    const { createDynamicWagmiConfig, defaultNetwork } = await import('@/lib/appkit')

    const config = createDynamicWagmiConfig()

    expect(config).toBe('wagmi-config')
    expect(mocks.createConfig).toHaveBeenCalledTimes(1)
    const options = mocks.createConfig.mock.calls[0]?.[0] as {
      chains: readonly { id: number }[]
      multiInjectedProviderDiscovery: boolean
    }
    expect(options.chains).toEqual([defaultNetwork])
    // Dynamic manages provider discovery itself; wagmi must not double-discover.
    expect(options.multiInjectedProviderDiscovery).toBe(false)
  })
})
