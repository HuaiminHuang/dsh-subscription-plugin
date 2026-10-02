import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { Context } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SkillRegistry } from '@deepseek-ai/dsh-skill'
import { composeEntries, loadOverlayPatches, readPluginMeta, loadProfile, createRuntimeResolution, PluginPackages } from '@deepseek-ai/dsh-app-boot'
import { readFile, writeFile } from 'node:fs/promises'

async function writePluginEnabled(path, id, name, enabled) {
  await writeFile(path, JSON.stringify([{ id, name, disabled: !enabled }]))
}

const ctx = new Context()
const routes = new Map()
const registeredModels = new Set()
let restorePatch
try {
  const home = process.argv[2]
  if (!home) throw new Error('Pass the isolated DSH_HOME directory')
  const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))
  const profile = loadProfile('release validation', 'web', installAnchor, home)
  await ctx.plugin(PluginPackages, { resolution: await createRuntimeResolution({ installAnchor, profile, home }) })
  const profileRequire = createRequire(join(profile.dir, 'package.json'))
  const manifestUrl = pathToFileURL(profileRequire.resolve('@h2mzzz/dsh-openai-subscription/package.json')).href
  const pkg = fileURLToPath(new URL('.', manifestUrl))
  const requirePackage = createRequire(manifestUrl)
  const patchPath = join(profile.dir, 'cordis.patch.yml')
  const originalPatch = await readFile(patchPath)
  restorePatch = () => writeFile(patchPath, originalPatch)
  const patches = loadOverlayPatches('isolated package Loader', join(pkg, 'cordis.patch.yml'))
  const rows = () => composeEntries([patches, loadOverlayPatches('isolated profile', patchPath)])
  const runtimeRows = () => rows().map(row => ({ ...row, name: pathToFileURL(requirePackage.resolve(row.name)).href }))
  assert.equal(readPluginMeta('@h2mzzz/dsh-openai-subscription/imagegen', manifestUrl).title.zh, 'OpenAI 生图工具')
  ctx.provide('systemPrompt', { tools: () => () => {} })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SkillRegistry)
  ctx.provide('llm', { registerAdapter: providers => { providers.forEach(p => registeredModels.add(p)); return Object.assign(() => registeredModels.clear(), { replace: next => { registeredModels.clear(); next.forEach(p => registeredModels.add(p)) } }) } })
  ctx.provide('credentials', {
    readRecord: async () => ({ kind: 'grant', payload: { type: 'oauth', access: 'synthetic-access', refresh: 'synthetic-refresh', expires: Date.now() + 60000 } }),
    deleteRecord: async () => {},
  })
  ctx.provide('authorization', { registerFlow: () => () => {}, cancel: () => {} })
  ctx.provide('attachments', { saveImages: async () => [], readImage: async () => { throw new Error('No image request in this check') } })
  ctx.provide('sessionQuery', { observeSession: async () => { throw new Error('No session read in this check') } })
  ctx.provide('connection', { fetch: { register: route => {
    assert(!routes.has(route.path))
    routes.set(route.path, route)
    return async () => { routes.delete(route.path) }
  } } })
  await ctx.plugin(Loader, { baseUrl: manifestUrl })
  await ctx.loader.root.update(runtimeRows())
  await ctx.loader.await()
  const host = ctx.get('codexSubscription')
  assert(host)
  const abort = new AbortController()
  const stateStream = host.watch(AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]))[Symbol.asyncIterator]()
  try {
    for (;;) {
      const next = await stateStream.next()
      assert(!next.done)
      if (next.value.status !== 'checking') { assert.equal(next.value.status, 'signed-in'); break }
    }
  } finally { abort.abort(); await stateStream.return?.() }
  const tools = ctx.get('tools')
  const skills = ctx.get('skills')
  assert(tools.get('codex_generate_image'))
  assert(await skills.get('codex-subscription-imagegen'))
  assert.equal(routes.size, 1)
  assert.equal(host.getState().compactModelControl, true)
  assert(registeredModels.has('codex-subscription'))
  const originalHost = host.getState().instanceId
  await writePluginEnabled(patchPath, 'openai-subscription-model-control', '@h2mzzz/dsh-openai-subscription/model-control', false)
  await ctx.loader.root.update(runtimeRows())
  await ctx.loader.await()
  assert.equal(host.getState().compactModelControl, false)
  assert.equal(host.getState().instanceId, originalHost)
  await writePluginEnabled(patchPath, 'openai-subscription-model-control', '@h2mzzz/dsh-openai-subscription/model-control', true)
  await ctx.loader.root.update(runtimeRows())
  await ctx.loader.await()
  assert.equal(host.getState().compactModelControl, true)
  await writePluginEnabled(patchPath, 'openai-subscription-imagegen', '@h2mzzz/dsh-openai-subscription/imagegen', false)
  await ctx.loader.root.update(runtimeRows())
  await ctx.loader.await()
  assert.equal(tools.get('codex_generate_image'), undefined)
  assert.equal(await skills.get('codex-subscription-imagegen'), undefined)
  assert.equal(routes.size, 0)
  assert.equal(ctx.get('codexSubscription').getState().instanceId, originalHost)
  assert.equal(ctx.get('codexSubscription').getState().status, 'signed-in')
  await writePluginEnabled(patchPath, 'openai-subscription-imagegen', '@h2mzzz/dsh-openai-subscription/imagegen', true)
  await ctx.loader.root.update(runtimeRows())
  await ctx.loader.await()
  assert(tools.get('codex_generate_image'))
  assert(await skills.get('codex-subscription-imagegen'))
  await ctx.loader.update('openai-subscription', { disabled: true })
  await ctx.loader.await()
  assert.equal(ctx.get('codexSubscription'), undefined)
  assert.equal(tools.get('codex_generate_image'), undefined)
  assert.equal(await skills.get('codex-subscription-imagegen'), undefined)
  assert.equal(routes.size, 0)
  assert.equal(registeredModels.size, 0)
  console.log('PASS: installed package exports and localized panel title; real DSH Loader, ToolRuntime and SkillRegistry; persisted row off/on; text login preserved; account-row unload withdraws image contributions.')
  console.log('Boundary: isolated Web profile with published DSH runtime packages; synthetic auth and mocked transport/storage, no full Web server, GUI or real account request.')
} finally {
  try { await ctx.fiber.dispose() } finally { await restorePatch?.() }
}
