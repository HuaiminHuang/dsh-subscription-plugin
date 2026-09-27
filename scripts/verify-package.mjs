import { TYPERT } from '../lib/typert.host.js'
import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader'

const manifest = validateTypertManifest('dsh-openai-subscription', TYPERT)
const names = new Set(manifest.invocations.map(invocation => `${invocation.namespace}/${invocation.method}`))
for (const name of ['codexSubscription/getState', 'codexSubscription/beginLogin', 'codexSubscription/watch']) {
  if (!names.has(name)) throw new Error(`Built Typert manifest is missing ${name}`)
}

let clientContribution
globalThis.window = {
  __ModuleLoader__: {
    load(contribution) { clientContribution = contribution },
  },
}
await import('../lib/client.js')
if (clientContribution?.id !== 'dsh-openai-subscription') throw new Error('Built Client did not register its ModuleLoader factory')
const client = clientContribution.factory(() => ({}))
if (typeof client.apply !== 'function' || !Array.isArray(client.inject)) {
  throw new Error('Built Client factory has no Cordis plugin entry')
}
