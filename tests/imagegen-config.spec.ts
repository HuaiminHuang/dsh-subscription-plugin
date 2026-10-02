import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include'

import { load } from 'js-yaml'
const bundle = load(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'))

describe('image tool Plugins switch', () => {
  it('starts all Bundle rows by default and independently applies persisted image enablement', () => {
    const warn = vi.fn()
    const rows = applyEntryPatches([], bundle, warn)
    expect(rows.map(row => [row.id, row.name, Boolean(row.disabled)])).toEqual([
      ['openai-subscription', '@h2mzzz/dsh-openai-subscription', false],
      ['openai-subscription-imagegen', '@h2mzzz/dsh-openai-subscription/imagegen', false],
      ['openai-subscription-model-control', '@h2mzzz/dsh-openai-subscription/model-control', false],
    ])
    const off = applyEntryPatches(rows, [{ id: 'openai-subscription-imagegen', disabled: true }], warn)
    expect(off.find(row => row.id === 'openai-subscription-imagegen')?.disabled).toBe(true)
    expect(off.find(row => row.id === 'openai-subscription')?.disabled).toBeUndefined()
    const compactOff = applyEntryPatches(off, [{ id: 'openai-subscription-model-control', disabled: true }], warn)
    expect(compactOff.find(row => row.id === 'openai-subscription-model-control')?.disabled).toBe(true)
    expect(compactOff.find(row => row.id === 'openai-subscription')?.disabled).toBeUndefined()
    expect(compactOff.find(row => row.id === 'openai-subscription-imagegen')?.disabled).toBe(true)
    const on = applyEntryPatches(off, [{ id: 'openai-subscription-imagegen', disabled: false }], warn)
    expect(on.find(row => row.id === 'openai-subscription-imagegen')?.disabled).toBe(false)
    expect(rows.every(row => row.disabled === undefined)).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })
})
