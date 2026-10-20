import type { AdminActor } from '@/lib/admin-ui/guard'

import { getAdminActor } from '@/lib/admin-ui/guard'

/**
 * Finance capability on top of admin. Money-creating operations (manual
 * adjustments, forcing an intent to completed, flipping pause switches off)
 * require it. Configured with MOBILE_MONEY_FINANCE_ADMINS (comma-separated
 * emails, usernames or wallet addresses). When the variable is unset every
 * admin qualifies, which is only acceptable while the rail is in sandbox.
 */

export interface FinanceActor extends AdminActor {
  is_finance: true
}

export function isFinanceIdentifier(label: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const configured = env.MOBILE_MONEY_FINANCE_ADMINS?.split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  if (!configured || configured.length === 0) {
    return true
  }
  return Boolean(label && configured.includes(label.trim().toLowerCase()))
}

export function financeGuardIsOpen(env: NodeJS.ProcessEnv = process.env): boolean {
  return !env.MOBILE_MONEY_FINANCE_ADMINS?.trim()
}

export async function getFinanceActor(): Promise<FinanceActor | null> {
  const actor = await getAdminActor()
  if (!actor) {
    return null
  }
  // Admin labels are username || email || address; check each candidate.
  const candidates = actor.label.split('|').map((item) => item.trim())
  if (!candidates.some((candidate) => isFinanceIdentifier(candidate))) {
    return null
  }
  return { ...actor, is_finance: true }
}
