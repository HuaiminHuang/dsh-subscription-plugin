/** Fixed Codex image endpoint. Secrets and provider responses never leave Host. */
import type { ImageAttachmentRef, SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import { accountIdFromAccess } from '../codex-auth.ts'
import { MAX_REFERENCE_IMAGES, MAX_REFERENCE_BYTES, MAX_TOTAL_REFERENCE_BYTES, ReferenceImageError } from './references.ts'

const BASE_URL = 'https://chatgpt.com/backend-api/codex/images/'
const MAX_IMAGE = 20_000_000
const MAX_RESPONSE = 27_000_000

export class ImageGenerationError extends Error {
  constructor(readonly code: 'unauthorized' | 'limited' | 'unavailable' | 'invalid-response' | 'storage') {
    super(`Image generation ${code}`)
  }
}

/** Keep the image error contract while sharing the account-claim reader. */
function accountId(access: string): string {
  try {
    return accountIdFromAccess(access)
  } catch { throw new ImageGenerationError('unauthorized') }
}

export interface ImageBackend {
  fetcher: typeof fetch
  saveImages(inputs: readonly SaveImageAttachment[]): Promise<readonly ImageAttachmentRef[]>
}

function mediaType(data: Buffer): SaveImageAttachment['mediaType'] {
  if (data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png'
  if (data.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg'
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6))) return 'image/gif'
  throw new ImageGenerationError('invalid-response')
}

/** Read a bounded response; never materialize unbounded provider JSON/base64. */
async function bounded(response: Response, signal: AbortSignal): Promise<string> {
  if (response.body === null) throw new ImageGenerationError('invalid-response')
  const reader = response.body.getReader()
  const pieces: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_RESPONSE) throw new ImageGenerationError('invalid-response')
      pieces.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(pieces, length).toString('utf8')
}

/** A single explicit image, using a fresh plugin-owned OAuth access supplied by the controller. */
export async function generateImage(
  backend: ImageBackend, access: string, prompt: string, signal: AbortSignal,
  references: readonly SaveImageAttachment[] = [],
): Promise<ImageAttachmentRef> {
  signal.throwIfAborted()
  if (references.length > MAX_REFERENCE_IMAGES) throw new ReferenceImageError('At most 10 reference images are allowed; remove extra images and retry')
  let total = 0
  for (const image of references) {
    total += image.data.byteLength
    if (image.data.byteLength === 0 || image.data.byteLength > MAX_REFERENCE_BYTES || total > MAX_TOTAL_REFERENCE_BYTES) throw new ReferenceImageError('Reference images exceed the 20 MB per-image or 50 MB total limit')
    if (mediaType(Buffer.from(image.data)) !== image.mediaType) throw new ReferenceImageError('Reference image format does not match its attachment')
  }
  const account = accountId(access)
  if (!prompt.trim() || prompt.length > 4000) throw new ImageGenerationError('invalid-response')
  let response: Response
  try {
    response = await backend.fetcher(BASE_URL + (references.length ? 'edits' : 'generations'), {
      method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${access}`, 'ChatGPT-Account-ID': account, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-2', prompt, background: 'auto', quality: 'auto', size: 'auto',
        ...(references.length ? { images: references.map(image => ({ image_url: `data:${image.mediaType};base64,${Buffer.from(image.data).toString('base64')}` })) } : {}),
      }),
    })
  } catch {
    signal.throwIfAborted()
    throw new ImageGenerationError('unavailable')
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new ImageGenerationError('unauthorized')
    if (response.status === 429) throw new ImageGenerationError('limited')
    throw new ImageGenerationError('unavailable')
  }
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    throw new ImageGenerationError('invalid-response')
  }
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_RESPONSE) throw new ImageGenerationError('invalid-response')
  const text = await bounded(response, signal)
  signal.throwIfAborted()
  let encoded: unknown
  try {
    const parsed: unknown = JSON.parse(text)
    const data = (parsed as { data?: unknown }).data
    if (!Array.isArray(data) || data.length !== 1) throw new Error()
    encoded = (data[0] as { b64_json?: unknown }).b64_json
  } catch { throw new ImageGenerationError('invalid-response') }
  if (typeof encoded !== 'string' || encoded.length > Math.ceil(MAX_IMAGE / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new ImageGenerationError('invalid-response')
  }
  const data = Buffer.from(encoded, 'base64')
  if (data.length === 0 || data.length > MAX_IMAGE) throw new ImageGenerationError('invalid-response')
  const type = mediaType(data)
  signal.throwIfAborted()
  let refs: readonly ImageAttachmentRef[]
  try { refs = await backend.saveImages([{ data, mediaType: type, name: `generated-image.${type.split('/')[1]}` }]) }
  catch { throw new ImageGenerationError('storage') }
  signal.throwIfAborted()
  if (refs.length !== 1) throw new ImageGenerationError('storage')
  return refs[0]!
}
