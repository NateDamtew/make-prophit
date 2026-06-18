import { Address, beginCell, Cell } from '@ton/core'

/**
 * Resolves an owner's jetton-wallet address by calling the jetton master's
 * `get_wallet_address` get-method via toncenter. This is the canonical source
 * of truth — it works even for jetton wallets that have never been
 * initialized — so we don't depend on an indexer being up to date. Only needs
 * `@ton/core` for cell encoding/decoding.
 *
 * Verified live against toncenter v2: the response stack is
 * `[["cell", { bytes: "<base64 BOC>" }]]`, whose single cell holds the address.
 */

const TONCENTER_RUN_GET_METHOD = 'https://toncenter.com/api/v2/runGetMethod'

export interface ResolveJettonWalletParams {
  /** Jetton master contract (e.g. USDT on TON). */
  jettonMaster: string
  /** Owner's main TON wallet address. */
  owner: string
  /** Optional toncenter endpoint override. */
  endpoint?: string
  /** Optional toncenter API key (raises rate limits). */
  apiKey?: string
}

type StackItem = [string, { bytes?: string } | string]

interface RunGetMethodResponse {
  ok?: boolean
  error?: string
  result?: {
    exit_code?: number
    stack?: StackItem[]
  }
}

function extractCellBytes(stack: StackItem[] | undefined): string | undefined {
  const first = stack?.[0]
  if (!first) {
    return undefined
  }
  const payload = first[1]
  return typeof payload === 'string' ? payload : payload?.bytes
}

export async function resolveJettonWalletAddress(params: ResolveJettonWalletParams): Promise<string> {
  const ownerSlice = beginCell()
    .storeAddress(Address.parse(params.owner))
    .endCell()
    .toBoc()
    .toString('base64')

  const response = await fetch(params.endpoint ?? TONCENTER_RUN_GET_METHOD, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(params.apiKey ? { 'X-API-Key': params.apiKey } : {}),
    },
    body: JSON.stringify({
      address: params.jettonMaster,
      method: 'get_wallet_address',
      stack: [['tvm.Slice', ownerSlice]],
    }),
  })

  if (!response.ok) {
    throw new Error(`toncenter get_wallet_address failed: HTTP ${response.status}`)
  }

  const json = await response.json() as RunGetMethodResponse
  if (!json.ok || json.result?.exit_code !== 0) {
    throw new Error(`get_wallet_address exit_code ${json.result?.exit_code ?? 'unknown'}`)
  }

  const cellB64 = extractCellBytes(json.result.stack)
  if (!cellB64) {
    throw new Error('get_wallet_address returned no address cell')
  }

  return Cell.fromBase64(cellB64).beginParse().loadAddress().toString()
}
