/**
 * Live Codex model discovery for this plugin's own subscription grant.
 *
 * The catalog that ships inside `@earendil-works/pi-ai` is a frozen generated JSON
 * file, so a released DSH keeps advertising the models that were current when that
 * dependency was cut. The backend exposes the account's real catalog at
 * `GET /backend-api/codex/models`, but gates the answer by the `client_version`
 * query parameter: the installed generation (`0.85.1`) is answered with an empty
 * list. Discovery therefore replaces the catalog for this process only, and never
 * with an empty one — a failure keeps whatever catalog is already in use.
 */
import type { Api, Credential, Model, ModelThinkingLevel, ThinkingLevelMap } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { PI_PROVIDER_ID } from './constants.ts'
import { accountIdFromAccess } from './codex-auth.ts'

/** Endpoint that returns the account's entitlement catalog. */
const MODELS_URL = 'https://chatgpt.com/backend-api/codex/models'

/**
 * Client generation sent as `client_version`. It is a deliberate wire floor, not
 * the installed pi-ai version: the endpoint withholds models whose
 * `minimal_client_version` exceeds it. Measured against one account: `0.99.2`
 * returned one model, `0.150.0` six, and this generation the full catalog.
 */
export const CODEX_CLIENT_VERSION = '0.160.0'

/** Bound the discovery response; the catalog never reaches the Client raw. */
const MAX_RESPONSE_BYTES = 4_000_000

/**
 * The models that ship inside pi-ai, captured once. Used as the structural
 * template for a live model and as the fallback catalog while the vendor has not
 * answered for this account.
 */
export const codexBaselineModels: readonly Model<Api>[] = openaiCodexProvider().getModels()

const THINKING_LEVELS: readonly ModelThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const slugPattern = /^[a-zA-Z0-9._-]{1,128}$/
const effortPattern = /^[a-z]{1,16}$/

/** Structural field every live model needs before it can be streamed. */
const FALLBACK_MAX_TOKENS = 128_000

/** The single API implementation this plugin streams, named by the installed catalog. */
const CODEX_API: Api = 'openai-codex-responses'

export interface ModelDiscoveryBackend {
  /** Injected so tests never reach the network. */
  fetcher: typeof fetch
}

export interface LiveModel {
  readonly slug: string
  readonly name: string
  readonly contextWindow: number
  readonly input: readonly ('text' | 'image')[]
  readonly reasoningLevels: readonly string[]
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined

const positiveInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined

/** Extract one live model, or undefined when the entry cannot be offered safely. */
function liveModel(value: unknown): LiveModel | undefined {
  const entry = record(value)
  const slug = entry?.slug
  // The slug becomes the model ID the Client selects and the wire `model` field.
  if (typeof slug !== 'string' || !slugPattern.test(slug)) return undefined
  // `visibility: "hide"` marks internal rows such as the auto-review model; only an
  // explicit listing is a user-selectable model.
  if (entry?.visibility !== 'list' || entry?.supported_in_api !== true) return undefined
  const contextWindow = positiveInteger(entry?.context_window)
  if (contextWindow === undefined) return undefined
  const displayedName = entry.display_name ?? entry.name
  const levels = Array.isArray(entry?.supported_reasoning_levels)
    ? entry.supported_reasoning_levels.flatMap((level): string[] => {
      const effort = record(level)?.effort
      return typeof effort === 'string' && effortPattern.test(effort) ? [effort] : []
    })
    : []
  const input = Array.isArray(entry?.input_modalities)
    ? entry.input_modalities.filter((modality): modality is 'text' | 'image' => modality === 'text' || modality === 'image')
    : []
  return {
    slug,
    name: typeof displayedName === 'string' && displayedName.length > 0 ? displayedName : slug,
    contextWindow,
    input,
    reasoningLevels: levels,
  }
}

/**
 * Read the account catalog from the fixed endpoint.
 * @param fetcher - fetch implementation supplied by the Host.
 * @param credential - the plugin's resolved OAuth grant.
 * @param signal - caller lifetime; aborts the request.
 * @returns the visible live models; empty when the vendor offers none to this account.
 * @throws when the response is unusable, so the caller keeps its current catalog.
 */
export async function fetchCodexModels(
  fetcher: typeof fetch,
  credential: Credential,
  signal: AbortSignal,
): Promise<readonly LiveModel[]> {
  if (credential.type !== 'oauth') throw new Error('Codex model discovery requires the OAuth grant')
  const accountId = accountIdFromAccess(credential.access)
  const url = `${MODELS_URL}?client_version=${encodeURIComponent(CODEX_CLIENT_VERSION)}`
  const response = await fetcher(url, {
    method: 'GET',
    signal,
    headers: {
      // Match the pi-ai request identity so the answer belongs to this client.
      Authorization: `Bearer ${credential.access}`,
      'chatgpt-account-id': accountId,
      originator: 'pi',
      accept: 'application/json',
    },
  })
  if (!response.ok) throw new Error(`Codex model discovery failed with status ${String(response.status)}`)
  if (response.body === null) throw new Error('Codex model discovery returned no body')
  const reader = response.body.getReader()
  const pieces: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_RESPONSE_BYTES) throw new Error('Codex model discovery response is too large')
      pieces.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const body: unknown = JSON.parse(Buffer.concat(pieces, length).toString('utf8'))
  const models = record(body)?.models
  if (!Array.isArray(models)) throw new Error('Codex model discovery returned an unexpected shape')
  return models.flatMap((entry): LiveModel[] => {
    const parsed = liveModel(entry)
    return parsed === undefined ? [] : [parsed]
  })
}

