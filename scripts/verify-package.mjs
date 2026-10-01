import { TYPERT } from '../lib/typert.host.js'
import { TYPERT_REMOTE } from '../lib/typert.remote-client.js'
import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader'
import { Context } from '@deepseek-ai/cordis'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { name as hostName } from '../lib/index.js'
import { apply as mountTypert, inject as typertInject } from '../../deepseek-harness/packages/typert/registry/lib/types/client/index.js'
import { SlotRegistry } from '../../deepseek-harness/packages/client/ui-renderer/lib/types/client/registry.js'
import { apply as mountGateway, inject as gatewayInject } from '../../deepseek-harness/packages/api/gateway/lib/types/client/index.js'

const packageName = '@h2mzzz/dsh-openai-subscription'
const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
if (readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8').includes(process.cwd())) {
  throw new Error('Built Client contains a machine-specific source path')
}
if (metadata.name !== packageName || hostName !== packageName || TYPERT_REMOTE.package !== packageName
  || !patch.includes(`name: "${packageName}"`)) {
  throw new Error('Bundle metadata, patch, Host, and Remote must use the same scoped package name')
}
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
  }, StateDot: () => null }
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
  } }, () => null)
  const fiber = ctx.plugin(client)
  await fiber
  const sections = ctx.slots.entries('settings.section')
  if (sections.length !== 1 || sections[0].options.id !== 'codex-subscription') {
    throw new Error('Built Client did not contribute its settings section')
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
  } finally {
    await act(async () => { root.unmount() })
    dom.window.close()
    globalThis.window = moduleWindow
    delete globalThis.document
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
  if (ctx.slots.entries('settings.section').length !== 0) {
    throw new Error('Built Client did not withdraw its settings section')
  }
} finally {
  await ctx.fiber.dispose()
}
