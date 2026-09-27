import { brandString } from '@deepseek-ai/dsh-brand'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { FinishReason, StreamChunk, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { AssistantMessage, AssistantMessageEvent, Usage } from '@earendil-works/pi-ai'

function usageOf(usage: Usage): Extract<StreamChunk, { type: 'usage' }>['usage'] {
  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    totalTokens: usage.totalTokens,
    ...usage.cacheRead > 0 ? { cacheReadTokens: usage.cacheRead } : {},
    ...usage.cacheWrite > 0 ? { cacheWriteTokens: usage.cacheWrite } : {},
    ...usage.reasoning === undefined ? {} : { reasoningTokens: usage.reasoning },
  }
}

function finishOf(message: AssistantMessage): FinishReason {
  switch (message.stopReason) {
    case 'stop': return { kind: 'stop' }
    case 'length': return { kind: 'max-tokens' }
    case 'toolUse': return { kind: 'tool-calls' }
    case 'aborted': return { kind: 'aborted', failure: { code: 'ABORTED', message: message.errorMessage ?? 'Codex request was cancelled' } }
    default: return { kind: 'error', failure: { code: 'CODEX_REQUEST_FAILED', message: message.errorMessage ?? 'Codex request failed' } }
  }
}

/** Translate pi-ai's complete stream protocol without exposing its raw event objects. */
export async function* toStreamChunks(events: AsyncIterable<AssistantMessageEvent>): AsyncGenerator<StreamChunk> {
  const toolCalls = new Map<number, { id: string; name: string }>()
  for await (const event of events) {
    switch (event.type) {
      case 'start': break
      case 'text_start': yield { type: 'block-start', index: event.contentIndex, blockType: 'text' }; break
      case 'text_delta': yield { type: 'text-delta', index: event.contentIndex, text: event.delta }; break
      case 'text_end': yield { type: 'block-end', index: event.contentIndex, block: { type: 'text', text: event.content } }; break
      case 'thinking_start': yield { type: 'block-start', index: event.contentIndex, blockType: 'reasoning' }; break
      case 'thinking_delta': yield { type: 'reasoning-delta', index: event.contentIndex, text: event.delta }; break
      case 'thinking_end': yield { type: 'block-end', index: event.contentIndex, block: { type: 'reasoning', text: event.content } }; break
      case 'toolcall_start': {
        const block = event.partial.content[event.contentIndex]
        const value = block?.type === 'toolCall' ? { id: block.id, name: block.name } : { id: '', name: '' }
        toolCalls.set(event.contentIndex, value)
        yield { type: 'block-start', index: event.contentIndex, blockType: 'tool-call' }
        break
      }
      case 'toolcall_delta': {
        const tool = toolCalls.get(event.contentIndex)
        yield {
          type: 'tool-call-delta',
          index: event.contentIndex,
          id: brandString<ToolCallId>(tool?.id ?? ''),
          ...tool?.name === undefined || tool.name.length === 0 ? {} : { name: tool.name },
          argumentsDelta: event.delta,
        }
        break
      }
      case 'toolcall_end':
        yield {
          type: 'block-end',
          index: event.contentIndex,
          block: {
            type: 'tool-call', id: brandString<ToolCallId>(event.toolCall.id), name: event.toolCall.name,
            arguments: JSON.stringify(event.toolCall.arguments),
          },
        }
        break
      case 'done':
        yield { type: 'usage', usage: usageOf(event.message.usage) }
        yield { type: 'finish', reason: finishOf(event.message) }
        return
      case 'error':
        yield { type: 'usage', usage: usageOf(event.error.usage) }
        yield { type: 'finish', reason: finishOf(event.error) }
        return
    }
  }
  throw new LlmError('Codex stream ended without a terminal event', 'STREAM_CLOSED')
}
