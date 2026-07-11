import { privateKeyToAccount } from 'viem/accounts'
import { wrapTypedDataSignature } from 'viem/experimental/erc7739'
import { describe, expect, it } from 'vitest'
import {
  buildOrderMessage,
  buildSignableEnvelope,
  deserializeOrder,
  serializeOrder,
} from '@/app/api/tma/_lib'
import { EIP712_TYPES, getExchangeEip712Domain, ORDER_SIDE, ORDER_TYPE } from '@/lib/constants'
import { buildOrderPayload } from '@/lib/orders'
import { signOrderPayload } from '@/lib/orders/signing'

const TEST_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

describe('tMA order envelope', () => {
  it('reproduces the web signing path bit-for-bit', async () => {
    const account = privateKeyToAccount(TEST_KEY)

    const payload = buildOrderPayload({
      outcome: { token_id: '12345678901234567890' } as any,
      makerAddress: '0x2B7A0B44DdD843a7C153e6F8D0109b3C60E6972E',
      side: ORDER_SIDE.BUY,
      orderType: ORDER_TYPE.MARKET,
      amount: '1',
      limitPrice: '0',
      limitShares: '0',
      marketPriceCents: 50,
    })
    const domain = getExchangeEip712Domain(false)

    // Web path: signOrderPayload builds the TypedDataSign envelope internally
    // and wraps the raw signature. Capture what it asks the wallet to sign.
    let webSignArgs: any
    const webWrapped = await signOrderPayload({
      payload,
      domain,
      signTypedDataAsync: async (args: any) => {
        webSignArgs = args
        return account.signTypedData(args)
      },
    })

    // TMA path: the prepare route serializes the payload + envelope, the
    // client signs the (JSON round-tripped) envelope, the submit route
    // deserializes and wraps the raw signature server-side.
    const wire = JSON.parse(JSON.stringify({
      order: serializeOrder(payload),
      typedData: buildSignableEnvelope(payload, domain as Record<string, unknown>),
    }))
    const rawSig = await account.signTypedData(wire.typedData)
    const order = deserializeOrder(wire.order)
    const tmaWrapped = wrapTypedDataSignature({
      domain,
      types: EIP712_TYPES,
      primaryType: 'Order',
      message: buildOrderMessage(order),
      signature: rawSig as `0x${string}`,
    })

    // Raw signatures must match (same envelope hash) before wrapping…
    const webRawSig = await account.signTypedData(webSignArgs)
    expect(rawSig).toBe(webRawSig)
    // …and the wrapped bytes must be identical.
    expect(tmaWrapped).toBe(webWrapped)
  })
})
