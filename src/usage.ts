/** Read-only subscription windows. This backend is experimental, not a public billing API. */
import { accountIdFromAccess } from './codex-auth.ts'
import type { CodexUsageSnapshot, CodexUsageWindow } from './types.ts'

const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const MAX_RESPONSE_BYTES = 64 * 1024

export class UsageQueryError extends Error {
  constructor() { super('Subscription limits are temporarily unavailable') }
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined

/** Normalize only server-provided windows; absent windows remain unknown. */
export function usageWindows(value: unknown): readonly CodexUsageWindow[] {
  const body = record(value)
  if (!body || !('rate_limit' in body)) throw new UsageQueryError()
  if (body.rate_limit === null) return []
  const limits = record(body.rate_limit)
  if (!limits) throw new UsageQueryError()
  const windows: CodexUsageWindow[] = []
  for (const key of ['primary_window', 'secondary_window']) {
    const raw = limits[key]
    if (raw === null || raw === undefined) continue
    const window = record(raw)
    const seconds = window?.limit_window_seconds
    const used = window?.used_percent
    const reset = window?.reset_at
    if (typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds <= 0
      || typeof used !== 'number' || !Number.isFinite(used) || used < 0 || used > 100
      || (reset !== null && reset !== undefined && (typeof reset !== 'number'
        || !Number.isSafeInteger(reset) || reset < 0 || reset > 8_640_000_000_000))) throw new UsageQueryError()
    windows.push({ windowDurationMins: seconds / 60, usedPercent: used, resetsAt: typeof reset === 'number' ? reset : null })
  }
  return windows
}

/** Fetch with the plugin-owned access token; neither raw responses nor credentials cross Remote. */
export async function fetchUsage(fetcher: typeof fetch, access: string, signal: AbortSignal): Promise<CodexUsageSnapshot> {
  try {
    const response = await fetcher(USAGE_URL, {
      headers: { Authorization: `Bearer ${access}`, 'ChatGPT-Account-ID': accountIdFromAccess(access) },
      redirect: 'error', signal,
    })
    if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')
      || Number(response.headers.get('content-length') ?? 0) > MAX_RESPONSE_BYTES || !response.body) {
      await response.body?.cancel()
      throw new UsageQueryError()
    }
    const reader = response.body.getReader()
    const pieces: Uint8Array[] = []
    let length = 0
    try {
      for (;;) {
        signal.throwIfAborted()
        const { value, done } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > MAX_RESPONSE_BYTES) throw new UsageQueryError()
        pieces.push(value)
      }
    } finally { await reader.cancel().catch(() => {}) }
    signal.throwIfAborted()
    const windows = usageWindows(JSON.parse(Buffer.concat(pieces, length).toString('utf8')))
    return { windows, checkedAt: new Date().toISOString() }
  } catch {
    // Provider errors, bodies and authorization headers must never become Remote errors.
    throw new UsageQueryError()
  }
}

/** Coalesce reads and retain the last successful snapshot without crossing account lifetimes. */
export class UsageReader {
  private cached: { snapshot: CodexUsageSnapshot; at: number } | undefined
  private task: Promise<CodexUsageSnapshot> | undefined
  private generation = 0

  constructor(private readonly load: () => Promise<CodexUsageSnapshot>, private readonly now = Date.now) {}

  read(refresh = false): Promise<CodexUsageSnapshot> {
    if (this.task) return this.task
    if (!refresh && this.cached && this.now() - this.cached.at < 60_000) return Promise.resolve(this.cached.snapshot)
    const generation = this.generation
    const task = Promise.resolve().then(this.load).then(snapshot => {
      if (generation !== this.generation) throw new UsageQueryError()
      this.cached = { snapshot, at: this.now() }
      return snapshot
    }).finally(() => { if (this.task === task) this.task = undefined })
    this.task = task
    return task
  }

  reset(): void {
    this.generation++
    this.cached = undefined
    this.task = undefined
  }
}
