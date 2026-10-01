import { describe, it, expect } from 'vitest'
import { CodexSubscriptionController } from '../src/controller.ts'
import { speedPayload } from '../src/speed.ts'
import { sliderStops } from '../src/client/model-options.ts'

const host = () => Object.assign(Object.create(CodexSubscriptionController.prototype) as CodexSubscriptionController, {
  state: { status: 'signed-in', models: [] }, disposed: false, fastSelections: new Set<string>(),
  availableModels: () => [{ id: 'gpt-6-sol' }, { id: 'gpt-6-luna' }, { id: 'gpt-unknown' }],
})
describe('independent Fast mode', () => {
  it('isolates speed by session and model without creating model variants', () => {
    const controller = host()
    expect(controller.setSpeed('session-a', 'gpt-6-sol', true)).toEqual({ enabled: true, supported: true })
    expect(controller.requestFast('session-a', 'gpt-6-sol')).toBe(true)
    expect(controller.requestFast('session-b', 'gpt-6-sol')).toBe(false)
    expect(controller.requestFast('session-a', 'gpt-6-luna')).toBe(false)
    expect(controller.setSpeed('session-a', 'gpt-6-sol', false).enabled).toBe(false)
  })
  it('refuses unsupported models and malformed Remote inputs', () => {
    const controller = host()
    expect(() => controller.setSpeed('session-a', 'gpt-unknown', true)).toThrow()
    expect(() => controller.setSpeed('../other', 'gpt-6-sol', true)).toThrow()
    expect(() => controller.setSpeed('session-a', 'gpt-6-sol', 'yes' as unknown as boolean)).toThrow()
  })
  it('changes only the request service tier and preserves reasoning and tool fields', () => {
    const original = { model: 'gpt-6-sol', reasoning: { effort: 'high' }, tools: [{ type: 'function' }] }
    expect(speedPayload(true)(original)).toEqual({ ...original, service_tier: 'fast' })
    expect(speedPayload(false)(original)).toEqual({ ...original, service_tier: 'default' })
    expect(original).not.toHaveProperty('service_tier')
  })
})
describe('provider-owned slider stops', () => {
  it('preserves all exact provider effort IDs, including off and custom IDs', () => {
    const reasoning = { efforts: [{ id: 'off', name: 'Off' }, { id: 'balanced', name: 'Balanced' }, { id: 'max', name: 'Max' }], defaultEffort: 'balanced' }
    expect(sliderStops(reasoning, 'Default')).toEqual(reasoning.efforts)
  })
  it('offers provider default only when there is no explicit default, and no fabricated steps', () => {
    expect(sliderStops({ efforts: [{ id: 'medium', name: 'Medium' }] }, 'Default'))
      .toEqual([{ id: undefined, name: 'Default' }, { id: 'medium', name: 'Medium' }])
    expect(sliderStops(undefined, 'Default')).toEqual([])
    expect(sliderStops({ efforts: [] }, 'Default')).toEqual([])
  })
})
