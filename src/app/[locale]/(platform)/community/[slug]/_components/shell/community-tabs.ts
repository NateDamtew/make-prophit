/**
 * The community home's tabs. Shared by the server page (which reads
 * `?tab=`) and the client tab strip.
 */

export type CommunityTab = 'markets' | 'activity' | 'members' | 'jury' | 'reviews' | 'about'

export const COMMUNITY_TABS: CommunityTab[] = ['markets', 'activity', 'members', 'jury', 'reviews', 'about']

export function isCommunityTab(value: string | undefined): value is CommunityTab {
  return value !== undefined && (COMMUNITY_TABS as string[]).includes(value)
}
