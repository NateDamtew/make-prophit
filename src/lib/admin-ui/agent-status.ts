// Client-safe constants (no DB imports).
export const AGENT_STATUSES = ['active', 'paused', 'revoked'] as const
export type AgentStatus = (typeof AGENT_STATUSES)[number]
