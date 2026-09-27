import { attributionHeaders, LlmAdapter, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmModelReasoningInfo, LlmProviderInfo, LlmResolvedModelInfo, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm'
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai'
import type { Api, Model, ModelThinkingLevel, ThinkingLevel } from '@earendil-works/pi-ai'
import { PROVIDER_ID } from './constants.ts'
import { toPiContext } from './pi-context.ts'
import { toStreamChunks } from './stream.ts'
import type { CodexSubscriptionController } from './controller.ts'

/** Only advertise distinct settings pi-ai can actually send for this model. */
function reasoningLevels(model: Model<Api>): ThinkingLevel[] {
  if (!model.reasoning) return []
  const supported = getSupportedThinkingLevels(model)
  return supported.filter((level): level is ThinkingLevel => {
    // In Codex, "off" omits the parameter; that retains the server default,
    // rather than reliably disabling reasoning.
    if (level === 'off') return false
    const mapped = model.thinkingLevelMap?.[level]
    // The installed Codex catalog aliases "minimal" to "low". Do not offer
    // two controls that result in the same upstream effort.
    return mapped === undefined || mapped === level || !supported.includes(mapped as ModelThinkingLevel)
  })
}

function reasoningInfo(model: Model<Api>): LlmModelReasoningInfo | undefined {
  const levels = reasoningLevels(model)
  if (levels.length === 0) return undefined
  return {
    efforts: levels.map(level => ({
      id: ReasoningEffortId(level),
      name: level === 'xhigh' ? 'Extra high' : level.charAt(0).toUpperCase() + level.slice(1),
    })),
    ...levels.includes('medium') ? { defaultEffort: ReasoningEffortId('medium') } : {},
  }
}

/** DSH adapter over the isolated pi-ai Codex provider owned by this plugin. */
export class CodexSubscriptionAdapter extends LlmAdapter {
  constructor(private readonly controller: CodexSubscriptionController) { super() }

  override providerInfo(): LlmProviderInfo {
    return { id: PROVIDER_ID, name: 'OpenAI' }
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
    const reasoning = reasoningInfo(model)
    return {
      provider: PROVIDER_ID,
      id: model.id,
      name: model.name,
      // Image input is intentionally deferred until attachment conversion is verified against Codex.
      inputModalities: ['text'],
      context: { contextWindow: model.contextWindow },
      ...reasoning === undefined ? {} : { reasoning },
    }
  }

  private async * streamWithModel(options: GenerateOptions, model: Model<Api>): AsyncGenerator<StreamChunk> {
    if (options.stop !== undefined) throw new LlmError('Codex subscription does not support stop sequences', 'UNSUPPORTED_OPTION')
    const levels = reasoningLevels(model)
    const reasoning = options.reasoningEffort === undefined
      ? levels.includes('medium') ? 'medium' : undefined
      : levels.find(level => level === options.reasoningEffort)
    if (options.reasoningEffort !== undefined && reasoning === undefined) {
      throw new LlmError(`Codex model "${model.id}" does not support reasoning effort "${options.reasoningEffort}"`, 'UNSUPPORTED_REASONING_EFFORT')
    }
    using request = this.controller.openRequest(options.signal)
    const events = this.controller.models.streamSimple(model, toPiContext({ ...options, signal: request.signal }), {
      signal: request.signal,
      ...options.temperature === undefined ? {} : { temperature: options.temperature },
      ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
      ...options.sessionId === undefined ? {} : { sessionId: String(options.sessionId) },
      ...reasoning === undefined ? {} : { reasoning },
      headers: attributionHeaders(),
      maxRetries: 0,
    })
    yield* toStreamChunks(events)
  }

  private assertProvider(provider: string): void {
    if (provider !== PROVIDER_ID) throw new LlmError(`Codex subscription does not own provider "${provider}"`, 'NO_ADAPTER')
  }
}
