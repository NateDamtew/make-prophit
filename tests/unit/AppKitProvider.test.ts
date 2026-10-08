import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, mock } from 'bun:test'
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
}))

void mock.module('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}))

void mock.module('next-intl', () => ({
  useExtracted: () => (value: string) => value,
}))

// Dynamic mounts client-only after hydration — force the hydrated branch.
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

describe('appKitProvider (Dynamic)', () => {
  it('provides isReady: true via AppKitContext', async () => {
    const { AppKitContext } = await import('@/hooks/useAppKit')
    const AppKitProvider = (await import('@/providers/AppKitProvider')).default

    let latestValue: any = null

    render(
      React.createElement(
        AppKitProvider,
        null,
        React.createElement(ReadyConsumer, {
          ctx: AppKitContext,
          onValue: (v) => {
            latestValue = v
          },
        }),
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
        React.createElement(ReadyConsumer, {
          ctx: AppKitContext,
          onValue: (v) => {
            latestValue = v
          },
        }),
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
        React.createElement(ReadyConsumer, {
          ctx: AppKitContext,
          onValue: (v) => {
            latestValue = v
          },
        }),
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
