import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { AttachmentStore, ImageAttachmentRef, RequestImageAttachment } from '@deepseek-ai/dsh-attachment'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { convertResponsesMessages } from '@earendil-works/pi-ai/api/openai-responses-shared'
import type { Api, Model } from '@earendil-works/pi-ai'
import { CodexSubscriptionAdapter } from '../src/adapter.ts'
import type { CodexSubscriptionController } from '../src/controller.ts'
import { toPiImageContext } from '../src/pi-context.ts'
import { apply, inject } from '../src/index.ts'

const ref = { attachmentId: 'test-image', mediaType: 'image/png', bytes: 3, width: 320, height: 200 } as ImageAttachmentRef
const version = { attachment: ref, variantId: 'test-preview', mediaType: 'image/png', data: new Uint8Array([1, 2, 3]),
  bytes: 3, width: 320, height: 200, sampleDepth: 8 } as RequestImageAttachment
const image = { type: 'image', attachment: ref }
const model = { ...openaiCodexProvider().getModels()[0], id: 'vision-fixture', input: ['text', 'image'] } as Model<Api>
const options = (messages: unknown[]): GenerateOptions => ({ provider: 'codex-subscription', model: model.id, messages } as GenerateOptions)
function fixture() {
  const readImageRequest = vi.fn(async () => version)
  const images = { attachments: { readImageRequest } as unknown as AttachmentStore, resolveAccess: () => undefined }
  const streamSimple = vi.fn(() => (async function* () {})())
  let disposed = false
  const controller = {
    availableModels: () => [model], imageContext: () => images, requestFast: () => false,
    openRequest: (signal?: AbortSignal) => ({ signal: signal ?? new AbortController().signal,
      [Symbol.dispose]() { disposed = true } }),
    models: { streamSimple },
  } as unknown as CodexSubscriptionController
  return { readImageRequest, images, streamSimple, controller, disposed: () => disposed,
    adapter: new CodexSubscriptionAdapter(controller) }
}
async function drain(adapter: CodexSubscriptionAdapter, input: GenerateOptions) {
  for await (const _chunk of adapter.stream(input)) { /* consume */ }
}

