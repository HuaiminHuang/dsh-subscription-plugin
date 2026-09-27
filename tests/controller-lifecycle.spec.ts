import { describe, expect, it } from 'vitest'
import { CodexSubscriptionController } from '../src/controller.ts'

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(reason?: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((accept, refuse) => { resolve = accept; reject = refuse })
  return { promise, resolve, reject }
}

function controller(overrides: Record<string, unknown> = {}): CodexSubscriptionController {
  // These lifecycle tests deliberately avoid the constructor: its pi-ai model
  // factory is outside the behavior under test. The Host interactions are all
  // injected explicitly and no Cordis fiber or process-global resource is held.
  const instance = Object.create(CodexSubscriptionController.prototype) as CodexSubscriptionController
  Object.assign(instance as object, {
    ctx: {
      authorization: { begin: async () => ({ status: 'cancelled' }), cancel: () => {} },
      credentials: { deleteRecord: async () => {} },
      llm: { registerAdapter: () => Object.assign(() => {}, { replace: () => {} }) },
    },
    models: { getAvailable: async () => [] },
    adapter: {},
    activeRequests: new Set(),
    registration: undefined,
    attempt: undefined,
    state: { status: 'checking', models: [] },
    listeners: new Set(),
    ...overrides,
  })
  return instance
}

describe('CodexSubscriptionController authorization lifecycle', () => {
  it('cancels an active attempt, rejects its pending choice, then publishes signed-out only on the owned completion', async () => {
    const outcome = deferred<{ status: 'cancelled' }>()
    const pending = deferred<string>()
    let cancelled = 0
    const instance = controller({
      ctx: {
        authorization: { begin: () => outcome.promise, cancel: () => { cancelled++ } },
        credentials: { deleteRecord: async () => {} },
        llm: { registerAdapter: () => Object.assign(() => {}, { replace: () => {} }) },
      },
    })

    const started = instance.beginLogin()
    const attemptId = started.attemptId
    if (attemptId === undefined) throw new Error('expected a login attempt id')
    ;(instance as unknown as { attempt: { pending?: { settle(value: string | Error): void } } }).attempt.pending = {
      view: { kind: 'select', message: 'Choose', options: [{ id: 'browser', label: 'Browser' }] },
      settle: value => value instanceof Error ? pending.reject(value) : pending.resolve(value),
    }

    expect(instance.cancelLogin(attemptId).status).toBe('signing-in')
    expect(cancelled).toBe(1)
    await expect(pending.promise).rejects.toThrow('login cancelled')

    outcome.resolve({ status: 'cancelled' })
    await outcome.promise
    await Promise.resolve()
    expect(instance.getState()).toMatchObject({ status: 'signed-out', models: [] })
  })

  it('accepts only a choice offered by the current attempt and clears the prompt after accepting it', async () => {
    const answer = deferred<string>()
    const instance = controller({
      attempt: {
        id: 'current',
        pending: {
          view: { kind: 'select', message: 'Choose', options: [{ id: 'browser', label: 'Browser' }] },
          settle: value => value instanceof Error ? answer.reject(value) : answer.resolve(value),
        },
      },
      state: {
        status: 'signing-in', attemptId: 'current', models: [],
        prompt: { kind: 'select', message: 'Choose', options: [{ id: 'browser', label: 'Browser' }] },
      },
    })

    expect(() => instance.answerChoice('current', 'other')).toThrow(/not offered/)
    expect(instance.answerChoice('current', 'browser')).toMatchObject({ status: 'signing-in', prompt: undefined })
    await expect(answer.promise).resolves.toBe('browser')
  })

  it('does not delete a saved credential when its non-destructive preflight fails', async () => {
    let deleted = 0
    let withdrewRoute = 0
    const instance = controller({
      ctx: {
        authorization: { begin: async () => ({ status: 'cancelled' }), cancel: () => {} },
        credentials: { deleteRecord: async () => { deleted++ } },
        llm: { registerAdapter: () => Object.assign(() => {}, { replace: () => {} }) },
      },
      models: { getAvailable: async () => { throw new Error('provider unavailable') } },
      registration: Object.assign(() => {}, { replace: () => { withdrewRoute++ } }),
    })

    await instance.refreshLogin()
    expect(instance.getState()).toMatchObject({ status: 'error', error: 'saved-login-unavailable', models: [] })
    expect(withdrewRoute).toBe(1)
    expect(deleted).toBe(0)
  })
})
