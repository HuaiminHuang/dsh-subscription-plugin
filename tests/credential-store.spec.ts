import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { codexCredentialStore } from '../src/credential-store.ts'

describe('codexCredentialStore', () => {
  it('keeps a valid OAuth grant isolated to the Codex pi provider', async () => {
    let record: unknown
    const ctx = {
      credentials: {
        readRecord: async () => record,
        modifyRecord: async (_key: unknown, change: (current: unknown) => Promise<unknown>) => (record = await change(record)),
        deleteRecord: async () => { record = undefined },
      },
    } as unknown as Context
    const store = codexCredentialStore(ctx)
    const grant = { type: 'oauth' as const, access: 'access-only-in-host', refresh: 'refresh-only-in-host', expires: 123 }

    await store.modify('openai-codex', async () => grant)
    expect(await store.list()).toEqual([{ providerId: 'openai-codex', type: 'oauth' }])
    expect(await store.read('openai-codex')).toEqual(grant)
    await expect(store.read('another-provider')).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' })
    await store.delete('openai-codex')
    expect(await store.read('openai-codex')).toBeUndefined()
  })
})
