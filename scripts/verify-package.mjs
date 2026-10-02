import { TYPERT } from '../lib/typert.host.js'
import { TYPERT_REMOTE } from '../lib/typert.remote-client.js'
import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader'
import { Context, Service } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { name as hostName, apply as mountHost, inject as hostInject } from '../lib/index.js'
import { name as imageName, apply as mountImage, inject as imageInject } from '../lib/imagegen.js'
import { name as controlName, apply as mountControl, inject as controlInject } from '../lib/model-control.js'
import { evaluatePluginCompatibility, getDshRuntimeVersion, readPluginMeta } from '../../deepseek-harness/packages/boot/app-boot/lib/index.js'
import { apply as mountTypert, inject as typertInject } from '../../deepseek-harness/packages/typert/registry/lib/types/client/index.js'
import { SlotRegistry } from '../../deepseek-harness/packages/client/ui-renderer/lib/types/client/registry.js'
import { apply as mountGateway, inject as gatewayInject } from '../../deepseek-harness/packages/api/gateway/lib/types/client/index.js'

const packageName = '@h2mzzz/dsh-openai-subscription'
const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
// Exercise the same version preflight used by the running DSH, before activation.
const runtimeVersion = getDshRuntimeVersion()
const compatibility = evaluatePluginCompatibility(metadata, {}, runtimeVersion)
if (runtimeVersion !== '0.2.0-rc.2' || compatibility !== undefined) {
  throw new Error(`Bundle must pass the pinned DSH 0.2.0-rc.2 preflight (runtime: ${runtimeVersion})`)
}
const piVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.resolve('@earendil-works/pi-ai')), 'utf8')).version
if (piVersion !== metadata.peerDependencies['@earendil-works/pi-ai']) {
  throw new Error('Built package validation must use the declared pi-ai version')
}

if (readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8').includes(process.cwd())) {
  throw new Error('Built Client contains a machine-specific source path')
}
if (metadata.name !== packageName || hostName !== packageName || TYPERT_REMOTE.package !== packageName
  || !patch.includes(`name: "${packageName}"`)) {
  throw new Error('Bundle metadata, patch, Host, and Remote must use the same scoped package name')
}
const skillPath = 'skills/codex-subscription-imagegen/SKILL.md'
if (!metadata.files.includes(skillPath) || !readFileSync(new URL(`../${skillPath}`, import.meta.url), 'utf8').includes('codex_generate_image')
  || !patch.includes('id: openai-subscription-imagegen')
  || !patch.includes(`name: "${packageName}/imagegen"`)
  || imageName !== `${packageName}/imagegen`
  || metadata.exports['./imagegen']?.default !== './lib/imagegen.js') {
  throw new Error('Built image tool must have its own default-enabled Bundle row and packaged Skill')
}
if (readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8').includes('from "@deepseek-ai/dsh-tools"')) {
  throw new Error('Text Host must not eagerly import the independently switchable image tool runtime')
}
// The pack list must name every built module: the build may emit shared chunks
// (for example `codex-auth.js`) that each Host entry imports, and a file the
// tarball omits makes the whole Bundle fail to load with ERR_MODULE_NOT_FOUND.
// Inspect the real `npm pack` output instead of the working tree.
const pack = spawnSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
})
if (pack.status !== 0) throw new Error(`npm pack --dry-run failed: ${pack.stderr.trim()}`)
const packedFiles = new Set(JSON.parse(pack.stdout)[0].files.map(entry => entry.path))
const builtModules = readdirSync(new URL('../lib', import.meta.url))
  .filter(name => name.endsWith('.js') || name.endsWith('.js.map'))
  .map(name => `lib/${name}`)
