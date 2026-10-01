import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { applyEntryPatches } from '../../deepseek-harness/vendor/include/lib/index.js'

const targetRequire = createRequire(new URL('../../deepseek-harness/vendor/include/package.json', import.meta.url))
const { load } = targetRequire('js-yaml')
const bundle = load(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'))

describe('image tool Plugins switch', () => {
  it('starts all Bundle rows by default and independently applies persisted image enablement', () => {
    const warn = vi.fn()
    const rows = applyEntryPatches([], bundle, warn)
    expect(rows.map(row => [row.id, row.name, Boolean(row.disabled)])).toEqual([
      ['openai-subscription', '@h2mzzz/dsh-openai-subscription', false],
      ['openai-subscription-imagegen', '@h2mzzz/dsh-openai-subscription/imagegen', false],
    ])
    const off = applyEntryPatches(rows, [{ id: 'openai-subscription-imagegen', disabled: true }], warn)
    expect(off.find(row => row.id === 'openai-subscription-imagegen')?.disabled).toBe(true)
    expect(off.find(row => row.id === 'openai-subscription')?.disabled).toBeUndefined()
    const on = applyEntryPatches(off, [{ id: 'openai-subscription-imagegen', disabled: false }], warn)
    expect(on.find(row => row.id === 'openai-subscription-imagegen')?.disabled).toBe(false)
    expect(rows.every(row => row.disabled === undefined)).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })
})
