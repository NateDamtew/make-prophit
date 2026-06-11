import { describe, expect, it } from 'vitest'
import {
  buildRpcTransactionRequest,
  isBigIntSerializationError,
  mapSignatureFlowErrorForUser,
} from '@/app/[locale]/admin/events/calendar/_components/admin-create-event-form-utils'

describe('admin create event form utils', () => {
  describe('isBigIntSerializationError', () => {
    it('detects provider bigint serialization failures', () => {
      expect(isBigIntSerializationError('Do not know how to serialize a BigInt')).toBe(true)
      expect(isBigIntSerializationError('Failed to parse String to BigInt')).toBe(true)
      expect(isBigIntSerializationError('Cannot convert 78.000000075 to a BigInt')).toBe(true)
    })

    it('ignores unrelated errors', () => {
      expect(isBigIntSerializationError('insufficient funds for gas * price + value')).toBe(false)
    })
  })

  describe('buildRpcTransactionRequest', () => {
    it('serializes value and fee overrides as hex for eth_sendTransaction', () => {
      expect(buildRpcTransactionRequest({
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        data: '0x1234',
        value: 0n,
        maxFeePerGas: 78_000_000_075n,
        maxPriorityFeePerGas: 78_000_000_000n,
      })).toEqual({
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        data: '0x1234',
        value: '0x0',
        maxFeePerGas: '0x1229298c4b',
        maxPriorityFeePerGas: '0x1229298c00',
      })
    })
  })

  describe('mapSignatureFlowErrorForUser', () => {
    it('maps bigint parsing failures to the wallet provider guidance', () => {
      expect(mapSignatureFlowErrorForUser('Failed to parse String to BigInt'))
        .toBe('Could not send transaction with this wallet provider. Please retry or switch wallet.')
    })
  })
})
