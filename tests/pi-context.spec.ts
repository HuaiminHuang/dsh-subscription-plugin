import { describe, expect, it } from 'vitest'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { toPiContext } from '../src/pi-context.ts'

function options(messages: unknown[]): GenerateOptions {
  return { provider: 'codex-subscription', model: 'gpt-5', messages } as GenerateOptions
}

describe('toPiContext', () => {
  it('keeps system text out of the conversational history and preserves tool results', () => {
    const context = toPiContext(options([
      { role: 'system', content: [{ type: 'text', text: 'Be concise.' }] },
      { role: 'user', content: [{ type: 'text', text: 'Read it.' }] },
      { role: 'assistant', source: { model: 'gpt-5' }, content: [{ type: 'tool-call', id: 'call_1', name: 'read_file', arguments: '{"path":"README.md"}' }] },
      { role: 'tool', toolCallId: 'call_1', isError: false, content: [{ type: 'text', text: 'contents' }] },
    ]))

    expect(context.systemPrompt).toBe('Be concise.')
    expect(context.messages).toEqual([
      { role: 'user', content: 'Read it.', timestamp: 0 },
      expect.objectContaining({ role: 'assistant', content: [{ type: 'toolCall', id: 'call_1', name: 'read_file', arguments: { path: 'README.md' } }] }),
      { role: 'toolResult', toolCallId: 'call_1', toolName: 'read_file', content: [{ type: 'text', text: 'contents' }], isError: false, timestamp: 0 },
    ])
  })

  it('rejects unsupported input instead of dropping it', () => {
    expect(() => toPiContext(options([{ role: 'user', content: [{ type: 'image', image: {} }] }]))).toThrow(/does not support image content/)
  })
})