const unpacks = builtModules.filter(name => !packedFiles.has(name))
if (unpacks.length > 0) {
  throw new Error(`Built modules are missing from the pack list: ${unpacks.join(', ')}`)
}
// Follow relative imports across every packed module, so a chunk that imports a
// further chunk cannot slip past a check that only reads the entry points.
for (const module of builtModules.filter(name => name.endsWith('.js'))) {
  const source = readFileSync(new URL(`../${module}`, import.meta.url), 'utf8')
  for (const specifier of source.matchAll(/from "(\.\/[^"]+)"/gu)) {
    const resolved = `lib/${specifier[1].slice(2)}`
    if (!packedFiles.has(resolved)) {
      throw new Error(`${module} imports ${resolved}, which the tarball does not contain`)
    }
  }
}
if (!packedFiles.has('lib/imagegen.js')
  || !readFileSync(new URL('../lib/imagegen.js', import.meta.url), 'utf8').includes('codex_generate_image')) {
  throw new Error('Built image feature chunk must be included in the package')
}

// Resolve metadata exactly as the Plugins panel does, including while a row is disabled.
const packageUrl = new URL('../package.json', import.meta.url).href
const accountMeta = readPluginMeta(packageName, packageUrl)
const controlMeta = readPluginMeta(`${packageName}/model-control`, packageUrl)
if (controlName !== `${packageName}/model-control` || controlMeta?.title?.zh !== '紧凑模型滑块' || controlMeta.error !== undefined
  || !packedFiles.has('lib/model-control.js') || !patch.includes('id: openai-subscription-model-control')) {
  throw new Error('Compact control must have a separately switchable, localized packaged row')
}
const imageMeta = readPluginMeta(`${packageName}/imagegen`, packageUrl)
if (accountMeta?.title?.zh !== 'OpenAI 订阅接入' || imageMeta?.title?.zh !== 'OpenAI 生图工具'
  || accountMeta.error !== undefined || imageMeta.error !== undefined) {
  throw new Error('Plugins panel cannot resolve the localized account and image tool titles')
}

// Activate the built Host with inert services to exercise the optional chunk,
// packaged Skill lookup, and image owner teardown (not a real Loader/profile).
const hostCtx = new Context()
let mountedImageTool
let mountedImageSkill
let imageRoute
hostCtx.provide('llm', { registerAdapter: () => () => {} })
hostCtx.provide('credentials', { readRecord: async () => undefined, deleteRecord: async () => {} })
hostCtx.provide('authorization', { registerFlow: () => () => {}, cancel: () => {} })
hostCtx.provide('tools', { register: tool => { mountedImageTool = tool; return () => { mountedImageTool = undefined } } })
hostCtx.provide('skills', { register: skill => { mountedImageSkill = skill; return () => { mountedImageSkill = undefined } } })
hostCtx.provide('attachments', { saveImages: async () => [], readImage: async () => { throw new Error('not used') } })
hostCtx.provide('sessionQuery', { observeSession: async () => { throw new Error('not used') } })
hostCtx.provide('connection', { fetch: { register: route => { imageRoute = route; return async () => { imageRoute = undefined } } } })
try {
  const fiber = hostCtx.plugin({ inject: hostInject, apply: mountHost })
  await fiber
  if (imageRoute !== undefined) throw new Error('Text row must not mount the independently switchable image feature')
  const controller = hostCtx.get('codexSubscription')
  if (controller.getState().compactModelControl !== false) throw new Error('Compact view leaked outside its owner')
  const controlFiber = hostCtx.plugin({ inject: controlInject, apply: mountControl })
  await controlFiber
  if (controller.getState().compactModelControl !== true) throw new Error('Compact row did not enable its presentation')
  await controlFiber.dispose()
  if (controller.getState().compactModelControl !== false) throw new Error('Compact row did not restore classic view on disposal')
  const imageFiber = hostCtx.plugin({ inject: imageInject, apply: mountImage })
  await imageFiber
  if (imageRoute?.path !== '/api/codex-subscription/image' || mountedImageSkill !== undefined) {
    throw new Error('Built image row did not mount its login-gated owner')
  }
  hostCtx.get('codexSubscription').publish({ status: 'signed-in', models: [] })
  if (mountedImageTool?.name !== 'codex_generate_image'
    || mountedImageSkill?.name !== 'codex-subscription-imagegen'
    || !mountedImageSkill.content.includes('codex_generate_image')) {
    throw new Error('Built Host did not register its Tool and packaged Skill after sign-in')
  }
  hostCtx.get('codexSubscription').publish({ status: 'signed-out', models: [] })
  if (mountedImageTool !== undefined || mountedImageSkill !== undefined || imageRoute === undefined) {
    throw new Error('Built Host did not withdraw its Tool/Skill while preserving historical image reads')
  }
  await imageFiber.dispose()
  if (hostCtx.get('codexSubscription') === undefined) throw new Error('Disabling the image row unloaded text login')
  await fiber.dispose()
  if (imageRoute !== undefined) throw new Error('Built Host left its image route after unload')
} finally { await hostCtx.fiber.dispose() }
const manifest = validateTypertManifest(packageName, TYPERT)
const names = new Set(manifest.invocations.map(invocation => `${invocation.namespace}/${invocation.method}`))
for (const name of ['codexSubscription/getState', 'codexSubscription/beginLogin', 'codexSubscription/watch', 'codexSubscription/refreshModels']) {
  if (!names.has(name)) throw new Error(`Built Typert manifest is missing ${name}`)
}
if (names.has('codexSubscription/refreshLogin') || TYPERT_REMOTE.descriptors.some(item => item.method === 'refreshLogin')) {
  throw new Error('Built Host or Client still exposes the removed manual login check')
}

