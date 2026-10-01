import { describe, expect, it, vi } from 'vitest'
import { generateImage } from '../src/imagegen/backend.ts'

const jwt = (claim: unknown): string => `a.${Buffer.from(JSON.stringify({
  'https://api.openai.com/auth': { chatgpt_account_id: claim },
})).toString('base64url')}.b`
const png = Buffer.from('89504e470d0a1a0a', 'hex')
const response = (data: unknown, options?: ResponseInit) => new Response(JSON.stringify(data), {
  status: 200, headers: { 'content-type': 'application/json' }, ...options,
})

describe('Codex subscription image request', () => {
  it('sends a fixed one-image request with only the plugin-provided OAuth access', async () => {
    const fetcher = vi.fn(async () => response({ data: [{ b64_json: png.toString('base64') }] }))
    const saveImages = vi.fn(async () => [{ attachmentId: 'saved', mediaType: 'image/png', bytes: 9, width: 1, height: 1 }])
    const ref = await generateImage({ fetcher, saveImages }, jwt('account-1'), 'blue star', new AbortController().signal)
    expect(ref.attachmentId).toBe('saved')
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://chatgpt.com/backend-api/codex/images/generations')
    expect(init.redirect).toBe('error')
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${jwt('account-1')}`, 'ChatGPT-Account-ID': 'account-1' })
    expect(JSON.parse(init.body as string)).toEqual({ model: 'gpt-image-2', prompt: 'blue star', background: 'auto', quality: 'auto', size: 'auto' })
    expect(saveImages).toHaveBeenCalledWith([{ data: png, mediaType: 'image/png', name: 'generated-image.png' }])
  })

  it.each([
    ['invalid claim', 'not-jwt', response({ data: [{ b64_json: png.toString('base64') }] })],
    ['refusal', jwt('account-1'), response({ message: 'private provider detail' }, { status: 403 })],
    ['multiple images', jwt('account-1'), response({ data: [{ b64_json: png.toString('base64') }, { b64_json: png.toString('base64') }] })],
    ['invalid base64', jwt('account-1'), response({ data: [{ b64_json: '@@' }] })],
  ])('rejects %s without storing an attachment or disclosing the response', async (_, token, result) => {
    const saveImages = vi.fn()
    const fetcher = vi.fn(async () => result)
    await expect(generateImage({ fetcher, saveImages }, token, 'star', new AbortController().signal))
      .rejects.not.toThrow('private provider detail')
    expect(saveImages).not.toHaveBeenCalled()
  })

  it('refuses a response larger than the limit before parsing or saving', async () => {
    const saveImages = vi.fn()
    const fetcher = vi.fn(async () => response({ data: [{ b64_json: 'A'.repeat(27_000_001) }] }))
    await expect(generateImage({ fetcher, saveImages }, jwt('account-1'), 'star', new AbortController().signal))
      .rejects.toThrow('invalid-response')
    expect(saveImages).not.toHaveBeenCalled()
  })

  it('does not report success if cancelled while the image store is committing', async () => {
    const abort = new AbortController()
    const saveImages = vi.fn(async () => {
      abort.abort()
      return [{ attachmentId: 'saved', mediaType: 'image/png', bytes: 9, width: 1, height: 1 }]
    })
    const fetcher = vi.fn(async () => response({ data: [{ b64_json: png.toString('base64') }] }))
    await expect(generateImage({ fetcher, saveImages }, jwt('account-1'), 'star', abort.signal)).rejects.toBeDefined()
    expect(saveImages).toHaveBeenCalledTimes(1)
  })
})
