import { describe, expect, it } from 'vitest'
import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai'
import { toStreamChunks } from '../src/stream.ts'

const usage = { input: 12, output: 7, cacheRead: 0, cacheWrite: 0, totalTokens: 19, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }

function message(content: AssistantMessage['content']): AssistantMessage {
  return { role: 'assistant', content, api: 'openai-codex-responses', provider: 'openai-codex', model: 'gpt-5', usage, stopReason: 'toolUse', timestamp: 0 }
}

async function collect(events: readonly AssistantMessageEvent[]) {
  async function* source() { yield* events }
  const chunks = []
  for await (const chunk of toStreamChunks(source())) chunks.push(chunk)
  return chunks
}

describe('toStreamChunks', () => {
  it('preserves text, tool JSON, usage, and a terminal tool-call finish', async () => {
    const partial = message([
      { type: 'text', text: 'Reading file' },
      { type: 'toolCall', id: 'call_1', name: 'read_file', arguments: {} },
    ])
    const chunks = await collect([
      { type: 'start', partial },
      { type: 'text_start', contentIndex: 0, partial },
      { type: 'text_delta', contentIndex: 0, delta: 'Reading ', partial },
      { type: 'text_end', contentIndex: 0, content: 'Reading file', partial },
      { type: 'toolcall_start', contentIndex: 1, partial },
      { type: 'toolcall_delta', contentIndex: 1, delta: '{"path":', partial },
      { type: 'toolcall_end', contentIndex: 1, toolCall: { type: 'toolCall', id: 'call_1', name: 'read_file', arguments: { path: 'README.md' } }, partial },
      { type: 'done', reason: 'toolUse', message: partial },
    ])

    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'Reading ' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'Reading file' } },
      { type: 'block-start', index: 1, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 1, id: 'call_1', name: 'read_file', argumentsDelta: '{"path":' },
      { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call_1', name: 'read_file', arguments: '{"path":"README.md"}' } },
      { type: 'usage', usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ])
  })

  it('turns provider errors into a single terminal error finish', async () => {
    const failed = { ...message([]), stopReason: 'error' as const, errorMessage: 'upstream unavailable' }
    await expect(collect([{ type: 'error', reason: 'error', error: failed }])).resolves.toEqual([
      { type: 'usage', usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 } },
      { type: 'finish', reason: { kind: 'error', failure: { code: 'CODEX_REQUEST_FAILED', message: 'upstream unavailable' } } },
    ])
  })
})
