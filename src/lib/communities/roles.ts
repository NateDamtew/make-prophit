/**
 * Community team roles and what each may do. Pure — safe for client code.
 *
 *  admin      the owner: everything
 *  co_owner   everything the owner does; keeps the community running if the owner steps away
 *  editor     writes and edits markets; no money, no jury, no settings
 *  moderator  comments and evidence clean-up only
 *  juror      votes on markets
 *  member     stakes, comments, reviews, backs appeals
 */

const COMMUNITY_ROLES = ['admin', 'co_owner', 'editor', 'moderator', 'juror', 'member'] as const

export type CommunityRole = (typeof COMMUNITY_ROLES)[number]

export type CommunityCapability = 'settings' | 'members' | 'markets' | 'moderate' | 'jury_vote' | 'owner_money'

const CAPABILITIES: Record<CommunityRole, readonly CommunityCapability[]> = {
  admin: ['settings', 'members', 'markets', 'moderate', 'jury_vote', 'owner_money'],
  co_owner: ['settings', 'members', 'markets', 'moderate', 'jury_vote', 'owner_money'],
  editor: ['markets'],
  moderator: ['moderate'],
  juror: ['jury_vote'],
  member: [],
}

export function isCommunityRole(value: unknown): value is CommunityRole {
  return typeof value === 'string' && (COMMUNITY_ROLES as readonly string[]).includes(value)
}

/** Whether a member with `role` may do `capability`. A null role (not a member) may do nothing. */
export function can(role: string | null | undefined, capability: CommunityCapability): boolean {
  if (!isCommunityRole(role)) {
    return false
  }
  return CAPABILITIES[role].includes(capability)
}

/** Owner-level roles: the ones that count as "admin" everywhere the old code checked `role === 'admin'`. */
export function isOwnerRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'co_owner'
}

/** Roles that sit on the jury. Owners count as jurors, as before. */
export function isJurorRole(role: string | null | undefined): boolean {
  return role === 'juror' || isOwnerRole(role)
}

export const ROLE_LABELS: Record<CommunityRole, string> = {
  admin: 'Owner',
  co_owner: 'Co-owner',
  editor: 'Editor',
  moderator: 'Moderator',
  juror: 'Juror',
  member: 'Member',
}
