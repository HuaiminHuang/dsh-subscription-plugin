import { describe, expect, it } from 'vitest'
import { imageSkill } from '../src/imagegen/skill.ts'

describe('packaged image skill', () => {
  it('loads a package-owned runtime body that calls only the Host tool', () => {
    const skill = imageSkill()
    expect(skill.name).toBe('codex-subscription-imagegen')
    expect(skill.content).toContain('codex_generate_image')
    expect(skill.content).not.toMatch(/OPENAI_API_KEY|~\/\.codex|python/i)
  })
})
