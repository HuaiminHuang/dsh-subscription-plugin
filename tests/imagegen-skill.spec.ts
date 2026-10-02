import { describe, expect, it } from 'vitest'
import { imageSkill, imageSkillUrl, parseImageSkill } from '../src/imagegen/skill.ts'

describe('packaged image skill', () => {
  it('loads a package-owned runtime body that calls only the Host tool', () => {
    const skill = imageSkill()
    expect(skill.name).toBe('codex-subscription-imagegen')
    expect(skill.content).toContain('codex_generate_image')
    expect(skill.content).not.toMatch(/OPENAI_API_KEY|~\/\.codex|python/i)
  })
})

// Windows drive paths, UNC shares and POSIX paths all resolve without native parsing.
it.each([
  ['file:///C:/插件%20项目/lib/imagegen.js', 'file:///C:/插件%20项目/skills/codex-subscription-imagegen/SKILL.md'],
  ['file://server/share/plugin/lib/imagegen.js', 'file://server/share/plugin/skills/codex-subscription-imagegen/SKILL.md'],
  ['file:///Users/test/plugin/src/imagegen/skill.ts', 'file:///Users/test/plugin/skills/codex-subscription-imagegen/SKILL.md'],
  ['file:///tmp/plugin/lib/imagegen.js', 'file:///tmp/plugin/skills/codex-subscription-imagegen/SKILL.md'],
])('resolves the skill from %s', (moduleUrl, expected) => {
  expect(imageSkillUrl(moduleUrl).href).toBe(new URL(expected).href)
})

it('accepts CRLF without changing the Skill identity or body', () => {
  const markdown = '---\nname: codex-subscription-imagegen\ndescription: Test image skill\n---\n\nUse codex_generate_image\n'
  expect(parseImageSkill(markdown.replaceAll('\n', '\r\n'))).toEqual(parseImageSkill(markdown))
})
