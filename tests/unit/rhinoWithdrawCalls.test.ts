import { decodeFunctionData, erc20Abi } from 'viem'
import { describe, expect, it } from 'vitest'
import { buildRhinoWithdrawCalls } from '@/lib/wallet/transactions'

const USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
const BRIDGE = '0xBA4EEE20F434bC3908A0B18DA496348657133A7E'
const COMMIT = '6a3377d9fc8d600ed486e41c'

const rhinoBridgeAbi = [
  {
    name: 'depositWithId',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'commitmentId', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

describe('buildRhinoWithdrawCalls', () => {
  it('builds an approve then depositWithId for the bridge', () => {
    const amount = 10_000_000n // 10 USDC (6 dp)
    const [approve, deposit] = buildRhinoWithdrawCalls({
      token: USDC,
      bridgeContract: BRIDGE,
      amount,
      commitmentId: COMMIT,
    })

    // 1) approve(bridge, amount) on the token
    expect(approve.target.toLowerCase()).toBe(USDC.toLowerCase())
    const approveCall = decodeFunctionData({ abi: erc20Abi, data: approve.data })
    expect(approveCall.functionName).toBe('approve')
    expect((approveCall.args[0] as string).toLowerCase()).toBe(BRIDGE.toLowerCase())
    expect(approveCall.args[1]).toBe(amount)

    // 2) depositWithId(token, amount, commitmentId) on the bridge
    expect(deposit.target.toLowerCase()).toBe(BRIDGE.toLowerCase())
    const depositCall = decodeFunctionData({ abi: rhinoBridgeAbi, data: deposit.data })
    expect(depositCall.functionName).toBe('depositWithId')
    expect((depositCall.args[0] as string).toLowerCase()).toBe(USDC.toLowerCase())
    expect(depositCall.args[1]).toBe(amount)
    expect(depositCall.args[2]).toBe(BigInt(`0x${COMMIT}`))
  })

  it('rejects an invalid commitment id', () => {
    expect(() => buildRhinoWithdrawCalls({
      token: USDC,
      bridgeContract: BRIDGE,
      amount: 1n,
      commitmentId: 'nope',
    })).toThrow()
  })
})
