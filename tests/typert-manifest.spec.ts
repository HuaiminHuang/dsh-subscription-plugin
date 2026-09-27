import { describe, expect, it } from 'vitest'
import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader'
import { TYPERT } from '../src/typert.host.ts'

describe('Typert Host manifest', () => {
  it('is accepted by the target DSH loader and exposes only the Codex namespace', () => {
    const manifest = validateTypertManifest('dsh-openai-subscription', TYPERT)
    expect(manifest.face).toBe('host')
    expect(manifest.invocations.map(item => item.namespace)).toEqual([
      'codexSubscription', 'codexSubscription', 'codexSubscription', 'codexSubscription',
      'codexSubscription', 'codexSubscription', 'codexSubscription',
    ])
  })
})
