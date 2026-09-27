import { describe, expect, it } from 'vitest'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import type { AssistantMessageEvent } from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import { buildModelCatalog } from '../../deepseek-harness/packages/api/session-controller/src/catalog.ts'
import { CodexSubscriptionAdapter } from '../src/adapter.ts'
import type { CodexSubscriptionController } from '../src/controller.ts'

const catalog = openaiCodexProvider().getModels()

function fixture() {
  const calls: unknown[] = []
  const controller = {
    availableModels: () => catalog,
    openRequest: () => ({ signal: new AbortController().signal, [Symbol.dispose]() {} }),
    models: {
      streamSimple: (_model: unknown, _context: unknown, options: unknown) => {
        calls.push(options)
        return (async function* (): AsyncGenerator<AssistantMessageEvent> {
          yield { type: 'done', reason: 'stop', message: {
            role: 'assistant', content: [], api: 'openai-codex-responses', provider: 'openai-codex',
            model: 'gpt-5.6-sol', stopReason: 'stop', timestamp: 0,
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          } }
        })()
      },
    },
  } as unknown as CodexSubscriptionController
  return { adapter: new CodexSubscriptionAdapter(controller), calls }
}

describe('Codex reasoning effort', () => {
  it('advertises only distinct, model-supported effort choices', async () => {
    const { adapter } = fixture()
    for (const model of catalog) {
      const info = await adapter.resolveModel('codex-subscription', model.id)
      const prepared = await adapter.prepareCall('codex-subscription', model.id)
      expect(prepared.model.reasoning).toEqual(info.reasoning)
      const efforts = info.reasoning?.efforts.map(effort => effort.id)
      expect(efforts).toEqual(model.thinkingLevelMap?.max === 'max'
        ? ['low', 'medium', 'high', 'xhigh', 'max']
        : ['low', 'medium', 'high', 'xhigh'])
      expect(info.reasoning?.defaultEffort).toBe('medium')
    }
  })

  it('surfaces efforts in the target DSH model picker catalog', async () => {
    const { adapter } = fixture()
    const ctx = { llm: {
      listProviders: () => [adapter.providerInfo()],
      listModels: (provider: string) => adapter.listModels(provider),
      resolveModelInfo: (provider: string, model: string) => adapter.resolveModel(provider, model),
    } } as unknown as Context
    const catalog = await buildModelCatalog(ctx, { provider: 'codex-subscription', model: 'gpt-5.6-terra', reasoningEffort: 'medium' })
    expect(catalog.groups[0]?.name).toBe('OpenAI')
    const reasoning = catalog.groups[0]?.models.find(model => model.id === 'gpt-5.6-terra')?.reasoning
    expect(reasoning?.efforts.map(effort => effort.id))
      .toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(reasoning?.defaultEffort).toBe('medium')
    expect(catalog.default).toEqual({ provider: 'codex-subscription', model: 'gpt-5.6-terra', reasoningEffort: 'medium' })
  })

  it('passes a selected effort to pi-ai and uses Medium when none is selected', async () => {
    const { adapter, calls } = fixture()
    const selected = await adapter.prepareCall('codex-subscription', 'gpt-5.6-sol')
    for await (const _chunk of selected.stream({ provider: 'codex-subscription', model: 'gpt-5.6-sol',
      messages: [], reasoningEffort: ReasoningEffortId('max') })) { /* drain */ }
    expect(calls[0]).toMatchObject({ reasoning: 'max' })

    for await (const _chunk of adapter.stream({ provider: 'codex-subscription', model: 'gpt-5.4', messages: [] })) { /* drain */ }
    expect(calls[1]).toMatchObject({ reasoning: 'medium' })
  })

  it('rejects unsupported levels before dispatch rather than letting pi-ai clamp them', async () => {
    const { adapter, calls } = fixture()
    for (const [model, effort] of [['gpt-5.4', 'max'], ['gpt-5.6-sol', 'off'], ['gpt-6-astra', 'minimal']] as const) {
      const drain = async () => {
        for await (const _chunk of adapter.stream({ provider: 'codex-subscription', model, messages: [],
          reasoningEffort: ReasoningEffortId(effort) })) { /* drain */ }
      }
      await expect(drain()).rejects.toMatchObject({ code: 'UNSUPPORTED_REASONING_EFFORT' })
    }
    expect(calls).toHaveLength(0)
  })
})
