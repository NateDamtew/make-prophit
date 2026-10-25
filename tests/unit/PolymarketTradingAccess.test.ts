import { describe, expect, it } from 'bun:test'

import { getPolymarketBuilderCode, resolvePolymarketTradingAccess } from '@/lib/polymarket/trading-access'

const kenya = new Headers({ 'cf-ipcountry': 'KE' })
const tester = { id: 'user-1', email: 'Tester@Example.com', address: '0xAbC', is_admin: false }

describe('polymarket trading access', () => {
  it('is off unless the mode is set', () => {
    expect(resolvePolymarketTradingAccess(tester, kenya, {}).reason).toBe('disabled')
  })

  it('needs a signed-in user', () => {
    expect(resolvePolymarketTradingAccess(null, kenya, { POLYMARKET_TRADING_MODE: 'all' }).reason).toBe(
      'unauthenticated',
    )
  })

  it('lets listed testers (id, email or wallet, any case) and admins in tester mode', () => {
    const env = { POLYMARKET_TRADING_MODE: 'testers', POLYMARKET_TRADING_TESTERS: ' tester@example.com ' }
    expect(resolvePolymarketTradingAccess(tester, kenya, env).allowed).toBe(true)
    expect(resolvePolymarketTradingAccess({ id: 'x', is_admin: true }, kenya, env).allowed).toBe(true)
    expect(resolvePolymarketTradingAccess({ id: 'x' }, kenya, env).reason).toBe('not-tester')
    expect(
      resolvePolymarketTradingAccess({ id: 'x', address: '0xabc' }, kenya, {
        ...env,
        POLYMARKET_TRADING_TESTERS: '0xABC',
      }).allowed,
    ).toBe(true)
  })

  it('refuses Polymarket-restricted regions', () => {
    const env = { POLYMARKET_TRADING_MODE: 'all' }
    expect(resolvePolymarketTradingAccess(tester, new Headers({ 'cf-ipcountry': 'ET' }), env).reason).toBe('region')
    expect(resolvePolymarketTradingAccess(tester, new Headers({ 'cf-ipcountry': 'US' }), env).reason).toBe('region')
    expect(resolvePolymarketTradingAccess(tester, kenya, env).allowed).toBe(true)
  })

  it('only accepts a bytes32 builder code', () => {
    expect(getPolymarketBuilderCode({ POLYMARKET_BUILDER_CODE: '0x1234' })).toBeNull()
    expect(getPolymarketBuilderCode({ POLYMARKET_BUILDER_CODE: `0x${'a'.repeat(64)}` })).toBe(`0x${'a'.repeat(64)}`)
  })
})
