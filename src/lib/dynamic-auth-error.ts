/**
 * Captures the last Dynamic auth-failure reason (from the SDK's onAuthFailure
 * event) so flows that drive Dynamic auth headlessly — like the TMA embedded
 * wallet init — can surface WHY it failed instead of silently timing out.
 * Temporary diagnostic aid.
 */
export const lastDynamicAuthError: { message: string | null } = { message: null }

export function describeAuthError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    return JSON.stringify(error).slice(0, 300)
  }
  catch {
    return String(error)
  }
}
