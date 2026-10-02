import { describe, expect, it, vi } from 'vitest'
import type { Credential } from '@earendil-works/pi-ai'
import { codexBaselineModels } from '../src/discovery.ts'
import { RequestLifetime } from '../src/host/request-lifetime.ts'
import { CodexSubscriptionController } from '../src/controller.ts'
import type { CodexSubscriptionState } from '../src/types.ts'

const access = `a.${Buffer.from(JSON.stringify({
  'https://api.openai.com/auth': { chatgpt_account_id: 'account-1' },
})).toString('base64url')}.b`

const liveModel = (slug: string) => ({
  slug,
  display_name: slug,
  visibility: 'list',
  supported_in_api: true,
  context_window: 272_000,
  input_modalities: ['text'],
  supported_reasoning_levels: [{ effort: 'medium' }],
})

/** The controller reads its grant through this module; each test drives the record it returns. */
const records = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('../src/credential-store.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/credential-store.ts')>(),
  codexCredentialStore: () => ({
    // `read` returns the pi-ai credential, not the Host credential record.
    read: async () => (records.current as { payload?: Credential } | undefined)?.payload,
    list: async () => [],
    modify: async (_provider: string, mutate: (value: unknown) => Promise<unknown>) => mutate(records.current),
    delete: async () => {},
  }),
}))

/** Build one controller over injected Host collaborators, without a Cordis fiber. */
function controller() {
  const registerAdapter = vi.fn(() => Object.assign(() => {}, { replace: vi.fn() }))
  const instance = Object.create(CodexSubscriptionController.prototype) as CodexSubscriptionController
  const requests = new RequestLifetime()
  Object.assign(instance as unknown as Record<string, unknown>, {
    ctx: { credentials: { readRecord: async () => records.current }, llm: { registerAdapter } },
    // pi-ai reports models only for a provider whose auth is configured; here the
    // installed provider catalog is the baseline this plugin started from.
    models: {
      getAvailable: async () => records.current === undefined ? [] : codexBaselineModels,
      getAuth: async () => undefined,
    },
    adapter: {},
    requests,
    fastSelections: new Set(),
    registration: undefined,
    attempt: undefined,
    instanceId: 'test-host',
    revision: 0,
    state: { status: 'checking', models: [] },
    listeners: new Set(),
    refreshEpoch: 0,
    pendingRefreshes: new Set(),
    discoveryDone: false,
    discoveredModels: undefined,
    catalog: codexBaselineModels,
    disposed: false,
  })
  return { instance, registerAdapter }
}

const grant = {
  kind: 'grant',
  payload: { type: 'oauth', access, refresh: 'refresh-1', expires: Date.now() + 3_600_000 },
}

const checkLoginState = (instance: CodexSubscriptionController) =>
  (instance as unknown as { checkLoginState(epoch: number): Promise<void> }).checkLoginState(0)

const publishedState = (instance: CodexSubscriptionController): CodexSubscriptionState =>
  (instance as unknown as { state: CodexSubscriptionState }).state

