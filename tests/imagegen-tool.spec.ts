import { describe, expect, it, vi } from 'vitest'
import { createImageTool, ImageGate } from '../src/imagegen/tool.ts'

describe('image tool contract', () => {
  it('serializes different agents and removes a cancelled waiter without starting its task', async () => {
    const gate = new ImageGate()
    let release!: () => void
    const first = gate.run(new AbortController().signal, () => new Promise<void>(resolve => { release = resolve }))
    const cancel = new AbortController()
    const secondTask = vi.fn(async () => {})
    const second = gate.run(cancel.signal, secondTask).then(() => 'ran', () => 'cancelled')
    cancel.abort()
    expect(await second).toBe('cancelled')
    expect(secondTask).not.toHaveBeenCalled()
    const thirdTask = vi.fn(async () => {})
    const third = gate.run(new AbortController().signal, thirdTask)
    await Promise.resolve()
    expect(thirdTask).not.toHaveBeenCalled()
    release()
    await first
    await third
    expect(thirdTask).toHaveBeenCalledTimes(1)
  })
  it('returns text-only model content and a durable UI reference after saving', async () => {
    const ref = { attachmentId: 'sha256:' + 'a'.repeat(64), mediaType: 'image/png', bytes: 9, width: 1, height: 1 }
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('89504e470d0a1a0a', 'hex').toString('base64') }] }), {
      headers: { 'content-type': 'application/json' },
    }))
    const auth = vi.fn(async (_signal: AbortSignal, run: (access: string, signal: AbortSignal) => Promise<unknown>) => {
      const jwt = `a.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'account-1' } })).toString('base64url')}.b`
      return run(jwt, new AbortController().signal)
    })
    const tool = createImageTool({ fetcher, saveImages: async () => [ref], withImageAuth: auth })
    const exec = { agent: { session: { id: 'example' } }, signal: new AbortController().signal }
    const value = await tool.execute({ prompt: 'star' }, exec as never)
    expect(value).toEqual({ image: ref, sessionId: 'example' })
    expect(tool.output.render({}, value as never)).toEqual([{ type: 'text', text: 'Generated one image. It is available in this tool result.' }])
    expect(tool.output.presentationMeta?.({}, value as never)).toEqual({ image: ref, sessionId: 'example' })
  })

  it('refuses a detached call without an owning session', async () => {
    const tool = createImageTool({ fetcher: vi.fn(), saveImages: vi.fn(), withImageAuth: vi.fn() })
    await expect(tool.execute({ prompt: 'star' }, { signal: new AbortController().signal } as never))
      .rejects.toThrow('session')
  })
  it('does not echo an auth or provider exception into the recorded tool failure', async () => {
    const tool = createImageTool({ fetcher: vi.fn(), saveImages: vi.fn(), withImageAuth: async () => {
      throw new Error('private OAuth token')
    } })
    await expect(tool.execute({ prompt: 'star' }, { agent: { session: { id: 'example' } }, signal: new AbortController().signal } as never))
      .rejects.not.toThrow('private OAuth token')
  })
})
