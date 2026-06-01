/**
 * Pure constants and helpers for community feature.
 * No DB imports — safe to use in client components.
 */

const JURY_CAPACITY: Record<number, number> = {
  1: 5,
  2: 20,
  3: 30,
  4: 40,
  5: 50,
  6: 100,
  7: 200,
  8: 500,
  9: 750,
  10: 1000,
}

export function getMaxMembersForJurySize(jurySize: number): number {
  return JURY_CAPACITY[jurySize] ?? 5
}

export function getConsensusThreshold(jurySize: number): number {
  if (jurySize <= 2) {
    return jurySize // unanimous
  }
  return Math.ceil(jurySize * 0.75) // >75%
}
