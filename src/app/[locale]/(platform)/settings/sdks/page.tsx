import { redirect } from 'next/navigation'

/**
 * /settings/sdks → /settings/agents
 *
 * SDK Downloads were consolidated into the Agents hub (developer-tooling lives
 * under one tab now). This redirect preserves any existing links/bookmarks.
 */
export default function LegacySdksRedirect() {
  redirect('/settings/agents')
}
