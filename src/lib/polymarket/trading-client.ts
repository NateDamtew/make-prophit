import type { ApiKeyCreds, OrderResponse } from '@polymarket/client'
import type { Address } from 'viem'
import type { Config } from 'wagmi'

import { AssetType, createSecureClient, OrderSide, OrderType, remoteBuilderSigning } from '@polymarket/client'
import { fetchBalanceAllowance } from '@polymarket/client/actions'
import { signerFrom } from '@polymarket/client/viem'
import { getConnections, getWalletClient, switchChain } from 'wagmi/actions'

import { POLYGON_MAINNET_CHAIN_ID } from '@/lib/network'
import { runOnPolymarketChain, selectPolymarketConnection } from '@/lib/polymarket-connection'
import { POLYMARKET_ENDPOINTS } from '@/lib/polymarket/endpoints'

/**
 * Browser-side Polymarket trading through the official SDK. The user's own
 * wallet signs everything (Prophit never holds funds); Polymarket's relayer
 * pays gas, authorized by builder signatures from /api/polymarket/builder-sign;
 * every order carries Prophit's builder code. Orders go straight from the
 * user's browser to Polymarket, so Polymarket sees the user's own location.
 */

type SecureClient = Awaited<ReturnType<typeof createSecureClient>>

export const POLYMARKET_MIN_ORDER_USD = 1
const BUILDER_SIGN_URL = '/api/polymarket/builder-sign'
const CREDENTIALS_STORAGE_PREFIX = 'polymarket:clob-credentials:'

function readStoredCredentials(owner: Address): ApiKeyCreds | undefined {
  try {
    const raw = sessionStorage.getItem(`${CREDENTIALS_STORAGE_PREFIX}${owner.toLowerCase()}`)
    return raw ? (JSON.parse(raw) as ApiKeyCreds) : undefined
  } catch {
    return undefined
  }
}

function storeCredentials(owner: Address, credentials: ApiKeyCreds) {
  try {
    sessionStorage.setItem(`${CREDENTIALS_STORAGE_PREFIX}${owner.toLowerCase()}`, JSON.stringify(credentials))
  } catch {}
}

/**
 * Runs `operation` with an authenticated SDK client on Polygon mainnet,
 * switching the connected wallet's chain for the duration when needed. The
 * first call per session deploys the user's Deposit Wallet (gasless) and
 * derives trading credentials (one signature); later calls reuse them.
 */
export interface PolymarketWalletContext {
  wagmiConfig: Config
  ownerAddress: Address
  connectorId?: string | null
  connectorUid?: string | null
}

export async function withPolymarketClient<T>(
  { wagmiConfig, ownerAddress, connectorId, connectorUid }: PolymarketWalletContext,
  operation: (client: SecureClient) => Promise<T>,
): Promise<T> {
  const connection = selectPolymarketConnection(getConnections(wagmiConfig), {
    ownerAddress,
    connectorId,
    connectorUid,
  })
  if (!connection) {
    throw new Error('Connect your wallet to trade.')
  }
  const connectionChainId = await connection.connector.getChainId()

  return await runOnPolymarketChain({
    connectionChainId,
    switchToPolymarket: () =>
      switchChain(wagmiConfig, { chainId: POLYGON_MAINNET_CHAIN_ID, connector: connection.connector }),
    restoreOriginalChain: () =>
      switchChain(wagmiConfig, { chainId: connectionChainId, connector: connection.connector }),
    operation: async () => {
      const walletClient = await getWalletClient(wagmiConfig, {
        account: ownerAddress,
        chainId: POLYGON_MAINNET_CHAIN_ID,
        connector: connection.connector,
      })
      const storedCredentials = readStoredCredentials(ownerAddress)
      const client = await createSecureClient({
        signer: signerFrom(walletClient),
        apiKey: remoteBuilderSigning({ url: BUILDER_SIGN_URL, credentials: 'same-origin' }),
        ...(storedCredentials ? { credentials: storedCredentials } : {}),
      })
      storeCredentials(ownerAddress, client.credentials)
      try {
        return await operation(client)
      } finally {
        await client.closeSubscriptions().catch(() => {})
      }
    },
  })
}

export interface PolymarketAccountSnapshot {
  /** The user's Polymarket Deposit Wallet (holds pUSD and shares). */
  wallet: Address
  /** Spendable pUSD, in dollars. */
  balanceUsd: number
}

