import { describe, expect, it } from 'vitest'
import { imageCard } from '../src/client/imagegen/card.ts'

const ref = { attachmentId: `sha256:${'b'.repeat(64)}`, mediaType: 'image/png', bytes: 3, width: 1, height: 1 }
// A real recorded call ID: the gateway ID joined to the provider function-call ID.
const joined = 'call_22weLBOZWrmCKfcfKuf0AoIR|fc_0a8c9f33f26f3a30016abe2f194f8087d0b9870f0a042edf6f'

describe('generated image tool card', () => {
  it('builds a same-origin request only for a successful result of our tool', () => {
    expect(imageCard({ phase: 'result', callId: 'call-1', block: {
      isError: false, call: { name: 'codex_generate_image' }, meta: { sessionId: 'example', image: ref },
    } })).toBe('/api/codex-subscription/image?sessionId=example&callId=call-1')
  })
  it('accepts the provider-joined call ID that the gateway records', () => {
    expect(imageCard({ phase: 'result', callId: joined, block: {
      isError: false, call: { name: 'codex_generate_image' }, meta: { sessionId: 'example', image: ref },
    } })).toBe(`/api/codex-subscription/image?sessionId=example&callId=${encodeURIComponent(joined)}`)
  })
  it('rejects arbitrary paths, failure results and unrelated tool output', () => {
    expect(imageCard({ phase: 'result', callId: 'call-1', block: { isError: true, call: { name: 'codex_generate_image' }, meta: { sessionId: 'example', image: ref } } })).toBeNull()
    expect(imageCard({ phase: 'result', callId: 'call-1', block: { isError: false, call: { name: 'other' }, meta: { sessionId: 'example', image: ref } } })).toBeNull()
    expect(imageCard({ phase: 'result', callId: 'call-1', block: { isError: false, call: { name: 'codex_generate_image' }, meta: { sessionId: '../private', image: ref } } })).toBeNull()
  })
})
