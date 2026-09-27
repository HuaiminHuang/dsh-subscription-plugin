/**
 * Client Remote descriptors for this package's Host controller.
 *
 * This mirrors the generated Typert contribution format because external
 * plugin packages are not members of DSH's workspace-wide generator program.
 */
import { z } from 'zod'
import type { RemoteResult, RemoteStreamHandle, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { CodexSubscriptionState } from './types.ts'

const prompt = z.object({
  kind: z.literal('select').readonly(),
  message: z.string().readonly(),
  options: z.array(z.object({ id: z.string().readonly(), label: z.string().readonly(), description: z.string().readonly().optional() })).readonly(),
})

const state = z.object({
  status: z.union([z.literal('checking'), z.literal('signed-out'), z.literal('signing-in'), z.literal('signed-in'), z.literal('error')]).readonly(),
  attemptId: z.string().readonly().optional(),
  notice: z.object({ message: z.string().readonly(), url: z.string().readonly().optional(), code: z.string().readonly().optional() }).readonly().optional(),
  prompt: prompt.readonly().optional(),
  models: z.array(z.object({ id: z.string().readonly(), name: z.string().readonly() })).readonly(),
  error: z.union([z.literal('login-failed'), z.literal('saved-login-unavailable')]).readonly().optional(),
  checkedAt: z.string().readonly().optional(),
})

const string = () => z.string()
const stateCodec = () => state

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    codexSubscription: {
      getState(): Promise<RemoteResult<CodexSubscriptionState>>
      beginLogin(): Promise<RemoteResult<CodexSubscriptionState>>
      cancelLogin(attemptId: string): Promise<RemoteResult<CodexSubscriptionState>>
      answerChoice(attemptId: string, answer: string): Promise<RemoteResult<CodexSubscriptionState>>
      refreshLogin(): Promise<RemoteResult<CodexSubscriptionState>>
      signOut(): Promise<RemoteResult<CodexSubscriptionState>>
      watch(signal?: AbortSignal): RemoteStreamHandle<CodexSubscriptionState, never>
    }
  }
}

/** Remote contribution mounted by the Client entry before it registers its settings page. */
export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: 'dsh-openai-subscription',
  descriptors: [
    { id: 'dsh-openai-subscription#codexSubscription/getState', service: 'codexSubscription', namespace: 'codexSubscription', method: 'getState', invocation: { kind: 'direct' }, parameters: [], result: { mode: 'strict', typeSymbol: 'dsh-openai-subscription#state', create: stateCodec }, sourceLocation: { file: 'src/controller.ts', line: 91, column: 3 } },
    { id: 'dsh-openai-subscription#codexSubscription/beginLogin', service: 'codexSubscription', namespace: 'codexSubscription', method: 'beginLogin', invocation: { kind: 'direct' }, parameters: [], result: { mode: 'strict', typeSymbol: 'dsh-openai-subscription#state', create: stateCodec }, sourceLocation: { file: 'src/controller.ts', line: 95, column: 3 } },
    { id: 'dsh-openai-subscription#codexSubscription/cancelLogin', service: 'codexSubscription', namespace: 'codexSubscription', method: 'cancelLogin', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', create: string } }], result: { mode: 'strict', typeSymbol: 'dsh-openai-subscription#state', create: stateCodec }, sourceLocation: { file: 'src/controller.ts', line: 124, column: 3 } },
    { id: 'dsh-openai-subscription#codexSubscription/answerChoice', service: 'codexSubscription', namespace: 'codexSubscription', method: 'answerChoice', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', create: string } }, { name: 'answer', wire: 'answer', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', create: string } }], result: { mode: 'strict', typeSymbol: 'dsh-openai-subscription#state', create: stateCodec }, sourceLocation: { file: 'src/controller.ts', line: 133, column: 3 } },
    { id: 'dsh-openai-subscription#codexSubscription/refreshLogin', service: 'codexSubscription', namespace: 'codexSubscription', method: 'refreshLogin', invocation: { kind: 'direct' }, parameters: [], result: { mode: 'strict', typeSymbol: 'dsh-openai-subscription#state', create: stateCodec }, sourceLocation: { file: 'src/controller.ts', line: 149, column: 3 } },
    { id: 'dsh-openai-subscription#codexSubscription/signOut', service: 'codexSubscription', namespace: 'codexSubscription', method: 'signOut', invocation: { kind: 'direct' }, parameters: [], result: { mode: 'strict', typeSymbol: 'dsh-openai-subscription#state', create: stateCodec }, sourceLocation: { file: 'src/controller.ts', line: 157, column: 3 } },
    { id: 'dsh-openai-subscription#codexSubscription/watch', service: 'codexSubscription', namespace: 'codexSubscription', method: 'watch', mode: 'stream', invocation: { kind: 'direct' }, parameters: [], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: 'dsh-openai-subscription#state', create: stateCodec }, sourceLocation: { file: 'src/controller.ts', line: 168, column: 10 } },
  ],
}

export default TYPERT_REMOTE
