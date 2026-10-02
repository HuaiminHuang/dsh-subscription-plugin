/** Resolve reference images through the owning session, never arbitrary paths or URLs. */
import type { SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import { object, reference, resultImage, type ImageSource } from './artifact.ts'

export const MAX_REFERENCE_IMAGES = 10
export const MAX_REFERENCE_BYTES = 20_000_000
export const MAX_TOTAL_REFERENCE_BYTES = 50_000_000
export type ReferenceSelector = { attachment_id: string; tool_call_id?: never } | { tool_call_id: string; attachment_id?: never }

export class ReferenceImageError extends Error {}

/** Validate tool input before any session read, attachment read or authorization borrow. */
export function parseReferenceSelectors(value: unknown): readonly ReferenceSelector[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new ReferenceImageError('Reference images must be an array')
  if (value.length > MAX_REFERENCE_IMAGES) throw new ReferenceImageError('At most 10 reference images are allowed; remove extra images and retry')
  return value.map(item => {
    const selector = object(item)
    if (selector === undefined || Object.keys(selector).length !== 1) throw new ReferenceImageError('Each reference requires exactly one attachment_id or tool_call_id')
    if (typeof selector.attachment_id === 'string' && /^sha256:[a-f0-9]{64}$/.test(selector.attachment_id)) return { attachment_id: selector.attachment_id }
    if (typeof selector.tool_call_id === 'string' && /^[a-zA-Z0-9_:|-]{1,128}$/.test(selector.tool_call_id)) return { tool_call_id: selector.tool_call_id }
    throw new ReferenceImageError('Use an image attachment ID or a previous codex_generate_image tool call ID from this session')
  })
}

/** Select from Host-admitted user images and successful tool images in this session only. */
export async function loadReferenceImages(source: ImageSource, sessionId: string, selectors: readonly ReferenceSelector[], signal: AbortSignal): Promise<readonly SaveImageAttachment[]> {
  signal.throwIfAborted()
  const events = await source.events(sessionId, signal)
  const admitted = new Map<string, NonNullable<ReturnType<typeof reference>>>()
  for (const event of events) {
    const data = object(event.data)
    const message = event.type === 'user/message' ? data : event.type === 'tool/result' ? object(data?.message) : undefined
    if (!message || (event.type === 'tool/result' && message.isError !== false) || !Array.isArray(message.content)) continue
    for (const part of message.content) {
      const block = object(part)
      const ref = block?.type === 'image' ? reference(block.attachment) : undefined
      if (ref) admitted.set(ref.attachmentId, ref)
    }
  }
  const refs = selectors.map(selector => {
    const ref = selector.attachment_id !== undefined ? admitted.get(selector.attachment_id) : resultImage(events, sessionId, selector.tool_call_id)
    if (!ref) throw new ReferenceImageError('Reference image is unavailable in this session; upload it here or select a successful image tool result')
    return ref
  })
  if (refs.reduce((sum, ref) => sum + ref.bytes, 0) > MAX_TOTAL_REFERENCE_BYTES) throw new ReferenceImageError('Reference images exceed the 50 MB total limit; use smaller images')
  const images: SaveImageAttachment[] = []
  for (const ref of refs) {
    signal.throwIfAborted()
    let stored
    try { stored = await source.readImage(ref, signal) }
    catch { signal.throwIfAborted(); throw new ReferenceImageError('Reference image could not be read; upload it again and retry') }
    signal.throwIfAborted()
    if (stored.ref.attachmentId !== ref.attachmentId || stored.ref.mediaType !== ref.mediaType || stored.data.byteLength !== ref.bytes || stored.data.byteLength > MAX_REFERENCE_BYTES) throw new ReferenceImageError('Reference image does not match its stored attachment')
    images.push({ data: stored.data, mediaType: ref.mediaType })
  }
  return images
}
