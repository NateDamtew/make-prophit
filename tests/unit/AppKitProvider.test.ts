import { act, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'

function ReadyConsumer({ ctx, onValue }: { ctx: React.Context<any>, onValue?: (value: any) => void }) {
  const value = React.use(ctx)
  onValue?.(value)
  return React.createElement('div', { 'data-testid': 'ready' }, value.isReady ? 'yes' : 'no')
}

const mocks = vi.hoisted(() => ({
  setShowAuthFlow: vi.fn(),
  handleLogOut: vi.fn(),
}))

vi.mock('@dynamic-labs/sdk-react-core', () => ({
  DynamicContextProvider: ({ children }: any) => children,
  useDynamicContext: () => ({
    setShowAuthFlow: mocks.setShowAuthFlow,
    handleLogOut: mocks.handleLogOut,
    primaryWallet: null,
    sdkHasLoaded: true,
  }),
}))

vi.mock('@dynamic-labs/ethereum', () => ({
  EthereumWalletConnectors: [],
}))

vi.mock('@dynamic-labs/wagmi-connector', () => ({
  DynamicWagmiConnector: ({ children }: any) => children,
}))

vi.mock('@/lib/appkit', () => ({
  __esModule: true,
  createDynamicWagmiConfig: vi.fn(() => ({ state: {}, subscribe: vi.fn() })),
  defaultNetwork: {
    id: 137,
    name: 'Polygon',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: { default: { http: ['https://polygon-rpc.com'] } },
    blockExplorers: { default: { url: 'https://polygonscan.com' } },
  },
  networks: [{ id: 137 }],
}))

vi.mock('@/hooks/usePublicRuntimeConfig', () => ({
  usePublicRuntimeConfig: () => ({
    dynamicEnvId: '0740478b-4de5-4a96-bb79-94687547e9a4',
    siteUrl: 'https://markets.test',
  }),
}))

vi.mock('wagmi', () => ({
  WagmiProvider: ({ children }: any) => children,
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}))

vi.mock('next-intl', () => ({
  useExtracted: () => (value: string) => value,
}))

// Dynamic mounts client-only after hydration — force the hydrated branch.
vi.mock('@/hooks/useHasHydrated', () => ({
  useHasHydrated: () => true,
}))

vi.mock('@/components/SignaturePromptHost', () => ({
  SignaturePromptHost: () => null,
}))

vi.mock('@/lib/logout', () => ({
  signOutAndRedirect: vi.fn(),
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({ data: { user: null } }),
    signOut: vi.fn(),
    siwe: {
      nonce: vi.fn(),
      verify: vi.fn().mockResolvedValue({ data: { success: true } }),
    },
  },
}))

vi.mock('wagmi/actions', () => ({
  signMessage: vi.fn(),
}))

describe('appKitProvider (Dynamic)', () => {
  it('provides isReady: true via AppKitContext', async () => {
    const { AppKitContext } = await import('@/hooks/useAppKit')
    const AppKitProvider = (await import('@/providers/AppKitProvider')).default

    let latestValue: any = null

    render(
      React.createElement(
        AppKitProvider,
        null,
        React.createElement(ReadyConsumer, { ctx: AppKitContext, onValue: (v) => { latestValue = v } }),
      ),
    )

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('yes')
      expect(latestValue?.isReady).toBe(true)
    })
  })

  it('calls setShowAuthFlow when open() is called', async () => {
    const { AppKitContext } = await import('@/hooks/useAppKit')
    const AppKitProvider = (await import('@/providers/AppKitProvider')).default

    let latestValue: any = null

    render(
      React.createElement(
        AppKitProvider,
        null,
        React.createElement(ReadyConsumer, { ctx: AppKitContext, onValue: (v) => { latestValue = v } }),
      ),
    )

    await waitFor(() => {
      expect(latestValue?.isReady).toBe(true)
    })

    await act(async () => {
      await latestValue.open()
    })

    expect(mocks.setShowAuthFlow).toHaveBeenCalledWith(true)
  })

  it('calls setShowAuthFlow(false) when close() is called', async () => {
    const { AppKitContext } = await import('@/hooks/useAppKit')
    const AppKitProvider = (await import('@/providers/AppKitProvider')).default

    let latestValue: any = null

    render(
      React.createElement(
        AppKitProvider,
        null,
        React.createElement(ReadyConsumer, { ctx: AppKitContext, onValue: (v) => { latestValue = v } }),
      ),
    )

    await waitFor(() => {
      expect(latestValue?.isReady).toBe(true)
    })

    await act(async () => {
      await latestValue.close()
    })

    expect(mocks.setShowAuthFlow).toHaveBeenCalledWith(false)
  })
})
