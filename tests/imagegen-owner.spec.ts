import { describe, expect, it, vi } from 'vitest'
import { mountImageFeature } from '../src/imagegen/index.ts'
import type { createImageTool } from '../src/imagegen/tool.ts'

describe('opt-in image feature owner', () => {
  it('aborts reference reads, disposes session observations and drains the request on unload', async () => {
    const attachment = { attachmentId: `sha256:${'a'.repeat(64)}`, mediaType: 'image/png', bytes: 8, width: 1, height: 1 }
    const observationDisposed = vi.fn()
    let started!: () => void
    const reading = new Promise<void>(resolve => { started = resolve })
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    let readSignal!: AbortSignal
    let tool!: ReturnType<typeof createImageTool>
    const saveImages = vi.fn()
    const route = vi.fn(async () => {})
    const dispose = mountImageFeature({
      tools: { register: (value: typeof tool) => { tool = value; return vi.fn() } },
      skills: { register: () => vi.fn() },
      connection: { fetch: { register: () => route } },
      sessionQuery: { observeSession: async () => ({
        events: [{ type: 'user/message', data: { content: [{ type: 'image', attachment }] } }],
        [Symbol.dispose]: observationDisposed,
      }) },
      attachments: { saveImages, readImage: async (_ref: unknown, signal: AbortSignal) => {
        readSignal = signal
        started()
        await held
        return { ref: attachment, data: Buffer.from('89504e470d0a1a0a', 'hex') }
      } },
    } as never, {
      subscribeState: (listener: (state: { status: string }) => void) => { listener({ status: 'signed-in' }); return vi.fn() },
      withImageAuth: async (signal: AbortSignal, run: (access: string, signal: AbortSignal) => Promise<unknown>) => run('unused-before-fetch', signal),
    } as never)
    const task = tool.execute({ prompt: 'use the reference', reference_images: [{ attachment_id: attachment.attachmentId }] }, {
      agent: { session: { id: 'example' } }, signal: new AbortController().signal,
    } as never)
    const failure = expect(task).rejects.toThrow('unavailable')
    try {
      await reading
      expect(observationDisposed).toHaveBeenCalledOnce()
      const unloading = dispose()
      expect(readSignal.aborted).toBe(true)
      release()
      await failure
      await unloading
      expect(saveImages).not.toHaveBeenCalled()
      expect(route).toHaveBeenCalledOnce()
    } finally { release(); await failure; await dispose() }
  })
  it('contains an image-tool registration failure during a later sign-in without throwing into the text controller', async () => {
    let stateChanged!: (state: { status: 'signed-in' | 'signed-out' }) => void
    const route = vi.fn(async () => {})
    const dispose = mountImageFeature({
      tools: { register: () => { throw new Error('image registry unavailable') } },
      skills: { register: vi.fn() },
      connection: { fetch: { register: () => route } },
      attachments: { saveImages: vi.fn(), readImage: vi.fn() }, sessionQuery: { observeSession: vi.fn() },
    } as never, { withImageAuth: vi.fn(), subscribeState: (listener: typeof stateChanged) => {
      stateChanged = listener
      listener({ status: 'signed-out' })
      return vi.fn()
    } } as never)
    expect(() => stateChanged({ status: 'signed-in' })).not.toThrow()
    await dispose()
    expect(route).toHaveBeenCalledTimes(1)
  })
  it('registers the tool and packaged skill together and withdraws both on disposal', async () => {
    const untool = vi.fn()
    const unskill = vi.fn()
    const unroute = vi.fn(async () => {})
    const tools = { register: vi.fn(() => untool) }
    const skills = { register: vi.fn(() => unskill) }
    const connection = { fetch: { register: vi.fn(() => unroute) } }
    let stateChanged!: (state: { status: 'signed-in' | 'signed-out' }) => void
    const dispose = mountImageFeature({ tools, skills, connection, attachments: { saveImages: vi.fn(), readImage: vi.fn() },
      sessionQuery: { observeSession: vi.fn() },
    } as never, { withImageAuth: vi.fn(), subscribeState: (listener: (state: { status: string }) => void) => {
      stateChanged = listener as typeof stateChanged
      listener({ status: 'signed-in' }); return vi.fn()
    } } as never)
    expect(tools.register.mock.calls[0]?.[0].name).toBe('codex_generate_image')
    expect(skills.register.mock.calls[0]?.[0].name).toBe('codex-subscription-imagegen')
    expect(connection.fetch.register.mock.calls[0]?.[0].path).toBe('/api/codex-subscription/image')
    stateChanged({ status: 'signed-out' })
    expect(untool).toHaveBeenCalledTimes(1)
    expect(unskill).toHaveBeenCalledTimes(1)
    expect(unroute).not.toHaveBeenCalled()
    stateChanged({ status: 'signed-in' })
    expect(tools.register).toHaveBeenCalledTimes(2)
    expect(skills.register).toHaveBeenCalledTimes(2)
    await dispose()
    expect(untool).toHaveBeenCalledTimes(2)
    expect(unskill).toHaveBeenCalledTimes(2)
    expect(unroute).toHaveBeenCalledTimes(1)
  })
})


it('keeps the tool when Skill registration fails and retries the Skill on a later notification', async () => {
  const untool = vi.fn()
  const unskill = vi.fn()
  const tools = { register: vi.fn(() => untool) }
  const skills = { register: vi.fn().mockImplementationOnce(() => { throw new Error('missing Skill') }).mockReturnValue(unskill) }
  const warning = vi.fn()
  let notify!: (state: { status: string }) => void
  const dispose = mountImageFeature({
    tools, skills, get: () => ({ warn: warning }),
    connection: { fetch: { register: () => async () => {} } },
    attachments: { saveImages: vi.fn(), readImage: vi.fn() }, sessionQuery: { observeSession: vi.fn() },
  } as never, { withImageAuth: vi.fn(), subscribeState: (listener: typeof notify) => {
    notify = listener; notify({ status: 'signed-in' }); return vi.fn()
  } } as never)
  try {
    expect(untool).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalledWith('codex subscription: image-skill-registration-failed')
    notify({ status: 'signed-in' })
    expect(tools.register).toHaveBeenCalledOnce()
    expect(skills.register).toHaveBeenCalledTimes(2)
  } finally { await dispose() }
  expect(untool).toHaveBeenCalledOnce()
  expect(unskill).toHaveBeenCalledOnce()
})

it('still removes its route when a Tool disposer throws', async () => {
  const route = vi.fn(async () => {})
  const unsubscribe = vi.fn()
  const dispose = mountImageFeature({
    tools: { register: () => () => { throw new Error('tool cleanup failed') } },
    skills: { register: () => vi.fn() },
    connection: { fetch: { register: () => route } },
    attachments: { saveImages: vi.fn(), readImage: vi.fn() }, sessionQuery: { observeSession: vi.fn() },
  } as never, { withImageAuth: vi.fn(), subscribeState: (listener: (state: { status: string }) => void) => {
    listener({ status: 'signed-in' }); return unsubscribe
  } } as never)
  await expect(dispose()).rejects.toBeInstanceOf(AggregateError)
  expect(route).toHaveBeenCalledOnce()
  expect(unsubscribe).toHaveBeenCalledOnce()
  await dispose()
  expect(route).toHaveBeenCalledOnce()
})
