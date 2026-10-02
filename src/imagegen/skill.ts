/** Read the Markdown shipped with this Bundle; no global skill-directory writes. */
import { readFileSync } from 'node:fs'
import type { SkillRegistration } from '@deepseek-ai/dsh-skill'

/** Resolve source and bundled layouts as URLs, independent of native separators. */
export function imageSkillUrl(moduleUrl: string): URL {
  const directory = new URL('.', moduleUrl)
  const parent = directory.pathname.endsWith('/lib/') ? '../' : '../../'
  return new URL(`${parent}skills/codex-subscription-imagegen/SKILL.md`, directory)
}

export function imageSkill(): SkillRegistration {
  return parseImageSkill(readFileSync(imageSkillUrl(import.meta.url), 'utf8'))
}

/** Git checkouts may use CRLF even though release assets use LF. */
export function parseImageSkill(markdown: string): SkillRegistration {
  markdown = markdown.replaceAll('\r\n', '\n')
  const match = /^---\nname: codex-subscription-imagegen\ndescription: ([^\n]+)\n---\n\n([\s\S]+)$/.exec(markdown)
  if (match === null || !match[2]?.includes('codex_generate_image')) throw new Error('Invalid bundled image skill')
  return {
    name: 'codex-subscription-imagegen', description: match[1]!, content: match[2], source: 'runtime',
  }
}
