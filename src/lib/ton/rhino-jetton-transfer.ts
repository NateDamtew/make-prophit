import { Address, beginCell } from '@ton/core'

/**
 * Builds the TON jetton-transfer message for a rhino.fi bridge deposit.
 *
 * This matches rhino's exact on-chain format (from their bridge-examples
 * `tonBridge.ts`): the commitment id (rhino `quoteId`, a 24-hex-char ObjectId =
 * 96 bits) is stored as a RAW 96-bit unsigned integer in the forward-payload
 * cell — NOT a text comment. (This is why Dynamic's `prepareJettonTransfer`,
 * which writes a text comment, can't be used here.)
 */

/** TEP-74 jetton transfer op code. */
const JETTON_TRANSFER_OP = 0xF8A7EA5
/** TON forwarded with the transfer notification so the bridge sees the payload. */
const FORWARD_TON_AMOUNT = 20_000_000n // 0.02 TON, in nanoton
/** Total TON gas attached to the message (covers forward amount + jetton fees). */
const TRANSFER_GAS_AMOUNT = 100_000_000n // 0.1 TON, in nanoton

const COMMITMENT_ID_REGEX = /^[0-9a-f]{24}$/i

export interface RhinoJettonTransferParams {
  /** The sender's USDT jetton-wallet address (resolve via getJettonWalletAddress). */
  jettonWalletAddress: string
  /** rhino's TON bridge contract — the jettons are sent here. */
  bridgeContract: string
  /** The sender's main TON wallet — receives excess gas (response destination). */
  ownerAddress: string
  /** USDT amount in base units (6 decimals). */
  jettonAmount: bigint
  /** rhino commitment id (`quoteId`) — a 24-hex-char ObjectId. */
  commitmentId: string
}

/** A single message in a TonConnect `SendTransactionRequest`. */
export interface TonConnectMessage {
  /** Destination — the sender's jetton wallet. */
  address: string
  /** TON to attach, in nanoton (decimal string). */
  amount: string
  /** Message body as a base64 BOC. */
  payload: string
}

/** base64-encode a BOC without relying on a Node `Buffer` polyfill in the browser. */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function buildRhinoJettonTransfer(params: RhinoJettonTransferParams): TonConnectMessage {
  if (!COMMITMENT_ID_REGEX.test(params.commitmentId)) {
    throw new Error(`Invalid rhino commitment id: ${params.commitmentId}`)
  }

  const forwardPayload = beginCell()
    .storeUint(BigInt(`0x${params.commitmentId}`), 96)
    .endCell()

  const body = beginCell()
    .storeUint(JETTON_TRANSFER_OP, 32)
    .storeUint(0, 64) // query id
    .storeCoins(params.jettonAmount)
    .storeAddress(Address.parse(params.bridgeContract)) // jettons go to the bridge
    .storeAddress(Address.parse(params.ownerAddress)) // response excess destination
    .storeBit(0) // no custom payload
    .storeCoins(FORWARD_TON_AMOUNT)
    .storeBit(1) // forward payload stored as a reference
    .storeRef(forwardPayload)
    .endCell()

  return {
    address: params.jettonWalletAddress,
    amount: TRANSFER_GAS_AMOUNT.toString(),
    payload: toBase64(body.toBoc()),
  }
}
