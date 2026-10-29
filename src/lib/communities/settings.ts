import { eq } from 'drizzle-orm'

import type { AppealSettings } from '@/lib/communities/appeals-math'
import type { HoldSettings } from '@/lib/communities/hold'
import type { CommunityLevel, JuryBand, LevelCaps, ReviewMode } from '@/lib/communities/rules'

import { DEFAULT_APPEAL_SETTINGS } from '@/lib/communities/appeals-math'
import { DEFAULT_HOLD_SETTINGS } from '@/lib/communities/hold'
import { DEFAULT_JURY_BANDS, DEFAULT_LEVEL_CAPS } from '@/lib/communities/rules'
import { settings } from '@/lib/db/schema/settings/tables'
import { db } from '@/lib/drizzle'

/**
 * Non-secret configuration for Communities, stored in the `settings` table
 * under one group so Prophit admins can tune every limit without a deploy.
 * Mirrors `src/lib/mobile-money/settings.ts`: JSON values, bigints as
 * strings, a `:<CCY>` suffix for anything denominated in money.
 */

export const COMMUNITY_SETTINGS_GROUP = 'communities'
export const COMMUNITY_JURY_KEY = 'jury'
export const COMMUNITY_HOLD_KEY = 'payout_hold'
export const COMMUNITY_APPEALS_KEY = 'appeals'
export const COMMUNITY_LEVELS_KEY_PREFIX = 'levels:'
export const COMMUNITY_STAKES_KEY_PREFIX = 'stakes:'
export const COMMUNITY_REQUIRE_APPLICATION_KEY = 'require_application'
export const COMMUNITY_PROPHIT_IDS_KEY = 'prophit_community_ids'

export interface CommunityJurySettings {
  bands: JuryBand[]
  /** Hours after a market's resolution date the jury has to vote before every stake is refunded. */
  windowHours: number
  /** Shortest written verdict a juror may submit. */
  minReasonChars: number
}

export interface CommunityStakeSettings {
  currency: string
  minStakeMinor: bigint
}

export interface CommunitySettings {
  jury: CommunityJurySettings
  levels: Record<CommunityLevel, LevelCaps>
  stakes: CommunityStakeSettings
  hold: HoldSettings
  appeals: AppealSettings
  requireApplication: boolean
  prophitCommunityIds: string[]
}

type SettingsMap = Record<string, Record<string, { value: string }>>

const DEFAULT_JURY_SETTINGS: CommunityJurySettings = {
  bands: [...DEFAULT_JURY_BANDS],
  windowHours: 72,
  minReasonChars: 80,
}

const DEFAULT_STAKE_SETTINGS: CommunityStakeSettings = {
  currency: 'KES',
  minStakeMinor: 2_000n, // 20 KES
}

function readJsonObject(raw: string | undefined): Record<string, unknown> {
  if (!raw) {
    return {}
  }
  try {
    const value = JSON.parse(raw) as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
  } catch {
    // fall through
  }
  return {}
}

function readBigint(value: unknown, fallback: bigint): bigint {
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value))
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim())
  }
  return fallback
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  return fallback
}

function readReviewMode(value: unknown, fallback: ReviewMode): ReviewMode {
  return value === 'every' || value === 'spot' || value === 'none' ? value : fallback
}

function readBands(value: unknown, fallback: JuryBand[]): JuryBand[] {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback
  }
  const bands: JuryBand[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const record = item as Record<string, unknown>
    const seats = Math.round(readNumber(record.seats, Number.NaN))
    if (!Number.isFinite(seats) || seats < 1) {
      continue
    }
    const max = record.maxMembers === null ? null : Math.round(readNumber(record.maxMembers, Number.NaN))
    bands.push({ maxMembers: max === null || !Number.isFinite(max) ? null : max, seats })
  }
  // Bands must be ascending with a final open-ended one; otherwise keep the defaults.
  if (bands.length === 0 || bands[bands.length - 1]?.maxMembers !== null) {
    return fallback
  }
  for (let index = 1; index < bands.length; index++) {
    const previous = bands[index - 1]?.maxMembers ?? Number.POSITIVE_INFINITY
    const current = bands[index]?.maxMembers ?? Number.POSITIVE_INFINITY
    if (current <= previous) {
      return fallback
    }
  }
  return bands
}

export function parseJurySettings(raw: string | undefined): CommunityJurySettings {
  const parsed = readJsonObject(raw)
  return {
    bands: readBands(parsed.bands, DEFAULT_JURY_SETTINGS.bands),
    windowHours: Math.max(1, Math.round(readNumber(parsed.windowHours, DEFAULT_JURY_SETTINGS.windowHours))),
    minReasonChars: Math.max(0, Math.round(readNumber(parsed.minReasonChars, DEFAULT_JURY_SETTINGS.minReasonChars))),
  }
}

