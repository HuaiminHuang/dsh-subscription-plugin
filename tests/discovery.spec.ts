import { describe, expect, it, vi } from 'vitest'
import type { Credential } from '@earendil-works/pi-ai'
import { CODEX_CLIENT_VERSION, codexBaselineModels, fetchCodexModels, mergeCatalog } from '../src/discovery.ts'

const access = `a.${Buffer.from(JSON.stringify({
  'https://api.openai.com/auth': { chatgpt_account_id: 'account-1' },
})).toString('base64url')}.b`

const oauth: Credential = { type: 'oauth', access, refresh: 'refresh-1', expires: Date.now() + 3_600_000 }

const liveRow = (overrides: Record<string, unknown> = {}) => ({
  slug: 'gpt-6-sol',
  display_name: 'GPT-6-Sol',
  visibility: 'list',
  supported_in_api: true,
  context_window: 272_000,
  input_modalities: ['text', 'image'],
  supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'max' }],
  default_reasoning_level: 'medium',
  ...overrides,
})

const catalogResponse = (models: unknown, init: ResponseInit = {}) => new Response(
  JSON.stringify({ models }), { status: 200, headers: { 'content-type': 'application/json' }, ...init },
)

/** Parse vendor rows through the real validation path before merging them. */
const discovered = (rows: readonly unknown[]) =>
  fetchCodexModels(
    (async () => catalogResponse(rows)) as unknown as typeof fetch,
    oauth,
    new AbortController().signal,
  )

describe('Codex live model discovery', () => {
  it('requests the entitlement catalog under the pinned client generation', async () => {
    const fetcher = vi.fn(async () => catalogResponse([liveRow()]))
    const models = await fetchCodexModels(fetcher as unknown as typeof fetch, oauth, new AbortController().signal)
    expect(models.map(model => model.slug)).toEqual(['gpt-6-sol'])
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://chatgpt.com/backend-api/codex/models?client_version=${CODEX_CLIENT_VERSION}`)
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${access}`, 'chatgpt-account-id': 'account-1', originator: 'pi' })
  })

  it('keeps a generation that still receives entitlement data, never the installed one', () => {
    // Measured: 0.85.1 (the installed pi-ai generation) answers with an empty list.
    const [major, minor, patch] = CODEX_CLIENT_VERSION.split('.').map(Number)
    expect(major! * 1_000_000 + minor! * 1_000 + patch!).toBeGreaterThan(85_001)
  })

  it.each([
    ['a hidden internal model', [liveRow({ visibility: 'hide' })]],
    ['a model withheld from the API', [liveRow({ supported_in_api: false })]],
    ['a slug outside the accepted shape', [liveRow({ slug: '../escape' })]],
    ['a row without a context window', [liveRow({ context_window: 0 })]],
  ])('never offers %s', async (_, models) => {
    const fetcher = vi.fn(async () => catalogResponse(models))
    expect(await fetchCodexModels(fetcher as unknown as typeof fetch, oauth, new AbortController().signal)).toEqual([])
  })

  it('reports a provider failure instead of an empty catalog', async () => {
    const fetcher = vi.fn(async () => new Response('denied', { status: 403 }))
    await expect(fetchCodexModels(fetcher as unknown as typeof fetch, oauth, new AbortController().signal)).rejects.toThrow('403')
  })

  it('maps a live model onto the installed structure and refuses levels the account cannot send', async () => {
    const template = codexBaselineModels.find(model => model.id === 'gpt-5.6-luna')!
    const [model] = mergeCatalog(await discovered([liveRow({ slug: 'gpt-5.6-luna' })]))
    expect(model!.id).toBe('gpt-5.6-luna')
    expect(model!.provider).toBe('openai-codex')
    expect(model!.maxTokens).toBe(template.maxTokens)
    expect(model!.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
    expect(model!.thinkingLevelMap?.max).toBe('max')
    // xhigh is absent from the live list and must not stay selectable.
    expect(model!.thinkingLevelMap?.xhigh).toBeNull()
  })

  it('offers a model the installed catalog never shipped, with conservative defaults', async () => {
    const [model] = mergeCatalog(await discovered([liveRow({ slug: 'gpt-reserve', context_window: 872_000 })]))
    expect(model!.id).toBe('gpt-reserve')
    expect(model!.provider).toBe('openai-codex')
    expect(model!.reasoning).toBe(true)
    expect(model!.contextWindow).toBe(872_000)
    expect(model!.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
    // Without an installed template the map is still explicit, so only the levels
    // the account may send survive; "minimal" is absent from the live row.
    const offered = Object.entries(model!.thinkingLevelMap ?? {})
      .filter(([, mapped]) => mapped !== null).map(([level]) => level).sort()
    expect(offered).toEqual(['low', 'max', 'medium'])
    expect(model!.thinkingLevelMap?.minimal).toBeNull()
    expect(model!.thinkingLevelMap?.high).toBeNull()
  })

  it('hides every level a template-less model cannot send', async () => {
    const rows = [liveRow({
      slug: 'gpt-newcomer',
      supported_reasoning_levels: [{ effort: 'medium' }],
    })]
    const [model] = mergeCatalog(await discovered(rows))
    const offered = Object.entries(model!.thinkingLevelMap ?? {})
      .filter(([, mapped]) => mapped !== null).map(([level]) => level)
    expect(offered).toEqual(['medium'])
  })

  it('uses only live entries and removes static models absent from a successful discovery', async () => {
    const merged = mergeCatalog(await discovered([liveRow({ slug: 'gpt-5.6-luna' })]))
    const ids = merged.map(model => model.id)
    expect(ids[0]).toBe('gpt-5.6-luna')
    expect(ids).toEqual(['gpt-5.6-luna'])
    expect(new Set(ids).size).toBe(ids.length)
  })
})
