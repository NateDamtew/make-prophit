import { notFound } from 'next/navigation'
import { UserRepository } from '@/lib/db/queries/user'

export interface AdminActor {
  id: string
  label: string
  is_admin: boolean
}

function toActorLabel(user: any): string {
  return (
    user?.username
    || user?.name
    || user?.email
    || user?.address
    || user?.id
    || 'unknown'
  )
}

/**
 * Resolves the current user and asserts they are an admin. Use in server
 * components for new dashboard pages. Non-admins (and signed-out users) get a
 * 404 rather than a redirect so the dashboard's existence isn't advertised.
 *
 * Existing upstream admin pages gate at the API/action layer; new pages call
 * this for a stronger, page-level guard.
 */
export async function requireAdmin(): Promise<AdminActor> {
  const user = await UserRepository.getCurrentUser({ minimal: true })

  if (!user || !user.is_admin) {
    notFound()
  }

  return {
    id: user.id,
    label: toActorLabel(user),
    is_admin: true,
  }
}

/**
 * Resolves the current admin actor for API routes / server actions without
 * throwing a 404. Returns `null` when the caller is not an admin so the route
 * can respond with an explicit 401/403.
 */
export async function getAdminActor(): Promise<AdminActor | null> {
  const user = await UserRepository.getCurrentUser({ minimal: true })

  if (!user || !user.is_admin) {
    return null
  }

  return {
    id: user.id,
    label: toActorLabel(user),
    is_admin: true,
  }
}