/**
 * Map one live row onto the pi-ai model shape this adapter streams.
 * @param live - validated live catalog row.
 * @param template - installed catalog entry for the same slug, when it exists.
 * @returns a model with live identity and entitlement data plus installed structure.
 */
export function liveModelEntry(live: LiveModel, template: Model<Api> | undefined): Model<Api> {
  const installed = template?.thinkingLevelMap ?? {}
  // The endpoint is authoritative for the levels this account may send, so an
  // installed alias is kept for an offered level and every other level is refused
  // outright. Refusing matters most for a model the installed catalog never
  // shipped: without an entry in this map, every level up to "high" would look
  // supported and the picker would offer efforts the model cannot send.
  const offered = new Set(live.reasoningLevels)
  const thinkingLevelMap: ThinkingLevelMap = {}
  for (const level of THINKING_LEVELS) {
    if (offered.has(level)) thinkingLevelMap[level] = installed[level] ?? level
    else thinkingLevelMap[level] = null
  }
  return {
    id: live.slug,
    name: live.name,
    api: template?.api ?? CODEX_API,
    provider: PI_PROVIDER_ID,
    baseUrl: template?.baseUrl ?? 'https://chatgpt.com/backend-api',
    reasoning: live.reasoningLevels.length > 0,
    ...Object.keys(thinkingLevelMap).length === 0 ? {} : { thinkingLevelMap },
    input: live.input.length > 0 ? [...live.input] : [...(template?.input ?? ['text'])],
    // The subscription is not billed per token, so no price is reported.
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: live.contextWindow,
    maxTokens: template?.maxTokens ?? FALLBACK_MAX_TOKENS,
    ...template?.compat === undefined ? {} : { compat: template.compat },
    ...template?.samplingParams === undefined ? {} : { samplingParams: template.samplingParams },
  } as Model<Api>
}

/**
 * Build the catalog this process should offer.
 * @param live - live catalog rows for this account.
 * @param installed - catalog currently in use, whose entries supply structure.
 * @returns only visible live models in vendor order; installed entries supply structure, never extra IDs.
 */
export function mergeCatalog(
  live: readonly LiveModel[],
  installed: readonly Model<Api>[] = codexBaselineModels,
): readonly Model<Api>[] {
  const templates = new Map(installed.map(model => [model.id, model]))
  const seen = new Set<string>()
  return live.flatMap(entry => {
    if (seen.has(entry.slug)) return []
    seen.add(entry.slug)
    return [liveModelEntry(entry, templates.get(entry.slug))]
  })
}
