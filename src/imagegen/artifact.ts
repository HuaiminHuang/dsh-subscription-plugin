/** Read-only image delivery. The attachment ID is never an authorization token. */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { IMAGE_SUCCESS_TEXT } from './contract.ts'

interface Event { readonly type: string; readonly data: unknown }

export interface ImageSource {
  events(sessionId: string, signal: AbortSignal): Promise<readonly Event[]>
  readImage(ref: ImageAttachmentRef, signal: AbortSignal): Promise<{ readonly ref: ImageAttachmentRef; readonly data: Uint8Array }>
}

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined

const reference = (value: unknown): ImageAttachmentRef | undefined => {
  const ref = object(value)
  if (ref === undefined || typeof ref.attachmentId !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(ref.attachmentId)
    || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(ref.mediaType))
    || typeof ref.bytes !== 'number' || !Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > 20_000_000
    || typeof ref.width !== 'number' || !Number.isSafeInteger(ref.width) || ref.width < 1
    || typeof ref.height !== 'number' || !Number.isSafeInteger(ref.height) || ref.height < 1) return undefined
  return ref as unknown as ImageAttachmentRef
}

/** Select only the image committed by a successful result of our own tool. */
export function resultImage(events: readonly Event[], sessionId: string, callId: string): ImageAttachmentRef | undefined {
  let called = false
  for (const event of events) {
    const data = object(event.data)
    if (event.type === 'tool/call' && data?.callId === callId) {
      if (called || data.name !== 'codex_generate_image') return undefined
      called = true
    }
    if (event.type !== 'tool/result' || !called) continue
    const message = object(data?.message)
    if (message?.callId !== callId) continue
    // No second result may override a prior failure or link a different image.
    const meta = object(data?.meta)
    const content = message.content
    return message.isError === false && meta?.sessionId === sessionId
      && Array.isArray(content) && content.length === 1
      && object(content[0])?.type === 'text' && object(content[0])?.text === IMAGE_SUCCESS_TEXT
      ? reference(meta.image) : undefined
  }
  return undefined
}

/** Runs behind Connection's Host/Origin + browser-auth fence, not a raw WebServer route. */
export async function imageResponse(request: Request, source: ImageSource): Promise<Response> {
  const notFound = (): Response => new Response('not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') return notFound()
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('sessionId')
    const callId = url.searchParams.get('callId')
    if (url.searchParams.size !== 2 || sessionId === null || callId === null
      || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)
      // `|` joins the gateway call ID to the upstream provider function-call ID,
      // so a real recorded call ID must survive this route's shape check.
      || !/^[a-zA-Z0-9_:|-]{1,128}$/.test(callId)) return notFound()
    const events = await source.events(sessionId, request.signal)
    const ref = resultImage(events, sessionId, callId)
    if (ref === undefined) return notFound()
    const stored = await source.readImage(ref, request.signal)
    if (stored.ref.attachmentId !== ref.attachmentId || stored.data.byteLength !== ref.bytes
      || stored.data.byteLength > 20_000_000) return notFound()
    const headers = {
      'Content-Type': ref.mediaType,
      'Content-Length': String(stored.data.byteLength),
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline; filename="generated-image"',
      'X-Content-Type-Options': 'nosniff',
    }
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(stored.data), { status: 200, headers })
  } catch {
    // No persistence, account, transport, or attachment error detail crosses this boundary.
    return notFound()
  }
}
