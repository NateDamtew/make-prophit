import type { TypedDataDomain } from 'viem'

import { privateKeyToAccount } from 'viem/accounts'

import type { BlockchainOrder } from '@/types'

import { signOrderPayload } from '@/lib/orders/signing'

/**
 * Sign a CLOB order with the house EOA exactly the way the browser does for a
 * user (Deposit Wallet signature type 3, ERC-7739 TypedDataSign wrapper), by
 * feeding viem's local account into the shared `signOrderPayload`.
 */
export async function signOrderWithHouseKey(params: {
  payload: BlockchainOrder
  domain: TypedDataDomain
  privateKey: `0x${string}`
}): Promise<string> {
  const account = privateKeyToAccount(params.privateKey)
  return signOrderPayload({
    payload: params.payload,
    domain: params.domain,
    signTypedDataAsync: async (args) => account.signTypedData(args as Parameters<typeof account.signTypedData>[0]),
  })
}

export function houseSignerAddress(privateKey: `0x${string}`): `0x${string}` {
  return privateKeyToAccount(privateKey).address
}
