'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { AgentRepository } from '@/lib/db/queries/agents'
import { UserRepository } from '@/lib/db/queries/user'

const AgentDraftSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  description: z.string().trim().max(500).optional(),
  avatar_url: z
    .string()
    .trim()
    .max(500)
    .url('Avatar URL must be a valid URL')
    .optional()
    .or(z.literal('')),
  is_public: z.boolean().default(true),
  daily_limit_usd: z.number().nonnegative().max(1_000_000).nullable().optional(),
  total_limit_usd: z.number().nonnegative().max(1_000_000).nullable().optional(),
})

const AgentUpdateSchema = AgentDraftSchema.extend({
  status: z.enum(['active', 'paused']).optional(),
}).partial()

async function requireUser() {
  return UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
}

export async function createAgentAction(input: z.input<typeof AgentDraftSchema>) {
  const user = await requireUser()
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  const parsed = AgentDraftSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? DEFAULT_ERROR_MESSAGE, data: null }
  }

  const result = await AgentRepository.create({
    user_id: user.id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    avatar_url: parsed.data.avatar_url || null,
    is_public: parsed.data.is_public,
    daily_limit_usd: parsed.data.daily_limit_usd ?? null,
    total_limit_usd: parsed.data.total_limit_usd ?? null,
  })

  if (result.error || !result.data) {
    return { error: result.error ?? DEFAULT_ERROR_MESSAGE, data: null }
  }

  revalidatePath('/settings/agents', 'layout')
  return { error: null, data: result.data }
}

export async function updateAgentAction(agentId: string, input: z.input<typeof AgentUpdateSchema>) {
  const user = await requireUser()
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  const parsed = AgentUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? DEFAULT_ERROR_MESSAGE, data: null }
  }

  const result = await AgentRepository.update(agentId, user.id, {
    ...parsed.data,
    avatar_url: parsed.data.avatar_url === '' ? null : parsed.data.avatar_url,
  })

  if (result.error || !result.data) {
    return { error: result.error ?? DEFAULT_ERROR_MESSAGE, data: null }
  }

  revalidatePath('/settings/agents', 'layout')
  return { error: null, data: result.data }
}

export async function rotateAgentApiKeyAction(agentId: string) {
  const user = await requireUser()
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  const result = await AgentRepository.rotateApiKey(agentId, user.id)
  if (result.error || !result.data) {
    return { error: result.error ?? DEFAULT_ERROR_MESSAGE, data: null }
  }

  revalidatePath('/settings/agents', 'layout')
  return { error: null, data: result.data }
}

export async function deleteAgentAction(agentId: string) {
  const user = await requireUser()
  if (!user) {
    return { error: 'Unauthenticated.', data: null }
  }

  const result = await AgentRepository.delete(agentId, user.id)
  if (result.error) {
    return { error: result.error, data: null }
  }

  revalidatePath('/settings/agents', 'layout')
  return { error: null, data: result.data }
}
