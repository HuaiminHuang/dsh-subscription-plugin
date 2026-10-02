import { expect, it, vi } from 'vitest'
import { StateStore } from '../src/client/state-store.ts'

it('rejects stale revisions but accepts a restarted Host and disposes observers', () => {
  const store = new StateStore()
  const listener = vi.fn()
  const unsubscribe = store.subscribe(listener)
  store.set({ status: 'signed-in', models: [], instanceId: 'first', revision: 2 })
  store.set({ status: 'signed-out', models: [], instanceId: 'first', revision: 1 })
  expect(store.getSnapshot().status).toBe('signed-in')
  expect(listener).toHaveBeenCalledTimes(1)
  store.set({ status: 'checking', models: [], instanceId: 'second', revision: 0 })
  expect(store.getSnapshot().instanceId).toBe('second')
  unsubscribe()
  store.set({ status: 'signed-out', models: [], instanceId: 'second', revision: 1 })
  expect(listener).toHaveBeenCalledTimes(2)
})
