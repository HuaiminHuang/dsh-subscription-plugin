import type { AuthContext, Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { CODEX_CREDENTIAL_KEY, PI_PROVIDER_ID } from './constants.ts'

/** Validate the minimal persisted pi-ai OAuth grant before passing it to pi-ai. */
function credentialFromRecord(record: Awaited<ReturnType<Context['credentials']['readRecord']>>): Credential | undefined {
  if (record?.kind !== 'grant' || typeof record.payload !== 'object' || record.payload === null) return undefined
  const payload = record.payload as Record<string, unknown>
  if (payload.type !== 'oauth' || typeof payload.access !== 'string' || typeof payload.refresh !== 'string'
    || typeof payload.expires !== 'number' || !Number.isFinite(payload.expires)) return undefined
  return payload as Credential
}

/** pi-ai storage restricted to this plugin's one Codex OAuth record. */
export function codexCredentialStore(ctx: Context): CredentialStore {
  const assertProvider = (providerId: string): void => {
    if (providerId !== PI_PROVIDER_ID) {
      throw new LlmError(`Codex credential storage does not own provider "${providerId}"`, 'INVALID_CREDENTIAL')
    }
  }
  return {
    async read(providerId) {
      assertProvider(providerId)
      return credentialFromRecord(await ctx.credentials.readRecord(CODEX_CREDENTIAL_KEY))
    },
    async list(): Promise<readonly CredentialInfo[]> {
      const record = await ctx.credentials.readRecord(CODEX_CREDENTIAL_KEY)
      return credentialFromRecord(record) === undefined ? [] : [{ providerId: PI_PROVIDER_ID, type: 'oauth' }]
    },
    async modify(providerId, mutate) {
      assertProvider(providerId)
      const record = await ctx.credentials.modifyRecord(CODEX_CREDENTIAL_KEY, async current => {
        const next = await mutate(credentialFromRecord(current))
        return next === undefined ? undefined : { kind: 'grant', payload: next }
      })
      return credentialFromRecord(record)
    },
    async delete(providerId) {
      assertProvider(providerId)
      await ctx.credentials.deleteRecord(CODEX_CREDENTIAL_KEY)
    },
  }
}

/** Prevent pi-ai from discovering Codex CLI files or ambient credentials owned by another application. */
export const isolatedAuthContext: AuthContext = {
  async env() { return undefined },
  async fileExists() { return false },
}
