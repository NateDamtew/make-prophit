import type { AgentRecord } from '@/lib/db/queries/agents'
import { NextResponse } from 'next/server'
import { AgentRepository } from '@/lib/db/queries/agents'

/**
 * Standard CORS headers for `/api/v1/*` so any web app, MCP client, or browser
 * agent can call us. We mirror the existing embed-CORS shape and add the
 * `Authorization` header for optional agent-key auth.
 */
export function withAgentApiCors(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Max-Age', '86400')
  return response
}

/**
 * Look up the raw API key from the request's `Authorization: Bearer <key>` header.
 * Read endpoints are **public** — auth is optional. We still parse it so we can
 * (later) raise rate limits for authenticated agents and track per-agent usage.
 *
 * Returns null when no key is present or the key is invalid. We never throw —
 * unknown keys just get the anonymous experience.
 */
export async function resolveAgent(request: Request): Promise<AgentRecord | null> {
  const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization')
  if (!authHeader) {
    return null
  }
  const match = authHeader.match(/^Bearer\s+(\S+)$/i)
  if (!match) {
    return null
  }
  const { data } = await AgentRepository.authenticate(match[1] ?? '')
  return data ?? null
}

/**
 * Consistent error envelope. We always return JSON so agents don't have to
 * special-case HTML error pages from the framework.
 */
export function agentApiError(message: string, status: number) {
  return withAgentApiCors(
    NextResponse.json({ error: message, status }, { status }),
  )
}
