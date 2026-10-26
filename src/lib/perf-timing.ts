/**
 * Server timing for finding what makes a page slow: one log line per step,
 * `[perf] <label> <ms>ms`, readable with `vercel logs --query "[perf]"`.
 * Cached steps ('use cache') only log when they actually run, so a page
 * served from cache logs nothing. Uses performance.now(), which Next allows
 * in prerendering, unlike Date.now().
 */
export async function timeStep<T>(label: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try {
    return await run()
  } finally {
    console.info(`[perf] ${label} ${Math.round(performance.now() - start)}ms`)
  }
}
