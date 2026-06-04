import type { QueryResult } from '@/types'
import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { agents } from '@/lib/db/schema/agents/tables'
import { users } from '@/lib/db/schema/auth/tables'
import { runQuery } from '@/lib/db/utils/run-query'
import { db } from '@/lib/drizzle'

const API_KEY_PREFIX = 'pro_'
const API_KEY_BYTES = 24 // 24 raw bytes → 48 base64url chars → ~256-bit entropy
const API_KEY_DISPLAY_PREFIX_LENGTH = 12 // `pro_` + first 8 random chars (what we display masked)
// Only refresh last_active_at when it's older than this, so reads don't write
// on every request.
const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000

export interface AgentRecord {
  id: string
  user_id: string
  slug: string
  name: string
  description: string | null
  avatar_url: string | null
  api_key_prefix: string
  scopes: string[]
  status: 'active' | 'paused' | 'revoked'
  is_public: boolean
  daily_limit_usd: string | null
  total_limit_usd: string | null
  daily_spent_usd: string
  total_spent_usd: string
  total_volume_usd: string
  total_pnl_usd: string
  total_trades: number
  win_count: number
  created_at: Date
  updated_at: Date
  last_active_at: Date | null
}

export interface PublicAgentRecord extends AgentRecord {
  owner_username: string | null
  owner_image: string | null
}

export interface CreateAgentInput {
  user_id: string
  name: string
  description?: string | null
  avatar_url?: string | null
  is_public?: boolean
  daily_limit_usd?: number | null
  total_limit_usd?: number | null
}

export interface UpdateAgentInput {
  name?: string
  description?: string | null
  avatar_url?: string | null
  is_public?: boolean
  status?: 'active' | 'paused'
  daily_limit_usd?: number | null
  total_limit_usd?: number | null
}

/**
 * Generates a new API key. The raw key is shown to the owner exactly once
 * (returned from create/rotate); only the hash + display prefix are persisted.
 *
 * Format: `pro_<base64url(24 bytes)>` — URL-safe, copy-pasteable, ~256-bit entropy.
 */
function generateApiKey() {
  const raw = `${API_KEY_PREFIX}${randomBytes(API_KEY_BYTES).toString('base64url')}`
  const hash = createHash('sha256').update(raw).digest('hex')
  const displayPrefix = raw.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH)
  return { raw, hash, displayPrefix }
}

/**
 * Generates a URL-friendly slug from the agent name. We append a short random
 * suffix to keep the lookup unique without forcing the owner to pick one.
 */
function generateAgentSlug(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 40)
  const suffix = randomBytes(3).toString('hex')
  return base ? `${base}-${suffix}` : `agent-${suffix}`
}

function normalizeLimit(value: number | null | undefined) {
  if (value === undefined || value === null) {
    return null
  }
  if (!Number.isFinite(value) || value < 0) {
    return null
  }
  return value.toFixed(6)
}

