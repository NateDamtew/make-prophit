import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { buildRhinoJettonTransfer } from '@/lib/ton/rhino-jetton-transfer'

const BRIDGE = 'EQAj3SoOk4MPzjn816Crw1b4RxW79fB_Z549tyCd9HIQV6b7'
const OWNER = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'
const JETTON_WALLET = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'
const COMMIT = '6a3377d9fc8d600ed486e41c'

describe('buildRhinoJettonTransfer', () => {
  it('encodes a TEP-74 jetton transfer with the commitment id as a 96-bit forward payload', () => {
    const msg = buildRhinoJettonTransfer({
      jettonWalletAddress: JETTON_WALLET,
      bridgeContract: BRIDGE,
      ownerAddress: OWNER,
      jettonAmount: 10_000_000n, // 10 USDT (6 dp)
      commitmentId: COMMIT,
    })

    expect(msg.address).toBe(JETTON_WALLET)
    expect(msg.amount).toBe('100000000') // 0.1 TON gas

    const slice = Cell.fromBase64(msg.payload).beginParse()
    expect(slice.loadUint(32)).toBe(0xF8A7EA5) // jetton transfer op
    expect(slice.loadUint(64)).toBe(0) // query id
    expect(slice.loadCoins()).toBe(10_000_000n) // jetton amount
    expect(slice.loadAddress().equals(Address.parse(BRIDGE))).toBe(true)
    expect(slice.loadAddress().equals(Address.parse(OWNER))).toBe(true)
    expect(slice.loadBit()).toBe(false) // no custom payload
    expect(slice.loadCoins()).toBe(20_000_000n) // 0.02 TON forward amount
    expect(slice.loadBit()).toBe(true) // forward payload as reference

    const forward = slice.loadRef().beginParse()
    expect(forward.loadUintBig(96)).toBe(BigInt(`0x${COMMIT}`))
  })

  it('rejects an invalid commitment id', () => {
    expect(() => buildRhinoJettonTransfer({
      jettonWalletAddress: JETTON_WALLET,
      bridgeContract: BRIDGE,
      ownerAddress: OWNER,
      jettonAmount: 10_000_000n,
      commitmentId: 'not-an-objectid',
    })).toThrow()
  })
})
