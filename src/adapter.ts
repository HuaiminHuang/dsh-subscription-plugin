import { attributionHeaders, LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Api, Model } from '@earendil-works/pi-ai'
import { PROVIDER_ID } from './constants.ts'
import { toPiContext } from './pi-context.ts'
import { toStreamChunks } from './stream.ts'
import type { CodexSubscriptionController } from './controller.ts'

/** DSH adapter over the isolated pi-ai Codex provider owned by this plugin. */
export class CodexSubscriptionAdapter extends LlmAdapter {
  constructor(private readonly controller: CodexSubscriptionController) { super() }

  override providerInfo(): LlmProviderInfo {
    return { id: PROVIDER_ID, name: 'OpenAI / Codex subscription' }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    this.assertProvider(provider)
    return Promise.resolve(this.controller.availableModels().map(model => this.modelInfo(model)))
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    this.assertProvider(provider)
    return Promise.resolve(this.modelInfo(this.model(model)))
  }

  override prepareCall(provider: string, model: string): Promise<PreparedAdapterCall> {
    this.assertProvider(provider)
    const captured = this.model(model)
    return Promise.resolve({ model: this.modelInfo(captured), stream: options => this.streamWithModel(options, captured) })
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.assertProvider(options.provider)
    return this.streamWithModel(options, this.model(options.model))
  }

  private model(modelId: string): Model<Api> {
    const model = this.controller.availableModels().find(candidate => candidate.id === modelId)
    if (model === undefined) throw new LlmError(`Codex subscription has no available model "${modelId}"`, 'UNKNOWN_MODEL')
    return model
  }

  private modelInfo(model: Model<Api>): LlmResolvedModelInfo {
    return {
      provider: PROVIDER_ID,
      id: model.id,
      name: model.name,
      // Image input is intentionally deferred until attachment conversion is verified against Codex.
      inputModalities: ['text'],
      context: { contextWindow: model.contextWindow },
    }
  }

  private async * streamWithModel(options: GenerateOptions, model: Model<Api>): AsyncGenerator<StreamChunk> {
    if (options.stop !== undefined) throw new LlmError('Codex subscription does not support stop sequences', 'UNSUPPORTED_OPTION')
    if (options.reasoningEffort !== undefined) {
      throw new LlmError('Codex subscription does not expose reasoning-effort controls in this release', 'UNSUPPORTED_OPTION')
    }
    using request = this.controller.openRequest(options.signal)
    const events = this.controller.models.streamSimple(model, toPiContext({ ...options, signal: request.signal }), {
      signal: request.signal,
      ...options.temperature === undefined ? {} : { temperature: options.temperature },
      ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
      ...options.sessionId === undefined ? {} : { sessionId: String(options.sessionId) },
      headers: attributionHeaders(),
      maxRetries: 0,
    })
    yield* toStreamChunks(events)
  }

  private assertProvider(provider: string): void {
    if (provider !== PROVIDER_ID) throw new LlmError(`Codex subscription does not own provider "${provider}"`, 'NO_ADAPTER')
  }
}
