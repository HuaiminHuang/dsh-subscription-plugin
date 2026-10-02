import { describe, expect, it } from 'vitest'
import { UsageQueryError, UsageReader, usageWindows } from '../src/usage.ts'

// Shape verified against the authorized live backend; regression values contain no account usage.
const response = { rate_limit: {
  primary_window: { used_percent: 20, limit_window_seconds: 18000, reset_at: 1800000000 },
  secondary_window: { used_percent: 40, limit_window_seconds: 604800, reset_at: 1800100000 },
} }
const snapshot = { windows: usageWindows(response), checkedAt: '2026-10-02T05:00:00.000Z' }
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('subscription usage', () => {
  it('projects the observed backend fields without identity data', () => {
    expect(usageWindows(response)).toEqual([
      { windowDurationMins: 300, usedPercent: 20, resetsAt: 1800000000 },
      { windowDurationMins: 10080, usedPercent: 40, resetsAt: 1800100000 },
    ])
  })
  it('preserves absent windows and reset times as unknown', () => {
    expect(usageWindows({ rate_limit: null })).toEqual([])
    expect(usageWindows({ rate_limit: { primary_window: {
      used_percent: 20, limit_window_seconds: 18000,
    } } })[0]?.resetsAt).toBeNull()
  })
  it('rejects malformed provider data', () => {
    for (const value of [undefined, {}, { rate_limit: false }, { rate_limit: {
      primary_window: { used_percent: 101, limit_window_seconds: 18000 },
    } }]) expect(() => usageWindows(value)).toThrow(UsageQueryError)
  })
  it('coalesces requests and expires the cache after one minute', async () => {
    let now = 0
    let calls = 0
    const first = deferred<typeof snapshot>()
    const reader = new UsageReader(() => { calls++; return first.promise }, () => now)
    const pending = reader.read()
    expect(reader.read(true)).toBe(pending)
    first.resolve(snapshot)
    await pending
    expect(await reader.read()).toBe(snapshot)
    expect(calls).toBe(1)
    now = 60_000
    await reader.read()
    expect(calls).toBe(2)
  })
  it('retains a successful cache when a manual refresh fails', async () => {
    let fail = false
    const reader = new UsageReader(async () => {
      if (fail) throw new UsageQueryError()
      return snapshot
    })
    await reader.read()
    fail = true
    await expect(reader.read(true)).rejects.toThrow(UsageQueryError)
    expect(await reader.read()).toBe(snapshot)
  })
  it('cannot publish a response from an earlier account lifetime', async () => {
    const first = deferred<typeof snapshot>()
    const reader = new UsageReader(() => first.promise)
    const pending = reader.read()
    reader.reset()
    first.resolve(snapshot)
    await expect(pending).rejects.toThrow(UsageQueryError)
    expect(await reader.read()).toBe(snapshot)
  })
})
