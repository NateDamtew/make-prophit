/**
 * Jury rules for pool-tier communities. Pure — no database imports, safe for
 * client components.
 *
 * A pool market settles real balances on the jury's word alone (no on-chain
 * oracle, no dispute window), so a jury of one would make a single member the
 * oracle for everyone's money. Pool communities therefore need at least three
 * seats, and a pool market may only go live once that many jurors are seated.
 */
export const MIN_POOL_JURY_SIZE = 3

export const POOL_JURY_SIZE_MESSAGE = `Communities need a jury of at least ${MIN_POOL_JURY_SIZE} so no single member decides how markets settle.`

/** Returns an error message when a pool-tier community's jury size is too small, else null. */
export function validatePoolJurySize(jurySize: number): string | null {
  if (!Number.isInteger(jurySize) || jurySize < MIN_POOL_JURY_SIZE) {
    return POOL_JURY_SIZE_MESSAGE
  }
  return null
}

/**
 * Returns an error message when a pool market may not go live because too few
 * jurors are seated (admins count as jurors), else null.
 */
export function assertPoolJuryReady(params: { jurySize: number; seatedJurors: number }): string | null {
  const required = Math.max(params.jurySize, MIN_POOL_JURY_SIZE)
  if (params.seatedJurors < required) {
    return `This community has ${params.seatedJurors} seated ${params.seatedJurors === 1 ? 'juror' : 'jurors'} but needs ${required} before a pool market can go live. Seat more jurors under Members first.`
  }
  return null
}
