import { describe, expect, it } from 'bun:test'

import { assertPoolJuryReady, MIN_POOL_JURY_SIZE, validatePoolJurySize } from '@/lib/pools/jury'

describe('pool jury rules', () => {
  it('requires at least three seats for a pool community', () => {
    expect(MIN_POOL_JURY_SIZE).toBe(3)
    expect(validatePoolJurySize(1)).toMatch(/at least 3/)
    expect(validatePoolJurySize(2)).toMatch(/at least 3/)
    expect(validatePoolJurySize(2.5)).toMatch(/at least 3/)
    expect(validatePoolJurySize(3)).toBeNull()
    expect(validatePoolJurySize(10)).toBeNull()
  })

  it('blocks a pool market until enough jurors are seated', () => {
    expect(assertPoolJuryReady({ jurySize: 3, seatedJurors: 1 })).toMatch(/1 seated juror but needs 3/)
    expect(assertPoolJuryReady({ jurySize: 3, seatedJurors: 2 })).toMatch(/2 seated jurors but needs 3/)
    expect(assertPoolJuryReady({ jurySize: 3, seatedJurors: 3 })).toBeNull()
    expect(assertPoolJuryReady({ jurySize: 5, seatedJurors: 3 })).toMatch(/needs 5/)
    expect(assertPoolJuryReady({ jurySize: 5, seatedJurors: 7 })).toBeNull()
  })

  it('never accepts fewer than three seated jurors even for a legacy jury of one', () => {
    expect(assertPoolJuryReady({ jurySize: 1, seatedJurors: 1 })).toMatch(/needs 3/)
    expect(assertPoolJuryReady({ jurySize: 1, seatedJurors: 3 })).toBeNull()
  })
})