describe('Codex subscription controller model catalog', () => {
  it('discovers the account catalog before offering models and registers the live one', async () => {
    records.current = grant
    const { instance, registerAdapter } = controller()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      models: [liveModel('gpt-6-sol'), liveModel('gpt-6.1-sol')],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    Object.assign(instance as unknown as Record<string, unknown>, { discoveryFetch: fetcher })

    await checkLoginState(instance)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain('/backend-api/codex/models?client_version=')
    expect(registerAdapter).toHaveBeenCalledTimes(1)
    expect(publishedState(instance).status).toBe('signed-in')
    expect(instance.availableModels().map(model => model.id)).toContain('gpt-6-sol')
    // Settings and selector expose only the successfully discovered catalog.
    expect(instance.availableModels().slice(0, 2).map(model => model.id)).toEqual(['gpt-6-sol', 'gpt-6.1-sol'])
    expect(publishedState(instance).models).toEqual(instance.availableModels().map(({ id, name }) => ({ id, name })))
    expect(instance.availableModels().map(model => model.id)).not.toContain('gpt-5.5')
  })

  it('keeps the installed catalog when the vendor request fails, without failing the login state', async () => {
    records.current = grant
    const { instance } = controller()
    const fetcher = vi.fn(async () => new Response('boom', { status: 500 }))
    Object.assign(instance as unknown as Record<string, unknown>, { discoveryFetch: fetcher })

    await checkLoginState(instance)

    expect(publishedState(instance).status).toBe('signed-in')
    expect(instance.availableModels().map(model => model.id)).toEqual(codexBaselineModels.map(model => model.id))
    // Retry stays available: an unsuccessful discovery must not look complete.
    expect((instance as unknown as { discoveryDone: boolean }).discoveryDone).toBe(false)
  })

  it('stays signed out and offers nothing when no grant is stored', async () => {
    records.current = undefined
    const { instance, registerAdapter } = controller()
    const fetcher = vi.fn()
    Object.assign(instance as unknown as Record<string, unknown>, { discoveryFetch: fetcher })

    await checkLoginState(instance)

    expect(publishedState(instance).status).toBe('signed-out')
    expect(instance.availableModels()).toEqual([])
    expect(registerAdapter).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('offers the installed catalog rather than an empty one when the vendor lists no model', async () => {
    records.current = grant
    const { instance } = controller()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ models: [] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    Object.assign(instance as unknown as Record<string, unknown>, { discoveryFetch: fetcher })

    await checkLoginState(instance)

    expect(publishedState(instance).status).toBe('signed-in')
    expect(instance.availableModels().map(model => model.id)).toEqual(codexBaselineModels.map(model => model.id))
  })

  it('retries discovery while the vendor answers with an empty catalog', async () => {
    records.current = grant
    const { instance } = controller()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ models: [] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    Object.assign(instance as unknown as Record<string, unknown>, { discoveryFetch: fetcher })

    await checkLoginState(instance)
    await checkLoginState(instance)

    // An empty answer does not prove the account has no models, so it is retried.
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not turn a lifecycle refusal into a failed login state', async () => {
    records.current = grant
    const { instance } = controller()
    // A sign-out that started between the state read and the request owns the
    // refusal; the projection must not report a broken saved login.
    Object.assign(instance as unknown as Record<string, unknown>, {
      signOutTask: Promise.resolve({ status: 'signed-out', models: [] }),
      openRequest: () => { throw new Error('Codex plugin is not accepting requests') },
      discoveryFetch: vi.fn(),
    })

    await checkLoginState(instance)

    expect(publishedState(instance).status).toBe('checking')
  })

  it('cancels an in-flight discovery request when the grant is signed out', async () => {
    records.current = grant
    const { instance } = controller()
    const deleteRecord = vi.fn(async () => {})
    Object.assign(instance as unknown as Record<string, unknown>, {
      ctx: {
        credentials: { readRecord: async () => records.current, deleteRecord },
        llm: { registerAdapter: vi.fn(() => Object.assign(() => {}, { replace: vi.fn() })) },
        authorization: { cancel: () => {} },
      },
    })
    let releaseDiscovery: (() => void) | undefined
    const reached = new Promise<void>((resolve) => { releaseDiscovery = resolve })
    let observedSignal: AbortSignal | undefined
    const fetcher = vi.fn(async (_input: unknown, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined
      releaseDiscovery?.()
      // Mirrors the real transport: an aborted signal rejects the pending request
      // instead of leaving the caller waiting for the timeout.
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (signal === undefined || signal === null) return
        const abort = (): void => { reject(signal.reason ?? new Error('aborted')) }
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      })
    })
    Object.assign(instance as unknown as Record<string, unknown>, { discoveryFetch: fetcher as unknown as typeof fetch })

    const checking = checkLoginState(instance)
    await reached
    const signOut = (instance as unknown as { finishSignOut(): Promise<CodexSubscriptionState> }).finishSignOut()
    await vi.waitFor(() => { expect(observedSignal?.aborted).toBe(true) })
    await signOut
    await checking
    expect(publishedState(instance).status).toBe('signed-out')
  })
  it('refreshes a completed discovery and publishes the same catalog as the selector', async () => {
    records.current = grant
    const { instance } = controller()
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ models: [liveModel('first-live-model')] }))
      .mockResolvedValueOnce(Response.json({ models: [liveModel('second-live-model')] }))
    Object.assign(instance, { discoveryFetch: fetcher })
    await checkLoginState(instance)
    const state = await instance.refreshModels()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(state.models[0]?.id).toBe('second-live-model')
    expect(state.models).toEqual(instance.availableModels().map(({ id, name }) => ({ id, name })))
  })

  it('retains the live catalog and login when manual refresh fails, then permits retry', async () => {
    records.current = grant
    const { instance } = controller()
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ models: [liveModel('retained-live-model')] }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 500 }))
      .mockResolvedValueOnce(Response.json({ models: [liveModel('recovered-live-model')] }))
    Object.assign(instance, { discoveryFetch: fetcher })
    await checkLoginState(instance)
    const before = instance.getState().models
    await expect(instance.refreshModels()).rejects.toThrow('Could not refresh models')
    expect(instance.getState()).toMatchObject({ status: 'signed-in', models: before })
    expect((await instance.refreshModels()).models[0]?.id).toBe('recovered-live-model')
  })

  it('coalesces overlapping refresh button requests', async () => {
    records.current = grant
    const { instance } = controller()
    Object.assign(instance, { discoveryFetch: async () => Response.json({ models: [liveModel('before-refresh')] }) })
    await checkLoginState(instance)
    let resolve!: (response: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(done => { resolve = done }))
    Object.assign(instance, { discoveryFetch: fetcher })
    const first = instance.refreshModels()
    const second = instance.refreshModels()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    resolve(Response.json({ models: [liveModel('after-refresh')] }))
    const states = await Promise.all([first, second])
    expect(states[0]).toEqual(states[1])
    expect(states[0]?.models[0]?.id).toBe('after-refresh')
  })

})