let clientContribution
globalThis.window = {
  __ModuleLoader__: {
    load(contribution) { clientContribution = contribution },
  },
}
await import('../lib/client.js')
if (clientContribution?.id !== packageName) throw new Error('Built Client did not register its ModuleLoader factory')
const clientRequire = createRequire(new URL('../../deepseek-harness/packages/client/ui-renderer/package.json', import.meta.url))
const React = clientRequire('react')
const renderToStaticMarkup = clientRequire('react-dom/server').renderToStaticMarkup
const buttons = []
const client = clientContribution.factory(id => id === '@deepseek-ai/dsh-client-ui-primitives'
  ? { Button: ({ children, onClick, disabled, ...props }) => {
    buttons.push({ label: children, onClick })
    return React.createElement('button', { onClick, disabled, 'aria-expanded': props['aria-expanded'] }, children)
  }, StateDot: () => null,
  MenuSurface: React.forwardRef(({ children, ...props }, ref) => React.createElement('div', { ...props, ref }, children)),
  Tooltip: ({ children }) => children, IconRefreshOutlineRegular: () => React.createElement('span', null, 'reset'),
  }
  : clientRequire(id))
if (typeof client.apply !== 'function' || !Array.isArray(client.inject)) {
  throw new Error('Built Client factory has no Cordis plugin entry')
}

