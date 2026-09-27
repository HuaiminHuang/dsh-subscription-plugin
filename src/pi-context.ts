import { LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, RequestMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { AssistantMessage, Context as PiContext, Message as PiMessage, Tool } from '@earendil-works/pi-ai'
import { PI_PROVIDER_ID } from './constants.ts'

/** Zero-valued history usage required by pi-ai assistant messages. */
function zeroUsage(): AssistantMessage['usage'] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function textOf(message: RequestMessage): string {
  let text = ''
  for (const block of message.content) {
    if (block.type === 'text') text += block.text
    else {
      throw new LlmError(`Codex subscription does not support ${block.type} content in this release`, 'UNSUPPORTED_CONTENT')
    }
  }
  return text
}

function argumentsOf(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>
  } catch {
    // A malformed historical tool call remains representable as an empty object.
  }
  return {}
}

function assistantOf(message: Extract<RequestMessage, { role: 'assistant' }>): AssistantMessage {
  const content: AssistantMessage['content'] = []
  for (const block of message.content) {
    switch (block.type) {
      case 'text': content.push({ type: 'text', text: block.text }); break
      case 'reasoning': content.push({ type: 'thinking', thinking: block.text }); break
      case 'tool-call': content.push({ type: 'toolCall', id: block.id, name: block.name, arguments: argumentsOf(block.arguments) }); break
      default: throw new LlmError(`Codex subscription cannot replay ${block.type} assistant content`, 'UNSUPPORTED_CONTENT')
    }
  }
  return {
    role: 'assistant',
    content,
    api: 'dsh-foreign',
    provider: PI_PROVIDER_ID,
    model: message.source.model,
    usage: zeroUsage(),
    stopReason: content.some(block => block.type === 'toolCall') ? 'toolUse' : 'stop',
    timestamp: 0,
  }
}

function toolsOf(options: GenerateOptions): Tool[] | undefined {
  if (options.tools?.some(tool => tool.deferLoading === true)) {
    throw new LlmError('Codex subscription does not support deferred tool loading', 'UNSUPPORTED_CONTENT')
  }
  return options.tools?.map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))
}

/** Convert the text and tool subset supported by the first Codex release into pi-ai context. */
export function toPiContext(options: GenerateOptions): PiContext {
  const [first, ...remaining] = options.messages
  const systemPrompt = options.system ?? (first?.role === 'system' ? textOf(first) : undefined)
  const history = options.system === undefined && first?.role === 'system' ? remaining : options.messages
  const messages: PiMessage[] = []
  const toolNames = new Map<ToolCallId, string>()

  for (const message of history) {
    switch (message.role) {
      case 'system':
      case 'user':
        messages.push({ role: 'user', content: textOf(message), timestamp: 0 })
        break
      case 'assistant': {
        const assistant = assistantOf(message)
        for (const block of assistant.content) {
          if (block.type === 'toolCall') toolNames.set(block.id as ToolCallId, block.name)
        }
        messages.push(assistant)
        break
      }
      case 'tool':
        messages.push({
          role: 'toolResult',
          toolCallId: message.toolCallId,
          toolName: toolNames.get(message.toolCallId) ?? 'unknown',
          content: [{ type: 'text', text: textOf(message) || '(no output)' }],
          isError: message.isError ?? false,
          timestamp: 0,
        })
        break
      case 'developer':
        throw new LlmError('Codex subscription does not support developer messages in this release', 'UNSUPPORTED_CONTENT')
    }
  }
  const tools = toolsOf(options)
  return {
    ...systemPrompt === undefined || systemPrompt.length === 0 ? {} : { systemPrompt },
    messages,
    ...tools === undefined || tools.length === 0 ? {} : { tools },
  }
}