export const AgentRepository = {
  async create(input: CreateAgentInput): Promise<QueryResult<{ agent: AgentRecord, rawApiKey: string }>> {
    return runQuery(async () => {
      const { raw, hash, displayPrefix } = generateApiKey()
      const slug = generateAgentSlug(input.name)

      const [row] = await db
        .insert(agents)
        .values({
          user_id: input.user_id,
          slug,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          avatar_url: input.avatar_url?.trim() || null,
          api_key_hash: hash,
          api_key_prefix: displayPrefix,
          is_public: input.is_public ?? true,
          daily_limit_usd: normalizeLimit(input.daily_limit_usd),
          total_limit_usd: normalizeLimit(input.total_limit_usd),
        })
        .returning()

      if (!row) {
        return { data: null, error: 'Failed to create agent.' }
      }

      return { data: { agent: row as AgentRecord, rawApiKey: raw }, error: null }
    })
  },

  async listByUser(userId: string): Promise<QueryResult<AgentRecord[]>> {
    return runQuery(async () => {
      const rows = await db
        .select()
        .from(agents)
        .where(eq(agents.user_id, userId))
        .orderBy(desc(agents.created_at))
      return { data: rows as AgentRecord[], error: null }
    })
  },

  async getById(id: string, userId: string): Promise<QueryResult<AgentRecord | null>> {
    return runQuery(async () => {
      const [row] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, id), eq(agents.user_id, userId)))
        .limit(1)
      return { data: (row as AgentRecord | undefined) ?? null, error: null }
    })
  },

  async getBySlugPublic(slug: string): Promise<QueryResult<PublicAgentRecord | null>> {
    return runQuery(async () => {
      const [row] = await db
        .select({
          agent: agents,
          owner_username: users.username,
          owner_image: users.image,
        })
        .from(agents)
        .leftJoin(users, eq(agents.user_id, users.id))
        .where(and(eq(agents.slug, slug), eq(agents.is_public, true)))
        .limit(1)

      if (!row) {
        return { data: null, error: null }
      }
      return {
        data: {
          ...(row.agent as AgentRecord),
          owner_username: row.owner_username ?? null,
          owner_image: row.owner_image ?? null,
        },
        error: null,
      }
    })
  },

  async update(id: string, userId: string, input: UpdateAgentInput): Promise<QueryResult<AgentRecord>> {
    return runQuery(async () => {
      const payload: Record<string, unknown> = {}
      if (input.name !== undefined) {
        payload.name = input.name.trim()
      }
      if (input.description !== undefined) {
        payload.description = input.description?.trim() || null
      }
      if (input.avatar_url !== undefined) {
        payload.avatar_url = input.avatar_url?.trim() || null
      }
      if (input.is_public !== undefined) {
        payload.is_public = input.is_public
      }
      if (input.status !== undefined) {
        payload.status = input.status
      }
      if (input.daily_limit_usd !== undefined) {
        payload.daily_limit_usd = normalizeLimit(input.daily_limit_usd)
      }
      if (input.total_limit_usd !== undefined) {
        payload.total_limit_usd = normalizeLimit(input.total_limit_usd)
      }

      if (Object.keys(payload).length === 0) {
        const [unchanged] = await db
          .select()
          .from(agents)
          .where(and(eq(agents.id, id), eq(agents.user_id, userId)))
          .limit(1)
        if (!unchanged) {
          return { data: null, error: 'Agent not found.' }
        }
        return { data: unchanged as AgentRecord, error: null }
      }

      const [row] = await db
        .update(agents)
        .set(payload)
        .where(and(eq(agents.id, id), eq(agents.user_id, userId)))
        .returning()

      if (!row) {
        return { data: null, error: 'Agent not found.' }
      }
      return { data: row as AgentRecord, error: null }
    })
  },

  async rotateApiKey(id: string, userId: string): Promise<QueryResult<{ agent: AgentRecord, rawApiKey: string }>> {
    return runQuery(async () => {
      const { raw, hash, displayPrefix } = generateApiKey()
      const [row] = await db
        .update(agents)
        .set({ api_key_hash: hash, api_key_prefix: displayPrefix })
        .where(and(eq(agents.id, id), eq(agents.user_id, userId)))
        .returning()
      if (!row) {
        return { data: null, error: 'Agent not found.' }
      }
      return { data: { agent: row as AgentRecord, rawApiKey: raw }, error: null }
    })
  },

  async delete(id: string, userId: string): Promise<QueryResult<boolean>> {
    return runQuery(async () => {
      const result = await db
        .delete(agents)
        .where(and(eq(agents.id, id), eq(agents.user_id, userId)))
        .returning({ id: agents.id })
      return { data: result.length > 0, error: null }
    })
  },

  /**
   * Public leaderboard rows. Sorted by total_pnl_usd by default; the page can
   * pass an alternate sort (volume, win-rate, etc.) once the data is real.
   */
  async leaderboard(options: { limit?: number, sort?: 'pnl' | 'volume' | 'trades' } = {}): Promise<QueryResult<PublicAgentRecord[]>> {
    return runQuery(async () => {
      const limit = options.limit ?? 50
      const orderBy = options.sort === 'volume'
        ? desc(agents.total_volume_usd)
        : options.sort === 'trades'
          ? desc(agents.total_trades)
          : desc(agents.total_pnl_usd)

      const rows = await db
        .select({
          agent: agents,
          owner_username: users.username,
          owner_image: users.image,
        })
        .from(agents)
        .leftJoin(users, eq(agents.user_id, users.id))
        .where(and(
          eq(agents.status, 'active'),
          eq(agents.is_public, true),
          isNotNull(agents.last_active_at),
        ))
        .orderBy(orderBy)
        .limit(limit)

      return {
        data: rows.map(row => ({
          ...(row.agent as AgentRecord),
          owner_username: row.owner_username ?? null,
          owner_image: row.owner_image ?? null,
        })),
        error: null,
      }
    })
  },

  /**
   * Authenticate a raw API key, return the agent if valid + active. Used by
   * the public API + MCP server when an agent makes a request. We hash the
   * incoming key and look it up — never store or compare raw keys.
   */
  async authenticate(rawKey: string): Promise<QueryResult<AgentRecord | null>> {
    return runQuery(async () => {
      if (!rawKey || !rawKey.startsWith(API_KEY_PREFIX)) {
        return { data: null, error: null }
      }
      const hash = createHash('sha256').update(rawKey).digest('hex')
      const [row] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.api_key_hash, hash), eq(agents.status, 'active')))
        .limit(1)

      if (row) {
        // Throttle last_active_at updates so we don't write to the row on every
        // single read request (which would also bump updated_at via the trigger
        // and cause write amplification / lock contention under load). Only
        // update if it's stale by more than the throttle window, and fire it
        // off without awaiting so the read response isn't blocked.
        const lastActive = row.last_active_at ? new Date(row.last_active_at).getTime() : 0
        if (Date.now() - lastActive > LAST_ACTIVE_THROTTLE_MS) {
          void db
            .update(agents)
            .set({ last_active_at: sql`now()` })
            .where(eq(agents.id, row.id))
            .catch(() => {
              // best-effort; never fail a read because activity tracking hiccuped
            })
        }
      }

      return { data: (row as AgentRecord | undefined) ?? null, error: null }
    })
  },
}
