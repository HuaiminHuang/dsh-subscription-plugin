/**
 * Client Remote descriptors for this package's Host controller.
 *
 * This mirrors the generated Typert contribution format because external
 * plugin packages are not members of DSH's workspace-wide generator program.
 */
import { z } from 'zod'
import type { RemoteResult, RemoteStreamHandle, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { CodexLoginMethod, CodexSubscriptionState } from './types.ts'

const loginMethod = () => z.enum(['browser', 'device_code'])

const state = z.object({
  status: z.union([z.literal('checking'), z.literal('signed-out'), z.literal('signing-in'), z.literal('signed-in'), z.literal('error')]).readonly(),
  instanceId: z.string().readonly().optional(),
  revision: z.number().int().nonnegative().readonly().optional(),
  attemptId: z.string().readonly().optional(),
  method: loginMethod().readonly().optional(),
  notice: z.object({ kind: loginMethod().or(z.literal('progress')).readonly(), url: z.string().readonly().optional(), code: z.string().readonly().optional() }).readonly().optional(),
  models: z.array(z.object({ id: z.string().readonly(), name: z.string().readonly() })).readonly(),
  error: z.union([z.literal('login-failed'), z.literal('login-timeout'), z.literal('saved-login-unavailable')]).readonly().optional(),
  checkedAt: z.string().readonly().optional(),
})

const string = () => z.string()
const stateCodec = () => state

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    codexSubscription: {
      getState(): Promise<RemoteResult<CodexSubscriptionState>>
      beginLogin(method: CodexLoginMethod): Promise<RemoteResult<CodexSubscriptionState>>
      cancelLogin(attemptId: string): Promise<RemoteResult<CodexSubscriptionState>>
      signOut(): Promise<RemoteResult<CodexSubscriptionState>>
      refreshModels(): Promise<RemoteResult<CodexSubscriptionState>>
      watch(signal?: AbortSignal): RemoteStreamHandle<CodexSubscriptionState, never>
    }
  }
}

/** Remote contribution mounted by the Client entry before it registers its settings page. */
export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: '@h2mzzz/dsh-openai-subscription',
  descriptors: [
    { id: '@h2mzzz/dsh-openai-subscription#codexSubscription/getState', service: 'codexSubscription', namespace: 'codexSubscription', method: 'getState', invocation: { kind: 'direct' }, parameters: [], result: { mode: 'strict', typeSymbol: '@h2mzzz/dsh-openai-subscription#state', create: stateCodec }, sourceLocation: { file: 'src/controller.ts', line: 91, column: 3 } },
    { id: '@h2mzzz/dsh-openai-subscription#codexSubscription/beginLogin', service: 'codexSubscription', namespace: 'codexSubscription', method: 'beginLogin', invocation: { kind: 'direct' }, parameters: [{ name: 'method', wire: 'method', source: 'json', codec: { mode: 'strict', typeSymbol: '@h2mzzz/dsh-openai-subscription#loginMethod', create: loginMethod } }], result: { mode: 'strict', typeSymbol: '@h2mzzz/dsh-openai-subscription#state', create: stateCodec }, sourceLocation: { file: 'src/controller.ts', line: 95, column: 3 } },
    { id: '@h2mzzz/dsh-openai-subscription#codexSubscription/cancelLogin', service: 'codexSubscription', namespace: 'codexSubscription', method: 'cancelLogin', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', create: string } }], result: { mode: 'strict', typeSymbol: '@h2mzzz/dsh-openai-subscription#state', create: stateCodec }, sourceLocation: { file: 'src/controller.ts', line: 124, column: 3 } },
    { id: '@h2mzzz/dsh-openai-subscription#codexSubscription/signOut', service: 'codexSubscription', namespace: 'codexSubscription', method: 'signOut', invocation: { kind: 'direct' }, parameters: [], result: { mode: 'strict', typeSymbol: '@h2mzzz/dsh-openai-subscription#state', create: stateCodec }, sourceLocation: { file: 'src/controller.ts', line: 157, column: 3 } },
    { id: '@h2mzzz/dsh-openai-subscription#codexSubscription/refreshModels', service: 'codexSubscription', namespace: 'codexSubscription', method: 'refreshModels', invocation: { kind: 'direct' }, parameters: [], result: { mode: 'strict', typeSymbol: '@h2mzzz/dsh-openai-subscription#state', create: stateCodec }, sourceLocation: { file: 'src/controller.ts', line: 203, column: 3 } },
    { id: '@h2mzzz/dsh-openai-subscription#codexSubscription/watch', service: 'codexSubscription', namespace: 'codexSubscription', method: 'watch', mode: 'stream', invocation: { kind: 'direct' }, parameters: [], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: '@h2mzzz/dsh-openai-subscription#state', create: stateCodec }, sourceLocation: { file: 'src/controller.ts', line: 168, column: 10 } },
  ],
}

export default TYPERT_REMOTE
