/**
 * The pick a person made before they had to sign up or deposit, kept in
 * sessionStorage so the stake sheet reopens with the same side and amount
 * after a reload (OAuth return, deposit prompt, a dropped connection).
 */

export interface StakeIntent {
  side: 'yes' | 'no'
  /** Whole major units as typed ("1000"). */
  amount: string
  savedAt: number
}

const KEY_PREFIX = 'community-stake-intent:'
const TTL_MS = 60 * 60 * 1000

function key(marketId: string) {
  return `${KEY_PREFIX}${marketId}`
}

export function saveStakeIntent(marketId: string, intent: Omit<StakeIntent, 'savedAt'>) {
  try {
    window.sessionStorage.setItem(key(marketId), JSON.stringify({ ...intent, savedAt: Date.now() }))
  } catch {
    // storage unavailable (private mode); nothing to keep
  }
}

export function readStakeIntent(marketId: string): StakeIntent | null {
  try {
    const raw = window.sessionStorage.getItem(key(marketId))
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as StakeIntent
    if (!parsed || (parsed.side !== 'yes' && parsed.side !== 'no') || Date.now() - parsed.savedAt > TTL_MS) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearStakeIntent(marketId: string) {
  try {
    window.sessionStorage.removeItem(key(marketId))
  } catch {
    // ignore
  }
}
