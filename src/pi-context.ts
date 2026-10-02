import { IMAGE_OFFLOAD_REQUIRED_CODE, LlmError, offloadedImageText, projectOffloadedImages, requestImageHandleText, requiredImageOffload } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, ImageAttachmentAccessResolver, RequestMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { requestImageDimensions } from '@deepseek-ai/dsh-attachment'
import type { AttachmentId, AttachmentStore, RequestImageAttachment } from '@deepseek-ai/dsh-attachment'
import type { AssistantMessage, Context as PiContext, ImageContent, JsonObject, Message as PiMessage, TextContent, Tool } from '@earendil-works/pi-ai'
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

function argumentsOf(raw: string): JsonObject {
  try {
    // JSON.parse without a reviver yields JSON values; only the object root is accepted.
    const value: unknown = JSON.parse(raw)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as JsonObject
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

function convertContext(options: GenerateOptions, images?: ReadonlyMap<AttachmentId, RequestImageAttachment>,
  resolveAccess: ImageAttachmentAccessResolver = () => undefined): PiContext {
  const contentOf = (message: RequestMessage): string | (TextContent | ImageContent)[] => {
    if (!images || !message.content.some(block => block.type === 'image')) return textOf(message)
    return message.content.flatMap((block): (TextContent | ImageContent)[] => {
      if (block.type === 'text') return [{ type: 'text', text: block.text }]
      if (block.type !== 'image') throw new LlmError(`Codex subscription does not support ${block.type} content`, 'UNSUPPORTED_CONTENT')
      const version = images.get(block.attachment.attachmentId)
      if (!version) throw new LlmError('Codex request image is unavailable', 'UNSUPPORTED_CONTENT')
      return [
        { type: 'text', text: requestImageHandleText(block.attachment, version, resolveAccess(block.attachment)) },
        { type: 'image', data: Buffer.from(version.data).toString('base64'), mimeType: version.mediaType },
      ]
    })
  }
  const [first, ...remaining] = options.messages
  const systemPrompt = options.system ?? (first?.role === 'system' ? textOf(first) : undefined)
  const history = options.system === undefined && first?.role === 'system' ? remaining : options.messages
  const messages: PiMessage[] = []
  const toolNames = new Map<ToolCallId, string>()

  for (const message of history) {
    switch (message.role) {
      case 'system':
        messages.push({ role: 'user', content: textOf(message), timestamp: 0 })
        break
      case 'user':
        messages.push({ role: 'user', content: contentOf(message), timestamp: 0 })
        break
      case 'assistant': {
        const assistant = assistantOf(message)
        for (const block of assistant.content) {
          if (block.type === 'toolCall') toolNames.set(block.id as ToolCallId, block.name)
        }
        messages.push(assistant)
        break
      }
      case 'tool': {
        const content = contentOf(message)
        messages.push({
          role: 'toolResult',
          toolCallId: message.toolCallId,
          toolName: toolNames.get(message.toolCallId) ?? 'unknown',
          content: typeof content === 'string' ? [{ type: 'text', text: content || '(no output)' }] : content,
          isError: message.isError ?? false,
          timestamp: 0,
        })
        break
      }
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

/** Convert text and ordinary tool calls; image input requires the async attachment path. */
export function toPiContext(options: GenerateOptions): PiContext { return convertContext(options) }

/** Host-only attachment services for converting user and tool-result images. */
export interface CodexImageContext {
  attachments: AttachmentStore
  resolveAccess: ImageAttachmentAccessResolver
}

/** Resolve bounded image previews, preserve offloaded placeholders, and send pi-ai image blocks.
 * Reads share the request's cancellation signal; durable session history is never mutated.
 */
export async function toPiImageContext(options: GenerateOptions, images: CodexImageContext): Promise<PiContext> {
  const versions = new Map<AttachmentId, RequestImageAttachment>()
  // Reject unsupported roles before reading any attachments, including leading system images.
  for (const message of options.messages) {
    if (message.role === 'developer' || message.content.some(block => block.type !== 'text' && block.type !== 'image'
      && !(message.role === 'assistant' && (block.type === 'reasoning' || block.type === 'tool-call')))) {
      throw new LlmError('Codex subscription cannot convert this message content', 'UNSUPPORTED_CONTENT')
    }
    if (message.role !== 'user' && message.role !== 'tool' && message.content.some(block => block.type === 'image')) {
      throw new LlmError(`Codex subscription cannot send images in ${message.role} messages`, 'UNSUPPORTED_CONTENT')
    }
  }
  for (const message of options.messages) {
    for (const block of message.content) {
      if (block.type !== 'image' || block.offloaded === true || versions.has(block.attachment.attachmentId)) continue
      options.signal?.throwIfAborted()
      const ref = block.attachment
      const version = await images.attachments.readImageRequest(ref, {
        ...requestImageDimensions(ref.width, ref.height, 2048 * 2048), maxBytes: 1024 * 1024,
      }, options.signal)
      options.signal?.throwIfAborted()
      versions.set(ref.attachmentId, version)
    }
  }
  const offloadImages = requiredImageOffload(options.messages, { representation: 'base64', maxBytes: 20 * 1024 * 1024 },
    block => versions.get(block.attachment.attachmentId)!.bytes)
  if (offloadImages > 0) throw new LlmError('Codex request images exceed the 20 MiB payload bound', IMAGE_OFFLOAD_REQUIRED_CODE, { offloadImages })
  const messages = projectOffloadedImages(options.messages, ref => offloadedImageText(ref, images.resolveAccess(ref)))
  return convertContext({ ...options, messages: [...messages] }, versions, images.resolveAccess)
}
