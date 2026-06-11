// Client-safe constants (no DB imports) so client components can use them
// without pulling server-only code into the browser bundle.
export const SYNC_JOB_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const
export type SyncJobStatus = (typeof SYNC_JOB_STATUSES)[number]
