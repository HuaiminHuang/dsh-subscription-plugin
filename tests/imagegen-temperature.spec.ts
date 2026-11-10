import { describe, expect, it, vi } from 'vitest'
import type { Context, Model, SimpleStreamOptions } from '@earendil-works/pi-ai'
import { streamSimple } from '@earendil-works/pi-ai/api/openai-codex-responses'
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { CodexSubscriptionAdapter } from '../src/adapter.ts'
import type { CodexSubscriptionController } from '../src/controller.ts'

const model = openaiCodexProvider().getModels().find(model => model.id === 'gpt-5.6-sol')! as Model<'openai-codex-responses'>
const apiKey = `synthetic.${Buffer.from(JSON.stringify({
  'https://api.openai.com/auth': { chatgpt_account_id: 'test-account' },
})).toString('base64url')}.signature`

/** Exercise the real pi-ai serializer, with no global fetch or account access. */
function fixture() {
  let payload: Record<string, unknown> = {}
  const fetcher = vi.fn(async () => {
    if ('temperature' in payload) return new Response(JSON.stringify({
      error: { message: 'Unsupported parameter: temperature' },
    }), { status: 400, headers: { 'content-type': 'application/json' } })
    return new Response(`data: ${JSON.stringify({ type: 'response.completed', response: {
      id: 'test-response', status: 'completed', output: [],
      usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 },
    } })}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
  })
  const run = (selected: Model<'openai-codex-responses'>, context: Context, options: SimpleStreamOptions) =>
    streamSimple(selected, normalizeContext(context), { ...options, apiKey, transport: 'sse', maxRetries: 0, fetch: fetcher,
      onPayload: async (body, selectedModel) => {
        payload = (await options.onPayload?.(body, selectedModel) ?? body) as Record<string, unknown>
        return payload
      },
    })
  const controller = {
    availableModels: () => [model], requestFast: () => true,
    openRequest: () => ({ signal: new AbortController().signal, [Symbol.dispose]() {} }),
    models: { streamSimple: run },
  } as unknown as CodexSubscriptionController
  return { adapter: new CodexSubscriptionAdapter(controller), run, fetcher, payload: () => payload }
}

describe('Codex subscription sampling compatibility', () => {
  it('reproduces the reported error when temperature reaches the real Codex serializer', async () => {
    const { run, fetcher } = fixture()
    const events = []
    for await (const event of run(model, { messages: [] }, { temperature: 0.7 })) events.push(event)
    expect(events.at(-1)).toMatchObject({ type: 'error', error: { errorMessage: 'Unsupported parameter: temperature' } })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it.each([false, true])('omits sampling temperature on the %s prepared path without retrying or losing content', async prepared => {
    const { adapter, fetcher, payload } = fixture()
    const options = {
      provider: 'codex-subscription', model: model.id, temperature: 0.7,
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'Generate a blue star' }] }],
      tools: [{ name: 'codex_generate_image', description: 'Generate one image', parameters: {
        type: 'object' as const, properties: { prompt: { type: 'string' } }, required: ['prompt'],
      } }],
    }
    const stream = prepared ? (await adapter.prepareCall(options.provider, options.model)).stream(options) : adapter.stream(options)
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(payload()).not.toHaveProperty('temperature')
    expect(payload()).toMatchObject({ service_tier: 'fast', reasoning: { effort: 'medium' },
      tools: [expect.objectContaining({ name: 'codex_generate_image' })],
      input: [expect.objectContaining({ role: 'user', content: [{ type: 'input_text', text: 'Generate a blue star' }] })],
    })
  })
})
