import { describe, expect, test } from 'bun:test'

import { sourceOutcomeFromCondition } from '@/lib/communities/imports'

describe('sourceOutcomeFromCondition', () => {
  test('open conditions have no outcome yet', () => {
    expect(sourceOutcomeFromCondition({ resolved: false, resolution_price: '1' })).toBeNull()
    expect(sourceOutcomeFromCondition({ resolved: true, resolution_price: null })).toBeNull()
    expect(sourceOutcomeFromCondition({ resolved: null, resolution_price: '0' })).toBeNull()
  })

  test('maps UMA prices to yes, no and void', () => {
    expect(sourceOutcomeFromCondition({ resolved: true, resolution_price: '1.000000' })).toBe('yes')
    expect(sourceOutcomeFromCondition({ resolved: true, resolution_price: 1 })).toBe('yes')
    expect(sourceOutcomeFromCondition({ resolved: true, resolution_price: '0' })).toBe('no')
    expect(sourceOutcomeFromCondition({ resolved: true, resolution_price: '0.5' })).toBe('cancelled')
    expect(sourceOutcomeFromCondition({ resolved: true, resolution_price: 'nope' })).toBeNull()
  })
})