// Exercise actual Cordis activation with the DSH Client Gateway rather than a
// Remote double. The Host carrier deliberately never connects during startup.
const ctx = new Context()
let attemptedReads = 0
try {
  await ctx.plugin({ inject: typertInject, apply: mountTypert })
  ctx.provide('connection', {
    rpc: {
      call: async () => { attemptedReads++; throw new Error('Host is not connected') },
      open: () => (async function* () {})(),
    },
    registerGenerationSource: () => () => {},
    start: () => ({ stop: () => {} }),
  })
  await ctx.plugin({ inject: gatewayInject, apply: mountGateway })
  ctx.provide('locale', { bind: () => () => '', register: () => () => {} })
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: {
    'settings.section': { kind: 'list', scope: 'root' },
    'tool.call.toolview': { kind: 'keyed', scope: 'session' },
    'conversation.input.model': { kind: 'single', scope: 'session' },
  } }, () => null)
  const originalModel = () => null
  ctx.slots.register({ name: 'conversation.input.model' }, originalModel)
  const stateDescriptor = TYPERT_REMOTE.descriptors.find(item => item.method === 'getState')
  await ctx.get('remote').$mount({ package: '@test/session', descriptors: [{ ...stateDescriptor,
    id: '@test/session#session/probe', namespace: 'session', service: 'session', method: 'probe' }] })
  const fixtureDirectory = { store: { getSnapshot: () => ({}), subscribe: () => () => {} }, load: async () => {}, select: async () => undefined }
  // Preserve Cordis's caller-context tracking, which a plain object double skips.
  class FixtureDirectoryResolver extends Service {
    static inject = ['remote', 'remote.session']
    constructor(scope) { super(scope, 'modelDirectories') }
    directoryFor() {
      if (typeof this.ctx.remote.session.probe !== 'function') throw new Error('Missing session Remote')
      return fixtureDirectory
    }
  }
  await ctx.plugin(FixtureDirectoryResolver)
  ctx.provide('sessions', { subagentAddress: () => undefined })
  const fiber = ctx.plugin(client)
  await fiber
  const sections = ctx.slots.entries('settings.section')
  if (sections.length !== 1 || sections[0].options.id !== 'codex-subscription') {
    throw new Error('Built Client did not contribute its settings section')
  }
  const modelSeat = ctx.slots.entriesOfSlot('conversation.input.model')[0]
  if (!modelSeat || modelSeat.component === originalModel) throw new Error('Plugin model seat failed to shadow the original')
  const injectedModel = modelSeat.inject('session-fixture')
  if (injectedModel.directory !== fixtureDirectory.store || injectedModel.available !== true) throw new Error('Built model seat injection failed')
  const imageViews = ctx.slots.entries('tool.call.toolview')
  if (imageViews.length !== 1 || imageViews[0].options.key !== 'codex_generate_image') {
    throw new Error('Built Client did not contribute the image tool card')
  }
  const imageMarkup = renderToStaticMarkup(React.createElement(imageViews[0].component, {
    t: key => key, phase: 'result', callId: 'call-1', toolName: 'codex_generate_image',
    block: { isError: false, call: { name: 'codex_generate_image' },
      meta: { sessionId: 'session-1', image: { attachmentId: `sha256:${'a'.repeat(64)}` } } },
  }))
  if (!imageMarkup.includes('loading') || imageMarkup.includes('sha256:') || imageMarkup.includes('img')) {
    throw new Error('Built image card must load from its authenticated Host route, not inline image bytes or attachment IDs')
  }
  const chosen = []
  const render = state => renderToStaticMarkup(React.createElement(sections[0].component, {
    t: key => key,
    useState: selector => selector(state),
    operations: { beginLogin: async method => { chosen.push(method); return state } },
  }))
  const signedOut = render({ status: 'signed-out', models: [] })
  if (!signedOut.includes('showMethods') || signedOut.includes('browserSignIn') || signedOut.includes('deviceSignIn')
    || signedOut.includes('openLink') || signedOut.includes('refresh') || signedOut.includes('safeNotice')) {
    throw new Error('Built settings page must start with a collapsed method picker and no obsolete controls')
  }
  if (chosen.length !== 0) throw new Error('Built settings page started a login without user input')
  const opened = []
  const { JSDOM } = clientRequire('jsdom')
  const { act } = React
  const { createRoot } = clientRequire('react-dom/client')
  const dom = new JSDOM('<!doctype html><div id="root"></div>')
  const moduleWindow = globalThis.window
  globalThis.window = dom.window
  dom.window.open = url => { opened.push(url); return null }
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const root = createRoot(dom.window.document.getElementById('root'))
  try {
    const signedOutState = { status: 'signed-out', models: [] }
    const view = React.createElement(sections[0].component, {
      t: key => key, useState: selector => selector(signedOutState),
      operations: { beginLogin: async method => { chosen.push(method); return signedOutState } },
    })
    const click = async label => {
      const button = [...dom.window.document.querySelectorAll('button')].find(item => item.textContent === label)
      if (!button) throw new Error(`Built settings page is missing button ${label}`)
      await act(async () => { button.click() })
    }
    await act(async () => { root.render(view) })
    await click('showMethods')
    if (!dom.window.document.body.textContent.includes('browserSignIn')
      || !dom.window.document.body.textContent.includes('deviceSignIn')
      || dom.window.document.querySelector('button[aria-expanded="true"]') === null) {
      throw new Error('Built settings page did not expand both sign-in choices')
    }
    await click('hideMethods')
    if (dom.window.document.body.textContent.includes('browserSignIn')) {
      throw new Error('Built settings page did not collapse the sign-in choices')
    }
    await click('showMethods')
    await click('deviceSignIn')
    if (chosen.join(',') !== 'device_code' || dom.window.document.body.textContent.includes('browserSignIn')) {
      throw new Error('Device sign-in did not select its method and collapse the picker')
    }
    await click('showMethods')
    await click('browserSignIn')
    if (chosen.join(',') !== 'device_code,browser' || opened.join(',') !== 'about:blank') {
      throw new Error('Browser sign-in did not open a tab and select its method')
    }
    await act(async () => { root.render(React.createElement(sections[0].component, {
      t: key => key, useState: selector => selector({ status: 'signed-in', models: [] }),
      operations: { signOut: async () => { throw new Error('private Host diagnostic') } },
    })) })
    let rejectRefresh
    let refreshCalls = 0
    const retainedState = { status: 'signed-in', models: [{ id: 'live-model', name: 'Live model' }] }
    await act(async () => { root.render(React.createElement(sections[0].component, {
      t: key => key, useState: selector => selector(retainedState),
      operations: {
        refreshModels: () => { refreshCalls++; return new Promise((_resolve, reject) => { rejectRefresh = reject }) },
        signOut: async () => { throw new Error('private Host diagnostic') },
      },
    })) })
    await click('refreshModels')
    const refreshButton = [...dom.window.document.querySelectorAll('button')].find(item => item.textContent === 'refreshModels')
    if (!refreshButton?.disabled || !dom.window.document.body.textContent.includes('Live model')) {
      throw new Error('Refreshing models must prevent repeated clicks and retain the catalog')
    }
    await click('refreshModels')
    if (refreshCalls !== 1) throw new Error('Repeated refresh clicks issued duplicate Host calls')
    await act(async () => { rejectRefresh(new Error('private discovery diagnostic')) })
    if (refreshButton.disabled || !dom.window.document.body.textContent.includes('refreshModelsFailed')
      || !dom.window.document.body.textContent.includes('Live model')
      || dom.window.document.body.textContent.includes('private discovery diagnostic')) {
      throw new Error('Failed model refresh must retain the list and offer a safe retry')
    }
    await click('signOut')
    if (!dom.window.document.body.textContent.includes('operationFailed')
      || dom.window.document.body.textContent.includes('private Host diagnostic')) {
      throw new Error('A rejected Host operation must show safe feedback without leaking its error')
    }

    const listeners = new Set()
    let selectionState = {
      current: { provider: 'other-provider', model: 'custom-model', reasoningEffort: 'balanced' },
      groups: [{ id: 'other-provider', name: 'Other', models: [{ id: 'custom-model', name: 'Custom model',
        reasoning: { defaultEffort: 'balanced', efforts: [{ id: 'off', name: 'Off' }, { id: 'balanced', name: 'Balanced' }, { id: 'max', name: 'Max' }] } }] }],
      failures: [], pending: null, error: null, status: 'ready', routable: true,
    }
    const selected = []
    const directory = { getSnapshot: () => selectionState, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } }
    globalThis.ResizeObserver = class { observe() {} disconnect() {} }
    let fastRequested = false
    let controlsState = { status: 'signed-in', models: [], compactModelControl: true }
    const controlListeners = new Set()
    const controls = { getSnapshot: () => controlsState, subscribe: listener => { controlListeners.add(listener); return () => controlListeners.delete(listener) } }
    let selectionHold
    let finishSelection
    const selectionProps = {
      controls,
      locked: false, available: true, t: key => key, directory, load: () => {},
      select: async next => { selected.push(next); if (selectionHold) await selectionHold; selectionState = { ...selectionState, current: next }; for (const listener of listeners) listener(); return { ok: true, value: undefined } },
      getSpeed: async () => ({ enabled: fastRequested, supported: true }),
      setSpeed: async (_model, enabled) => { fastRequested = enabled; return { enabled, supported: true } },
    }
    await act(async () => { root.render(React.createElement(modelSeat.component, selectionProps)) })
    await click('Custom model Balanced ⌄')
    const stablePanel = dom.window.document.querySelector('[role="dialog"]')
    const slider = dom.window.document.querySelector('input[type="range"]')
    if (!slider || slider.max !== '2' || slider.value !== '1' || slider.getAttribute('aria-valuetext') !== 'Balanced') {
      throw new Error('Slider must derive exact provider stops and current effort')
    }
    if (dom.window.document.querySelector('button[aria-label="fast"]')) throw new Error('Other providers must not offer the Codex Fast control')
    const { Simulate } = clientRequire('react-dom/test-utils')
    const priorSelections = selected.length
    await act(async () => { Simulate.change(slider, { target: { value: '1.75' } }) })
    if (slider.step !== 'any' || slider.value !== '1.75' || selected.length !== priorSelections) {
      throw new Error('Pointer drag must move continuously without sending intermediate effort selections')
    }
    await act(async () => { Simulate.pointerUp(slider) })
    if (dom.window.document.querySelector('input[type="range"]') !== slider || dom.window.document.querySelector('[role="dialog"]') !== stablePanel) throw new Error('Effort changes must preserve the slider and panel DOM nodes')
    if (slider.value !== '2' || selected.length !== priorSelections + 1) throw new Error('Pointer release must snap and save exactly once')
    if (dom.window.document.querySelector('button[aria-haspopup="dialog"]').textContent !== 'choose ⌄') throw new Error('Composer trigger must stay fixed while effort changes')
    if (selected.at(-1)?.reasoningEffort !== 'max') throw new Error('Slider stop did not select the provider effort')
    await act(async () => { Simulate.keyDown(slider, { key: 'ArrowLeft' }) })
    if (slider.value !== '1') throw new Error('Keyboard arrows must remain one effort per step')
    await act(async () => { Simulate.keyUp(slider, { key: 'ArrowLeft' }) })
    if (selected.at(-1)?.reasoningEffort !== 'balanced') throw new Error('Keyboard must commit the exact provider effort')
    const beforeCancel = selected.length
    await act(async () => { Simulate.change(slider, { target: { value: '1.8' } }) })
    await act(async () => { Simulate.pointerCancel(slider) })
    if (slider.value !== '1' || selected.length !== beforeCancel) throw new Error('Cancelled pointer drag must restore the saved effort')
    // react-dom was loaded for SSR before JSDOM; satisfy its legacy focus probe on this fixture-owned node.
    slider.attachEvent = () => {}
    slider.detachEvent = () => {}
    selectionHold = new Promise(resolve => { finishSelection = resolve })
    await act(async () => { slider.focus(); Simulate.change(slider, { target: { value: '2' } }) })
    await act(async () => { Simulate.pointerUp(slider) })
    const pendingCount = selected.length
    if (slider.disabled || document.activeElement !== slider || stablePanel.dataset.saving !== 'true'
      || document.querySelector('input[type="range"]') !== slider) {
      throw new Error('Saving must preserve the enabled slider DOM and focus while blocking repeated changes')
    }
    await act(async () => { Simulate.pointerUp(slider) })
    if (selected.length !== pendingCount) throw new Error('Pending save accepted a duplicate selection')
    selectionState = { ...selectionState, current: { ...selectionState.current, reasoningEffort: 'off' } }
    await act(async () => { for (const listener of listeners) listener() })
    if (slider.value !== '2') throw new Error('Intermediate Host projection rewound the optimistic thumb')
    await act(async () => { finishSelection() })
    selectionHold = undefined
    if (slider.value !== '2' || stablePanel.dataset.saving !== 'false' || document.querySelector('input[type="range"]') !== slider) {
      throw new Error('Completed save must preserve the same slider without a flash or remount')
    }
    selectionState = { ...selectionState, status: 'loading', routable: null }
    await act(async () => { for (const listener of listeners) listener() })
    if (slider.disabled || stablePanel.dataset.saving !== 'true' || document.activeElement !== slider) {
      throw new Error('Catalog refresh must preserve slider appearance and focus while routability is unknown')
    }
    await act(async () => { Simulate.pointerUp(slider) })
    if (selected.length !== pendingCount) throw new Error('Catalog refresh accepted a selection before routability was known')
    selectionState = { ...selectionState, status: 'ready', routable: false }
    await act(async () => { for (const listener of listeners) listener() })
    if (!slider.disabled) throw new Error('An authoritatively unavailable model must disable its slider')
    selectionState = { ...selectionState, routable: true }
    await act(async () => { for (const listener of listeners) listener() })

    if (dom.window.document.body.textContent.includes('close') || dom.window.document.querySelectorAll('[aria-hidden="true"] i').length !== 3) {
      throw new Error('Compact panel must show dots without a footer or labeled stop buttons')
    }
    await click('Custom model ›')
    const modelMenu = dom.window.document.querySelector('[role="menu"]')
    if (!modelMenu || !dom.window.document.querySelector('[role="dialog"]').contains(modelMenu)
      || dom.window.document.querySelector('input[type="range"]') || dom.window.document.querySelectorAll('[role="dialog"]').length !== 1) {
      throw new Error('Model list must replace the slider page in one popup')
    }
    await act(async () => { modelMenu.querySelector('[role="menuitemradio"]').click() })
    if (dom.window.document.querySelector('[role="menu"]') || !dom.window.document.querySelector('input[type="range"]')) {
      throw new Error('Successful model selection must return to the slider page')
    }
    await click('Custom model ›')
    await act(async () => { dom.window.document.querySelector('[role="menu"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    if (dom.window.document.querySelector('[role="menu"]') || !dom.window.document.querySelector('[role="dialog"]')) throw new Error('List Escape must return to the compact panel')
    // Escape must close the portal and restore the trigger focus.
    await act(async () => { dom.window.document.querySelector('[role="dialog"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    if (dom.window.document.querySelector('[role="dialog"]')) throw new Error('Model panel did not dismiss on Escape')
    if (dom.window.document.querySelector('button[aria-haspopup="dialog"]').textContent !== 'Custom model max ⌄') throw new Error('Closed trigger must restore model and effort')
    selectionState = { ...selectionState,
      current: { provider: 'codex-subscription', model: 'gpt-6-sol', reasoningEffort: 'medium' },
      groups: [{ id: 'codex-subscription', name: 'OpenAI', models: [{ id: 'gpt-6-sol', name: 'Sol',
        reasoning: { defaultEffort: 'medium', efforts: [{ id: 'medium', name: 'Medium' }] } }] }],
    }
    await act(async () => { for (const listener of listeners) listener() })
    await click('Sol medium ⌄')
    const oneStop = dom.window.document.querySelector('input[type="range"]')
    if (!oneStop?.disabled || oneStop.max !== '0') throw new Error('Single-effort models must not get fabricated slider stops')
    await act(async () => { dom.window.document.querySelector('button[aria-label="fast"]').click() })
    if (!fastRequested || dom.window.document.querySelector('button[aria-label="fast"]').getAttribute('aria-pressed') !== 'true') {
      throw new Error('Lightning control did not select Fast independently')
    }
    if (selectionState.current.reasoningEffort !== 'medium') throw new Error('Fast must not change reasoning effort')
    await act(async () => { dom.window.document.querySelector('[role="dialog"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    const fastTrigger = dom.window.document.querySelector('button[aria-haspopup="dialog"]')
    if (!fastTrigger.querySelector('[data-fast="true"]') || !fastTrigger.getAttribute('aria-label').includes('fast')
      || fastTrigger.textContent !== 'Sol medium ⌄') throw new Error('Closed trigger must retain Fast indicator alongside the model and effort')
    await click('Sol medium ⌄')
    if (fastTrigger.querySelector('[data-fast="true"]') || dom.window.document.querySelector('button[aria-label="fast"]').getAttribute('aria-pressed') !== 'true') {
      throw new Error('Opening the panel must retain Fast state without decorating the Choose model trigger')
    }
    await act(async () => { dom.window.document.querySelector('button[aria-label="reset"]').click() })
    if (fastRequested || selectionState.current.reasoningEffort !== 'medium') throw new Error('Reset must restore speed and exact model default')
    if (fastTrigger.getAttribute('aria-label').includes(', fast')) throw new Error('Reset must clear the trigger Fast status')
    controlsState = { ...controlsState, compactModelControl: false }
    await act(async () => { for (const listener of controlListeners) listener() })
    const speedSwitch = dom.window.document.querySelector('[role="switch"]')
    if (dom.window.document.querySelector('input[type="range"]') || !speedSwitch || speedSwitch.getAttribute('aria-checked') !== 'false'
      || !dom.window.document.body.textContent.includes('effortMenuMedium')) {
      throw new Error('Disabling compact row must retain classic model/effort rows and a default-off speed switch')
    }
    await act(async () => { speedSwitch.click() })
    if (!fastRequested || speedSwitch.getAttribute('aria-checked') !== 'true' || selectionState.current.reasoningEffort !== 'medium') {
      throw new Error('Classic speed switch must work independently of reasoning')
    }
    await click('effortMenuMedium›')
    await click('Medium ✓')
    if (selected.at(-1)?.reasoningEffort !== 'medium') throw new Error('Classic effort selection lost provider values')
    selectionState = { ...selectionState, current: { provider: 'other-provider', model: 'custom-model', reasoningEffort: 'balanced' } }
    await act(async () => { for (const listener of listeners) listener() })
    if (dom.window.document.querySelector('[role="switch"]')) throw new Error('Classic speed switch leaked into other providers')
  } finally {
    await act(async () => { root.unmount() })
    dom.window.close()
    globalThis.window = moduleWindow
    delete globalThis.document
    delete globalThis.ResizeObserver
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  }
  buttons.length = 0
  opened.length = 0
  globalThis.window.open = url => { opened.push(url) }
  const ready = render({ status: 'signing-in', attemptId: 'test', method: 'device_code',
    notice: { kind: 'device_code', url: 'https://auth.openai.com/codex/device', code: 'TEST-CODE' }, models: [] })
  if (!ready.includes('openLink') || !ready.includes('TEST-CODE') || opened.length !== 0) {
    throw new Error('Built settings page did not expose the selected method link and device code')
  }
  buttons.find(button => button.label === 'openLink')?.onClick()
  if (opened.join(',') !== 'https://auth.openai.com/codex/device') {
    throw new Error('Built link button did not open the selected authorization page')
  }
  if (attemptedReads !== 1) throw new Error('Built Client did not attempt the initial safe state read')
  ctx.emit('connection/reset')
  if (attemptedReads !== 2) throw new Error('Built Client did not resynchronize after reconnect')
  await fiber.dispose()
  if (ctx.slots.entriesOfSlot('conversation.input.model')[0]?.component !== originalModel) {
    throw new Error('Unloading plugin did not restore the original model seat')
  }
  if (ctx.slots.entries('settings.section').length !== 0) {
    throw new Error('Built Client did not withdraw its settings section')
  }
  if (ctx.slots.entries('tool.call.toolview').length !== 0) {
    throw new Error('Built Client did not withdraw its image tool card')
  }
} finally {
  await ctx.fiber.dispose()
}
