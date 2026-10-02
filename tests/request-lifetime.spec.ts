import { expect, it } from 'vitest'
import { RequestLifetime } from '../src/host/request-lifetime.ts'

it('aborts leases but waits for their release, then permits a new login lifetime', async () => {
  const owner = new RequestLifetime()
  const lease = owner.open(undefined)
  let settled = false
  const stopped = owner.abort('sign-out').then(() => { settled = true })
  try {
    expect(lease.signal.aborted).toBe(true)
    await Promise.resolve()
    expect(settled).toBe(false)
  } finally { lease[Symbol.dispose]() }
  await stopped
  using next = owner.open(undefined)
  expect(next.signal.aborted).toBe(false)
})

it('propagates caller cancellation and releases its listener exactly once', () => {
  const owner = new RequestLifetime()
  const caller = new AbortController()
  const lease = owner.open(caller.signal)
  caller.abort('cancelled')
  expect(lease.signal.reason).toBe('cancelled')
  lease[Symbol.dispose]()
  lease[Symbol.dispose]()
})