function parseLevelCaps(level: CommunityLevel, raw: unknown): LevelCaps {
  const base = DEFAULT_LEVEL_CAPS[level]
  const parsed = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const ownerShareBps = Math.max(0, Math.round(readNumber(parsed.ownerShareBps, base.ownerShareBps)))
  const juryShareBps = Math.max(0, Math.round(readNumber(parsed.juryShareBps, base.juryShareBps)))
  const splitTotal = ownerShareBps + juryShareBps
  return {
    level,
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : base.name,
    rakeBps: Math.max(0, Math.min(2_000, Math.round(readNumber(parsed.rakeBps, base.rakeBps)))),
    ownerShareBps: Math.min(10_000, ownerShareBps),
    juryShareBps: Math.min(10_000 - Math.min(10_000, ownerShareBps), juryShareBps),
    prophitShareBps: Math.max(0, 10_000 - Math.min(10_000, splitTotal)),
    maxMembers: Math.max(1, Math.round(readNumber(parsed.maxMembers, base.maxMembers))),
    maxPoolPerMarketMinor: readBigint(parsed.maxPoolPerMarketMinor, base.maxPoolPerMarketMinor),
    maxPerPersonMinor: readBigint(parsed.maxPerPersonMinor, base.maxPerPersonMinor),
    reviewMode: readReviewMode(parsed.reviewMode, base.reviewMode),
    spotCheckRate: Math.max(0, Math.min(1, readNumber(parsed.spotCheckRate, base.spotCheckRate))),
  }
}

/** Parse one `levels:<CCY>` JSON value (`{"0": {...}, "1": {...}, "2": {...}}`) on top of the defaults. */
export function parseLevelSettings(raw: string | undefined): Record<CommunityLevel, LevelCaps> {
  const parsed = readJsonObject(raw)
  return {
    0: parseLevelCaps(0, parsed['0']),
    1: parseLevelCaps(1, parsed['1']),
    2: parseLevelCaps(2, parsed['2']),
  }
}

function parseAppealSettings(raw: string | undefined): AppealSettings {
  const parsed = readJsonObject(raw)
  return {
    minBackMinor: readBigint(parsed.minBackMinor, DEFAULT_APPEAL_SETTINGS.minBackMinor),
    backersNeeded: Math.max(1, Math.round(readNumber(parsed.backersNeeded, DEFAULT_APPEAL_SETTINGS.backersNeeded))),
    poolShareBps: Math.max(0, Math.round(readNumber(parsed.poolShareBps, DEFAULT_APPEAL_SETTINGS.poolShareBps))),
    appealJurors: Math.max(0, Math.round(readNumber(parsed.appealJurors, DEFAULT_APPEAL_SETTINGS.appealJurors))),
  }
}

function parseHoldSettings(raw: string | undefined): HoldSettings {
  const parsed = readJsonObject(raw)
  const holdHours = Math.max(0, readNumber(parsed.holdHours, DEFAULT_HOLD_SETTINGS.holdHours))
  const appealMaxHours = Math.max(holdHours, readNumber(parsed.appealMaxHours, DEFAULT_HOLD_SETTINGS.appealMaxHours))
  return { holdHours, appealMaxHours }
}

export function parseStakeSettings(currency: string, raw: string | undefined): CommunityStakeSettings {
  const parsed = readJsonObject(raw)
  return {
    currency: currency.toUpperCase(),
    minStakeMinor: readBigint(parsed.minStakeMinor, DEFAULT_STAKE_SETTINGS.minStakeMinor),
  }
}

function readStringList(raw: string | undefined): string[] {
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    }
  } catch {
    // fall through
  }
  return []
}

export function parseCommunitySettings(settings: SettingsMap | undefined, currency = 'KES'): CommunitySettings {
  const group = settings?.[COMMUNITY_SETTINGS_GROUP]
  const code = currency.toUpperCase()
  return {
    jury: parseJurySettings(group?.[COMMUNITY_JURY_KEY]?.value),
    levels: parseLevelSettings(group?.[`${COMMUNITY_LEVELS_KEY_PREFIX}${code}`]?.value),
    stakes: parseStakeSettings(code, group?.[`${COMMUNITY_STAKES_KEY_PREFIX}${code}`]?.value),
    hold: parseHoldSettings(group?.[COMMUNITY_HOLD_KEY]?.value),
    appeals: parseAppealSettings(group?.[COMMUNITY_APPEALS_KEY]?.value),
    requireApplication: readBoolean(group?.[COMMUNITY_REQUIRE_APPLICATION_KEY]?.value, true),
    prophitCommunityIds: readStringList(group?.[COMMUNITY_PROPHIT_IDS_KEY]?.value),
  }
}

/**
 * Read the `communities` group straight from the table. The pool engine calls
 * this inside ledger transactions, crons and scripts, where Next's request
 * cache (`SettingsRepository.getSettings`) is not available.
 */
export async function getCommunitySettings(currency = 'KES'): Promise<CommunitySettings> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(eq(settings.group, COMMUNITY_SETTINGS_GROUP))
  const group: Record<string, { value: string }> = {}
  for (const row of rows) {
    group[row.key] = { value: row.value }
  }
  return parseCommunitySettings({ [COMMUNITY_SETTINGS_GROUP]: group }, currency)
}
