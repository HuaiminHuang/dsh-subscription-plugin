import { describe, expect, it } from 'vitest'
import { accountIdFromAccess } from '../src/codex-auth.ts'

const jwt = (payload: unknown): string =>
  `a.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.b`

describe('Codex access-token identity', () => {
  it('reads the account claim from the plugin-owned access token', () => {
    expect(accountIdFromAccess(jwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'account-1' } })))
      .toBe('account-1')
  })

  it.each([
    ['a token that is not a JWT', 'not-a-jwt'],
    ['a payload without the auth namespace', jwt({})],
    ['an auth namespace that is not an object', jwt({ 'https://api.openai.com/auth': 'account-1' })],
    ['a missing account claim', jwt({ 'https://api.openai.com/auth': {} })],
    ['an account claim outside the accepted shape', jwt({ 'https://api.openai.com/auth': { chatgpt_account_id: '../escape' } })],
    ['a token longer than the accepted bound', `a.${'A'.repeat(32_001)}.b`],
  ])('rejects %s', (_, token) => {
    expect(() => accountIdFromAccess(token)).toThrow()
  })
})
