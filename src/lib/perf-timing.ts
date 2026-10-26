import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Server timing for finding what makes a page slow: one log line per step,
 * `[perf] <label> <ms>ms`, readable with `vercel logs --query "[perf]"`.
 * Cached steps ('use cache') only log when they actually run, so a page
 * served from cache logs nothing. Uses performance.now(), which Next allows
 * in prerendering, unlike Date.now().
 *
 * Inside `collectTimings` the steps are also returned to the caller, for
 * places where the logs can't be read (the home timing debug endpoint).
 */
export interface TimedStep {
  label: string
  startMs: number
  ms: number
}

interface TimingCollector {
  origin: number
  steps: TimedStep[]
}

const timingCollector = new AsyncLocalStorage<TimingCollector>()
// 'use cache' functions run outside the caller's async context, so steps inside
// them fall back to the collector of the run in progress (one at a time).
let activeCollector: TimingCollector | null = null

export async function timeStep<T>(label: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try {
    return await run()
  } finally {
    const ms = Math.round(performance.now() - start)
    console.info(`[perf] ${label} ${ms}ms`)
    const collector = timingCollector.getStore() ?? activeCollector
    collector?.steps.push({ label, startMs: Math.round(start - collector.origin), ms })
  }
}

export async function collectTimings<T>(run: () => Promise<T>) {
  const collector: TimingCollector = { origin: performance.now(), steps: [] }
  activeCollector = collector
  try {
    const result = await timingCollector.run(collector, run)
    return { result, totalMs: Math.round(performance.now() - collector.origin), steps: collector.steps }
  } finally {
    activeCollector = null
  }
}