/** Sets up the wallet (approvals) once and reports where funds sit. */
export async function preparePolymarketAccount(client: SecureClient): Promise<PolymarketAccountSnapshot> {
  const approvals = await client.fetchTradingApprovalsState()
  if (!approvals.isFullyApproved) {
    await client.setupTradingApprovals()
  }
  const balance = await fetchBalanceAllowance(client, { assetType: AssetType.COLLATERAL })
  return {
    wallet: client.account.wallet as Address,
    balanceUsd: Number(balance.balance) / 1e6,
  }
}

export interface PolymarketDepositAddresses {
  /** Ethereum, Polygon, Arbitrum, Base and other EVM chains. */
  evm: string | null
  svm: string | null
  tron: string | null
  btc: string | null
}

/**
 * Polymarket Bridge deposit addresses for a wallet: funds sent there from a
 * supported chain land as pUSD in that wallet. Tagged with Prophit's builder code.
 */
export async function fetchPolymarketDepositAddresses(
  wallet: Address,
  builderCode: string,
): Promise<PolymarketDepositAddresses> {
  const response = await fetch(`${POLYMARKET_ENDPOINTS.bridge}/deposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Builder-Code': builderCode },
    body: JSON.stringify({ address: wallet }),
  })
  if (!response.ok) {
    throw new Error('Could not get a deposit address from Polymarket.')
  }
  const payload = (await response.json()) as { address?: Partial<PolymarketDepositAddresses> }
  return {
    evm: payload.address?.evm ?? null,
    svm: payload.address?.svm ?? null,
    tron: payload.address?.tron ?? null,
    btc: payload.address?.btc ?? null,
  }
}

export interface PolymarketMarketOrderInput {
  tokenId: string
  side: 'buy' | 'sell'
  /** USD to spend (buy) or shares to sell (sell). */
  amount: number
  /** Worst acceptable price (0–1): max for a buy, min for a sell. */
  limitPrice?: number
  builderCode: string
}

export async function placePolymarketMarketOrder(
  client: SecureClient,
  input: PolymarketMarketOrderInput,
): Promise<OrderResponse> {
  if (input.side === 'buy') {
    if (input.amount < POLYMARKET_MIN_ORDER_USD) {
      throw new Error(`The smallest order on Polymarket is $${POLYMARKET_MIN_ORDER_USD}.`)
    }
    return await client.placeMarketOrder({
      assetId: input.tokenId,
      side: OrderSide.BUY,
      amount: input.amount,
      maxPrice: input.limitPrice,
      builderCode: input.builderCode,
      orderType: OrderType.FAK,
    })
  }
  return await client.placeMarketOrder({
    assetId: input.tokenId,
    side: OrderSide.SELL,
    shares: input.amount,
    minPrice: input.limitPrice,
    builderCode: input.builderCode,
    orderType: OrderType.FAK,
  })
}

/** Native USDC on Polygon — where withdrawals land by default. */
const POLYGON_USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
/** pUSD, Polymarket's collateral token, held in the user's Deposit Wallet. */
const PUSD_ADDRESS = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB'

/** Claims a resolved market's winnings back into the wallet as pUSD (gas-free). */
export async function redeemPolymarketMarket(client: SecureClient, conditionId: string) {
  const handle = await client.redeemPositions({ conditionId })
  return await handle.wait()
}

/**
 * Withdraws pUSD as USDC on Polygon to `recipient` through the Polymarket
 * Bridge: the bridge gives a one-off address, the wallet sends pUSD there
 * (gas-free) and the bridge pays out USDC.
 */
export async function withdrawPolymarketFunds(
  client: SecureClient,
  input: { amountUsd: number; recipient: Address; builderCode: string },
) {
  if (!(input.amountUsd > 0)) {
    throw new Error('Enter an amount to withdraw.')
  }
  const response = await fetch(`${POLYMARKET_ENDPOINTS.bridge}/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Builder-Code': input.builderCode },
    body: JSON.stringify({
      address: client.account.wallet,
      toChainId: '137',
      toTokenAddress: POLYGON_USDC_ADDRESS,
      recipientAddr: input.recipient,
    }),
  })
  if (!response.ok) {
    throw new Error('Polymarket could not prepare the withdrawal.')
  }
  const payload = (await response.json()) as { address?: { evm?: string } }
  const bridgeAddress = payload.address?.evm
  if (!bridgeAddress) {
    throw new Error('Polymarket did not return a withdrawal address.')
  }
  const handle = await client.transferErc20({
    amount: BigInt(Math.floor(input.amountUsd * 1e6)),
    recipientAddress: bridgeAddress,
    tokenAddress: PUSD_ADDRESS,
  })
  return await handle.wait()
}
