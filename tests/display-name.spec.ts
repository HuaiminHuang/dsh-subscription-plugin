import { expect, it } from 'vitest'
import { CodexSubscriptionAdapter } from '../src/adapter.ts'
import type { CodexSubscriptionController } from '../src/controller.ts'
import { en, zh } from '../src/client/locales.ts'

it('shows OpenAI without claiming the official openai route', () => {
  const adapter = new CodexSubscriptionAdapter({} as CodexSubscriptionController)
  expect(adapter.providerInfo()).toEqual({ id: 'codex-subscription', name: 'OpenAI' })
  for (const locale of [en, zh]) {
    expect(locale.nav).toBe('OpenAI')
    expect(locale.title).toBe('OpenAI')
  }
})
