/** Pure replay projection; meta is untrusted history until Host rechecks the Session. */
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined

export interface ImageCardInput {
  phase: string
  callId: string
  block: { isError?: boolean; call?: { name: string } | null; meta?: unknown }
}

export function imageCard(input: ImageCardInput): string | null {
  if (input.phase !== 'result' || input.block.isError !== false
    || input.block.call?.name !== 'codex_generate_image') return null
  const meta = record(input.block.meta)
  const ref = record(meta?.image)
  if (typeof meta?.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(meta.sessionId)
    // `|` is part of a real recorded call ID: the gateway call ID joined to the
    // upstream provider function-call ID. Rejecting it hides a delivered image.
    || !/^[a-zA-Z0-9_:|-]{1,128}$/.test(input.callId)
    || typeof ref?.attachmentId !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(ref.attachmentId)) return null
  return `/api/codex-subscription/image?sessionId=${encodeURIComponent(meta.sessionId)}&callId=${encodeURIComponent(input.callId)}`
}