describe('Codex native image input', () => {
  it('reads optional attachment services through the actual Cordis Host without mounting image generation', async () => {
    const ctx = new Context()
    ctx.provide('llm', { registerAdapter: vi.fn() })
    ctx.provide('credentials', { readRecord: async () => undefined })
    ctx.provide('authorization', { registerFlow: () => () => {}, cancel: () => {} })
    const readImageRequest = vi.fn(async () => version)
    ctx.provide('attachments', { readImageRequest, imageHostPath: () => undefined })
    try {
      const fiber = ctx.plugin({ inject, apply })
      await fiber
      const host = ctx.get('codexSubscription') as CodexSubscriptionController
      const images = host.imageContext()!
      const content = await toPiImageContext(options([{ role: 'user', content: [image] }]), images)
      expect(content.messages[0].content).toEqual(expect.arrayContaining([{ type: 'image', data: 'AQID', mimeType: 'image/png' }]))
      expect(readImageRequest).toHaveBeenCalledTimes(1)
      await fiber.dispose()
      expect(ctx.get('codexSubscription')).toBeUndefined()
    } finally { await ctx.fiber.dispose() }
  })
  it('publishes discovered modalities consistently in listing, resolution and prepared calls', async () => {
    const { adapter } = fixture()
    expect((await adapter.listModels('codex-subscription'))[0].inputModalities).toEqual(['text', 'image'])
    expect((await adapter.resolveModel('codex-subscription', model.id)).inputModalities).toEqual(['text', 'image'])
    expect((await adapter.prepareCall('codex-subscription', model.id)).model.inputModalities).toEqual(['text', 'image'])
  })

  it('sends user and tool images through the actual Codex Responses serializer, reading each attachment once', async () => {
    const f = fixture()
    const input = options([
      { role: 'user', content: [{ type: 'text', text: 'Describe this.' }, image] },
      { role: 'assistant', source: { model: model.id }, content: [{ type: 'tool-call', id: 'call_1', name: 'read_image', arguments: '{}' }] },
      { role: 'tool', toolCallId: 'call_1', content: [image] },
    ])
    const context = await toPiImageContext(input, f.images)
    expect(f.readImageRequest).toHaveBeenCalledTimes(1)
    expect(f.readImageRequest).toHaveBeenCalledWith(ref, { width: 320, height: 200, maxBytes: 1024 * 1024 }, undefined)
    expect(context.messages[2]).toMatchObject({ role: 'toolResult', toolName: 'read_image', content: expect.arrayContaining([
      { type: 'image', data: 'AQID', mimeType: 'image/png' },
    ]) })
    const wire = JSON.stringify(convertResponsesMessages(model, context, new Set()))
    expect(wire.match(/input_image/g)).toHaveLength(2)
    expect(wire).toContain('data:image/png;base64,AQID')
    expect(input.messages[0].content[1]).toEqual(image)
  })

  it('passes image content and the owned request signal into the upstream adapter call', async () => {
    const f = fixture()
    const signal = new AbortController().signal
    await expect(drain(f.adapter, { ...options([{ role: 'user', content: [image] }]), signal })).rejects.toMatchObject({ code: 'STREAM_CLOSED' })
    expect(f.readImageRequest.mock.calls[0][2]).toBe(signal)
    expect(f.streamSimple.mock.calls[0][1].messages[0].content).toEqual(expect.arrayContaining([
      { type: 'image', data: 'AQID', mimeType: 'image/png' },
    ]))
    expect(f.disposed()).toBe(true)
  })

  it('keeps offloaded history as text without reading or transmitting image bytes', async () => {
    const f = fixture()
    const context = await toPiImageContext(options([{ role: 'user', content: [{ ...image, offloaded: true }] }]), f.images)
    expect(f.readImageRequest).not.toHaveBeenCalled()
    expect(context.messages[0].content).toEqual(expect.any(String))
    expect(context.messages[0].content).toContain('test-image')
  })

  it.each(['system', 'assistant', 'developer'])('rejects %s images before reading attachments', async role => {
    const f = fixture()
    await expect(toPiImageContext(options([{ role, content: [image] }]), f.images)).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTENT' })
    expect(f.readImageRequest).not.toHaveBeenCalled()
  })

  it('reports the exact offload requirement when repeated images exceed the request budget', async () => {
    const f = fixture()
    f.readImageRequest.mockResolvedValue({ ...version, bytes: 1024 * 1024 })
    await expect(toPiImageContext(options([{ role: 'user', content: Array.from({ length: 16 }, () => image) }]), f.images))
      // Per-image Base64 padding makes fifteen previews exceed 20 MiB by 40 bytes.
      .rejects.toMatchObject({ code: 'IMAGE_OFFLOAD_REQUIRED', failure: { offloadImages: 2 } })
    expect(f.readImageRequest).toHaveBeenCalledTimes(1)
  })

  it('refuses images for text models or missing attachment services before upstream dispatch', async () => {
    const f = fixture()
    f.controller.availableModels = () => [{ ...model, input: ['text'] }]
    await expect(drain(f.adapter, options([{ role: 'user', content: [image] }]))).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTENT' })
    expect(f.readImageRequest).not.toHaveBeenCalled()
    f.controller.availableModels = () => [model]
    f.controller.imageContext = () => undefined
    await expect(drain(f.adapter, options([{ role: 'user', content: [image] }]))).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTENT' })
    expect(f.streamSimple).not.toHaveBeenCalled()
    expect(f.disposed()).toBe(true)
  })

  it('does not dispatch after cancellation while attachment preparation is pending', async () => {
    const f = fixture()
    const abort = new AbortController()
    let started!: () => void
    const reading = new Promise<void>(resolve => { started = resolve })
    let finish!: (value: RequestImageAttachment) => void
    f.readImageRequest.mockImplementation(() => { started(); return new Promise(resolve => { finish = resolve }) })
    const work = drain(f.adapter, { ...options([{ role: 'user', content: [image] }]), signal: abort.signal })
    const settled = expect(work).rejects.toMatchObject({ name: 'AbortError' })
    await reading
    abort.abort()
    finish(version)
    await settled
    expect(f.streamSimple).not.toHaveBeenCalled()
    expect(f.disposed()).toBe(true)
  })
})
