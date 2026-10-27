import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import * as React from 'react'

import { hoisted } from '../bun-test-helpers'

function ReadyConsumer({ ctx, onValue }: { ctx: React.Context<any>; onValue?: (value: any) => void }) {
  const value = React.use(ctx)
  onValue?.(value)
  return React.createElement('div', { 'data-testid': 'ready' }, value.isReady ? 'yes' : 'no')
}

const mocks = hoisted(() => ({
  setShowAuthFlow: mock(),
  handleLogOut: mock(),
  setShowLinkNewWalletModal: mock(),
  user: null as { id: string } | null,
}))

void mock.module('@dynamic-labs/sdk-react-core', () => ({
  DynamicContextProvider: ({ children }: any) => children,
  useDynamicContext: () => ({
    setShowAuthFlow: mocks.setShowAuthFlow,
    handleLogOut: mocks.handleLogOut,
    primaryWallet: null,
    sdkHasLoaded: true,
  }),
  useDynamicModals: () => ({
    setShowLinkNewWalletModal: mocks.setShowLinkNewWalletModal,
  }),
  useConnectWithOtp: () => ({
    connectWithEmail: mock(),
    verifyOneTimePassword: mock(),
  }),
  useUserWallets: () => [],
}))

void mock.module('@dynamic-labs/ethereum', () => ({
  EthereumWalletConnectors: [],
}))

void mock.module('@dynamic-labs/wagmi-connector', () => ({
  DynamicWagmiConnector: ({ children }: any) => children,
}))

void mock.module('@/lib/appkit', () => ({
  __esModule: true,
  createDynamicWagmiConfig: mock(() => ({ state: {}, subscribe: mock() })),
  defaultNetwork: {
    id: 137,
    name: 'Polygon',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: { default: { http: ['https://polygon-rpc.com'] } },
    blockExplorers: { default: { url: 'https://polygonscan.com' } },
  },
  networks: [{ id: 137 }],
}))

void mock.module('@/hooks/usePublicRuntimeConfig', () => ({
  usePublicRuntimeConfig: () => ({
    dynamicEnvId: '0740478b-4de5-4a96-bb79-94687547e9a4',
    siteUrl: 'https://markets.test',
  }),
}))

void mock.module('wagmi', () => ({
  WagmiProvider: ({ children }: any) => children,
  useConfig: () => ({ state: {} }),
}))

void mock.module('@/stores/useUser', () => ({
  mergeSessionUserState: (_previous: unknown, user: unknown) => user,
  useUser: Object.assign(() => mocks.user, { setState: mock() }),
}))

void mock.module('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}))

void mock.module('next-intl', () => ({
  useExtracted: () => (value: string) => value,
}))

// The wallet layer mounts client-only after hydration — force the hydrated branch.
void mock.module('@/hooks/useHasHydrated', () => ({
  useHasHydrated: () => true,
}))

void mock.module('@/components/SignaturePromptHost', () => ({
  SignaturePromptHost: () => null,
}))

void mock.module('@/lib/logout', () => ({
  signOutAndRedirect: mock(),
}))

void mock.module('@/lib/auth-client', () => ({
  authClient: {
    getSession: mock().mockResolvedValue({ data: { user: null } }),
    signOut: mock(),
    siwe: {
      nonce: mock(),
      verify: mock().mockResolvedValue({ data: { success: true } }),
    },
  },
}))

void mock.module('wagmi/actions', () => ({
  signMessage: mock(),
}))

function renderWithConsumer(
  AppKitProvider: React.ComponentType<{ children: React.ReactNode }>,
  ctx: React.Context<any>,
) {
  const state: { latestValue: any } = { latestValue: null }
  render(
    React.createElement(
      AppKitProvider,
      null,
      React.createElement(ReadyConsumer, {
        ctx,
        onValue: (value) => {
          state.latestValue = value
        },
      }),
    ),
  )
  return state
}

describe('appKitProvider (Dynamic)', () => {
  beforeEach(() => {
    mocks.user = null
    mocks.setShowAuthFlow.mockReset()
  })

  it('loads the wallet layer right away for a signed-in user and provides isReady: true', async () => {
    mocks.user = { id: 'user-1' }
    const { AppKitContext } = await import('@/hooks/useAppKit')
    const AppKitProvider = (await import('@/providers/AppKitProvider')).default

    const state = renderWithConsumer(AppKitProvider, AppKitContext)

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('yes')
      expect(state.latestValue?.isReady).toBe(true)
    })
  })

  it('loads the wallet layer on open() before it is ready, then opens the auth flow', async () => {
    const { AppKitContext } = await import('@/hooks/useAppKit')
    const AppKitProvider = (await import('@/providers/AppKitProvider')).default

    const state = renderWithConsumer(AppKitProvider, AppKitContext)
    expect(state.latestValue?.isReady).toBe(false)

    // open() waits for the layer to render, which act() would hold back until
    // its callback returns, so start it inside act() and wait outside.
    await act(async () => {
      void state.latestValue.open()
    })

    await waitFor(() => {
      expect(mocks.setShowAuthFlow).toHaveBeenCalledWith(true)
    })
    expect(state.latestValue?.isReady).toBe(true)
  })

  it('does not load the wallet layer for a guest until asked, and preloadWallet() loads it without opening', async () => {
    const { AppKitContext } = await import('@/hooks/useAppKit')
    const AppKitProvider = (await import('@/providers/AppKitProvider')).default

    const state = renderWithConsumer(AppKitProvider, AppKitContext)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(state.latestValue?.isReady).toBe(false)

    await act(async () => {
      state.latestValue.preloadWallet()
    })

    await waitFor(() => {
      expect(state.latestValue?.isReady).toBe(true)
    })
    expect(mocks.setShowAuthFlow).not.toHaveBeenCalled()
  })

  it('calls setShowAuthFlow(false) when close() is called', async () => {
    mocks.user = { id: 'user-1' }
    const { AppKitContext } = await import('@/hooks/useAppKit')
    const AppKitProvider = (await import('@/providers/AppKitProvider')).default

    const state = renderWithConsumer(AppKitProvider, AppKitContext)

    await waitFor(() => {
      expect(state.latestValue?.isReady).toBe(true)
    })

    await act(async () => {
      await state.latestValue.close()
    })

    expect(mocks.setShowAuthFlow).toHaveBeenCalledWith(false)
  })

  it('keeps the page mounted when the wallet layer loads', async () => {
    mocks.user = { id: 'user-1' }
    const { AppKitContext } = await import('@/hooks/useAppKit')
    const AppKitProvider = (await import('@/providers/AppKitProvider')).default
    const onMount = mock()

    function MountCounter() {
      const value = React.use(AppKitContext)
      React.useEffect(() => {
        onMount()
      }, [])
      return React.createElement('div', { 'data-testid': 'ready' }, value.isReady ? 'yes' : 'no')
    }

    render(React.createElement(AppKitProvider, null, React.createElement(MountCounter)))

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('yes')
    })
    expect(onMount).toHaveBeenCalledTimes(1)
  })
})
