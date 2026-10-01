/** Read the Markdown shipped with this Bundle; no global skill-directory writes. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SkillRegistration } from '@deepseek-ai/dsh-skill'

export function imageSkill(): SkillRegistration {
  const directory = dirname(fileURLToPath(import.meta.url))
  const root = directory.endsWith('/lib') ? join(directory, '..') : join(directory, '../..')
  const markdown = readFileSync(join(root, 'skills/codex-subscription-imagegen/SKILL.md'), 'utf8')
  const match = /^---\nname: codex-subscription-imagegen\ndescription: ([^\n]+)\n---\n\n([\s\S]+)$/.exec(markdown)
  if (match === null || !match[2]?.includes('codex_generate_image')) throw new Error('Invalid bundled image skill')
  return {
    name: 'codex-subscription-imagegen', description: match[1]!, content: match[2], source: 'runtime',
  }
}
