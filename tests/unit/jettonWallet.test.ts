import { afterEach, describe, expect, it, mock } from 'bun:test'

import { resolveJettonWalletAddress } from '@/lib/ton/jetton-wallet'

import { stubGlobal, unstubAllGlobals } from '../bun-test-helpers'

const USDT_MASTER = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'
const OWNER = 'EQAj3SoOk4MPzjn816Crw1b4RxW79fB_Z549tyCd9HIQV6b7'

// Captured live from toncenter v2 runGetMethod (get_wallet_address).
const LIVE_STACK_CELL = 'te6cckEBAQEAJAAAQ4AXsqVXAuRG6+GFp/25WVl2IsmatSkX0jbrXVjoBOwsnFAUHg+R'
const EXPECTED_JETTON_WALLET = 'EQC9lSq4FyI3XwwtP-3KysuxFkzVqUi-kbda6sdAJ2Fk4mIs'

function mockFetch(response: unknown, ok = true, status = 200) {
  return mock(async () => ({
    ok,
    status,
    json: async () => response,
  })) as unknown as typeof fetch
}

afterEach(() => {
  mock.restore()
  unstubAllGlobals()
})

describe('resolveJettonWalletAddress', () => {
  it('parses the get_wallet_address cell into a friendly address', async () => {
    const fetchMock = mockFetch({
      ok: true,
      result: { exit_code: 0, stack: [['cell', { bytes: LIVE_STACK_CELL }]] },
    })
    stubGlobal('fetch', fetchMock)

    const address = await resolveJettonWalletAddress({ jettonMaster: USDT_MASTER, owner: OWNER })
    expect(address).toBe(EXPECTED_JETTON_WALLET)

    // Sends the owner address as a tvm.Slice arg to get_wallet_address.
    const body = JSON.parse((fetchMock as unknown as ReturnType<typeof mock>).mock.calls[0][1].body)
    expect(body.address).toBe(USDT_MASTER)
    expect(body.method).toBe('get_wallet_address')
    expect(body.stack[0][0]).toBe('tvm.Slice')
    expect(typeof body.stack[0][1]).toBe('string')
  })

  it('throws on a non-zero exit code', async () => {
    stubGlobal('fetch', mockFetch({ ok: true, result: { exit_code: 11, stack: [] } }))
    await expect(resolveJettonWalletAddress({ jettonMaster: USDT_MASTER, owner: OWNER })).rejects.toThrow(
      /exit_code 11/,
    )
  })

  it('throws on an HTTP error', async () => {
    stubGlobal('fetch', mockFetch({}, false, 500))
    await expect(resolveJettonWalletAddress({ jettonMaster: USDT_MASTER, owner: OWNER })).rejects.toThrow(/HTTP 500/)
  })
})
