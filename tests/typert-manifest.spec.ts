import { describe, expect, it } from 'vitest'
import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader'
import { TYPERT } from '../src/typert.host.ts'

describe('Typert Host manifest', () => {
  it('is accepted by the target DSH loader and exposes only the Codex namespace', () => {
    const manifest = validateTypertManifest('@h2mzzz/dsh-openai-subscription', TYPERT)
    expect(manifest.face).toBe('host')
    expect(manifest.invocations.map(item => item.method)).toEqual([
      'getSpeed', 'setSpeed', 'getState', 'beginLogin', 'cancelLogin', 'signOut', 'refreshModels', 'watch',
    ])
    expect(manifest.invocations.every(item => item.namespace === 'codexSubscription')).toBe(true)
  })
})
