import { describe, expect, it, vi } from 'vitest'
import type { AuthorizationFlow } from '@deepseek-ai/dsh-authorization'
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
    instanceId: 'test-host',
    revision: 0,
    state: { status: 'checking', models: [] },
    listeners: new Set(),
    ...overrides,
  })
  return instance
}

describe('CodexSubscriptionController authorization lifecycle', () => {
  it('delivers a notice published between the first stream yield and its next read', async () => {
    const instance = controller()
    const abort = new AbortController()
    const stream = instance.watch(abort.signal)[Symbol.asyncIterator]()
    try {
      expect((await stream.next()).value?.status).toBe('checking')
      ;(instance as unknown as { publish(state: { status: 'signing-in'; models: never[]; notice: { kind: 'browser'; url: string } }): void })
        .publish({ status: 'signing-in', models: [], notice: { kind: 'browser', url: 'https://auth.openai.com/oauth/authorize' } })
      const next = await stream.next()
      expect(next.value?.notice?.kind).toBe('browser')
      expect(next.value?.revision).toBe(1)
    } finally {
      abort.abort()
      await stream.next()
    }
  })

  it('starts only the explicitly selected method; cancellation settles the owned attempt', async () => {
    const outcome = deferred<{ status: 'cancelled' }>()
    let cancelled = 0
    let selected: string | undefined
    const instance = controller({
      ctx: {
        authorization: { begin: (request: { method: string }) => { selected = request.method; return outcome.promise }, cancel: () => { cancelled++ } },
        credentials: { deleteRecord: async () => {} },
        llm: { registerAdapter: () => Object.assign(() => {}, { replace: () => {} }) },
      },
    })

    expect(() => instance.beginLogin('invalid' as 'browser')).toThrow(/Unknown Codex sign-in method/)
    expect(selected).toBeUndefined()
    const started = instance.beginLogin('device_code')
    expect(selected).toBe('device_code')
    expect(started).toMatchObject({ status: 'signing-in', method: 'device_code' })
    expect(started.notice).toBeUndefined()
    const attemptId = started.attemptId
    if (attemptId === undefined) throw new Error('expected a login attempt id')

    expect(instance.cancelLogin(attemptId).status).toBe('signing-in')
    expect(cancelled).toBe(1)

    outcome.resolve({ status: 'cancelled' })
    await outcome.promise
    await Promise.resolve()
    expect(instance.getState()).toMatchObject({ status: 'signed-out', models: [] })
  })

  it('stops a browser attempt that never settles and reports a safe timeout', async () => {
    vi.useFakeTimers()
    try {
      const outcome = deferred<{ status: 'cancelled' }>()
      let signal!: AbortSignal
      const instance = controller({
        ctx: { authorization: { begin: (request: { signal: AbortSignal }) => {
          signal = request.signal
          return outcome.promise
        }, cancel: () => {} } },
      })
      instance.beginLogin('browser')
      await vi.advanceTimersByTimeAsync(10 * 60_000)
      expect(signal.aborted).toBe(true)
      outcome.resolve({ status: 'cancelled' })
      await outcome.promise
      await Promise.resolve()
      expect(instance.getState()).toMatchObject({ status: 'error', error: 'login-timeout' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the selected login link and code visible through progress updates', async () => {
    const outcome = deferred<{ status: 'cancelled' }>()
    let notify!: (notice: { message: string; url?: string; code?: string }) => void
    const instance = controller({
      ctx: {
        authorization: { begin: (request: { interaction: { notify: typeof notify } }) => {
          notify = request.interaction.notify
          return outcome.promise
        }, cancel: () => {} },
      },
    })
    instance.beginLogin('device_code')
    notify({ message: 'device_code', url: 'https://auth.openai.com/codex/device', code: 'TEST-CODE' })
    notify({ message: 'progress' })
    expect(instance.getState().notice).toEqual({ kind: 'device_code', url: 'https://auth.openai.com/codex/device', code: 'TEST-CODE' })
    outcome.resolve({ status: 'cancelled' })
    await outcome.promise
    await Promise.resolve()
    expect(instance.getState().status).toBe('signed-out')
  })

  it('routes both methods to pi-ai without forwarding a second choice prompt to Client', async () => {
    let flow!: AuthorizationFlow
    const selected: string[] = []
    const notices: { message: string; url?: string; code?: string }[] = []
    const instance = controller({
      ctx: { authorization: { registerFlow: (registered: AuthorizationFlow) => { flow = registered; return () => {} } } },
      models: { login: async (_provider: string, _mechanism: string, interaction: {
        prompt: (prompt: { type: 'select'; options: { id: string }[] }) => Promise<string>
        notify: (event: unknown) => void
      }) => {
        const method = await interaction.prompt({ type: 'select', options: [{ id: 'browser' }, { id: 'device_code' }] })
        selected.push(method)
        if (method === 'browser') interaction.notify({ type: 'auth_url', url: 'https://auth.openai.com/oauth/authorize', instructions: 'external text' })
        else interaction.notify({ type: 'device_code', verificationUri: 'https://auth.openai.com/codex/device', userCode: 'ABCD-EFGH', intervalSeconds: 5, expiresInSeconds: 900 })
      } },
    })
    ;(instance as unknown as { registerFlow(): () => void }).registerFlow()
    expect(flow.methods.map(method => method.id)).toEqual(['browser', 'device_code'])
    for (const method of ['browser', 'device_code']) {
      await flow.run({ method, signal: new AbortController().signal, notify: notice => { notices.push(notice) }, prompt: async () => { throw new Error('unexpected Client prompt') }, commit: async () => {} })
    }
    expect(selected).toEqual(['browser', 'device_code'])
    expect(notices).toEqual([
      { message: 'browser', url: 'https://auth.openai.com/oauth/authorize' },
      { message: 'device_code', url: 'https://auth.openai.com/codex/device', code: 'ABCD-EFGH' },
    ])
  })

  it('rejects provider-supplied authorization links outside the OpenAI origin', () => {
    const instance = controller()
    expect(() => (instance as unknown as { authorizationUrl(value: string): string }).authorizationUrl('https://example.com/codex/device'))
      .toThrow('Invalid Codex authorization page')
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

    await (instance as unknown as { refreshLoginState(): Promise<void> }).refreshLoginState()
    expect(instance.getState()).toMatchObject({ status: 'error', error: 'saved-login-unavailable', models: [] })
    expect(withdrewRoute).toBe(1)
    expect(deleted).toBe(0)
  })
})
