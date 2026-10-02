import { describe, expect, it, vi } from 'vitest'
import { imageResponse } from '../src/imagegen/artifact.ts'

const attachment = {
  attachmentId: `sha256:${'a'.repeat(64)}`, mediaType: 'image/png', bytes: 3, width: 1, height: 1,
}
const event = (overrides: Record<string, unknown> = {}) => ({
  type: 'tool/result', data: {
    message: { toolCallId: 'call-1', isError: false, content: [{ type: 'text', text: 'Generated one image. It is available in this tool result.' }] },
    meta: { image: attachment, sessionId: 'example' }, ...overrides,
  },
})
const call = { type: 'tool/call', data: { callId: 'call-1', name: 'codex_generate_image' } }
// A real recorded call ID: the gateway ID joined to the provider function-call ID.
const joined = 'call_22weLBOZWrmCKfcfKuf0AoIR|fc_0a8c9f33f26f3a30016abe2f194f8087d0b9870f0a042edf6f'

describe('image artifact delivery', () => {
  const request = new Request('http://localhost/api/codex-subscription/image?sessionId=example&callId=call-1')

  it('serves a DSH toolCallId result matched to its call event, without using the ID as authorization', async () => {
    const readImage = vi.fn(async () => ({ ref: attachment, data: new Uint8Array([1, 2, 3]) }))
    const response = await imageResponse(request, {
      events: async () => [call, event()], readImage,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3])
    expect(readImage).toHaveBeenCalledWith(attachment, expect.any(AbortSignal))
  })

  it('serves the provider-joined call ID the gateway records', async () => {
    const readImage = vi.fn(async () => ({ ref: attachment, data: new Uint8Array([4, 5, 6]) }))
    const joinedCall = { type: 'tool/call', data: { callId: joined, name: 'codex_generate_image' } }
    const response = await imageResponse(
      new Request(`http://localhost/api/codex-subscription/image?sessionId=example&callId=${encodeURIComponent(joined)}`),
      { events: async () => [joinedCall, event({ message: { toolCallId: joined, isError: false, content: [{ type: 'text', text: 'Generated one image. It is available in this tool result.' }] } })], readImage },
    )
    expect(response.status).toBe(200)
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([4, 5, 6])
  })

  it('still rejects a call ID outside the accepted shape before reading any session', async () => {
    const events = vi.fn(async () => [call, event()])
    const response = await imageResponse(
      new Request(`http://localhost/api/codex-subscription/image?sessionId=example&callId=${encodeURIComponent('call-1|../secret')}`),
      { events, readImage: vi.fn() },
    )
    expect(response.status).toBe(404)
    expect(events).not.toHaveBeenCalled()
  })

  it.each([
    [[], 'no result'],
    [[event()], 'no matching tool call'],
    [[call, event({ message: { toolCallId: 'call-1', isError: true }, meta: { image: attachment } })], 'failed result'],
    [[call, event({ message: { toolCallId: 'another', isError: false, content: [{ type: 'text', text: 'Generated one image. It is available in this tool result.' }] } })], 'another call'],
    [[call, event({ message: { callId: 'call-1', isError: false, content: [{ type: 'text', text: 'Generated one image. It is available in this tool result.' }] } })], 'non-contract callId field'],
    [[call, event({ message: { callId: 'call-1', toolCallId: 'another', isError: false, content: [{ type: 'text', text: 'Generated one image. It is available in this tool result.' }] } })], 'forged callId cannot override toolCallId'],
    [[call, event({ meta: { image: { ...attachment, attachmentId: '../../private' } } })], 'invalid reference'],
    [[call, event({ meta: { image: attachment, sessionId: 'another' } })], 'another session'],
    [[call, event({ message: { toolCallId: 'call-1', isError: false, content: [{ type: 'text', text: 'Policy replaced this result' }] } })], 'replaced result'],
  ])('denies %s', async (events) => {
    const readImage = vi.fn()
    const response = await imageResponse(request, { events: async () => events, readImage })
    expect(response.status).toBe(404)
    expect(readImage).not.toHaveBeenCalled()
  })

  it('rejects attempts to read an arbitrary session and never exposes provider errors', async () => {
    const response = await imageResponse(new Request('http://localhost/api/codex-subscription/image?sessionId=../secret&callId=call-1'), {
      events: async () => { throw new Error('secret') }, readImage: vi.fn(),
    })
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('secret')
  })
})


it('reports a fixed failure stage without exposing storage error details', async () => {
  const diagnose = vi.fn()
  const response = await imageResponse(new Request('http://localhost/api/codex-subscription/image?sessionId=example&callId=call-1'), {
    events: async () => [call, event()],
    readImage: async () => { throw new Error('private storage path and account details') },
    diagnose,
  })
  expect(response.status).toBe(404)
  expect(diagnose).toHaveBeenCalledWith('attachment')
  expect(await response.text()).toBe('not found')
})
