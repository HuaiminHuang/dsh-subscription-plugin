import { describe, expect, it, vi } from 'vitest'
import { mountImageFeature } from '../src/imagegen/index.ts'

describe('opt-in image feature owner', () => {
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
