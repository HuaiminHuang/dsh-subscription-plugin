import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const modules = new Map()

/** Instantiate published DSH ModuleLoader factories for package smoke tests, without source checkouts. */
export function loadBrowserModule(packageName) {
  if (modules.has(packageName)) return modules.get(packageName)
  let contribution
  const manifestPath = require.resolve(`${packageName}/package.json`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const entry = manifest.exports['./client']
  // Newer DSH exposes a Node ESM face in addition to the browser factory.
  const browser = typeof entry === 'string' ? entry : entry.browser ?? entry.default
  if (typeof browser !== 'string') throw new Error(`Missing browser Client export for ${packageName}`)
  const source = readFileSync(resolve(dirname(manifestPath), browser), 'utf8')
  const window = { __ModuleLoader__: { load(value) { contribution = value } } }
  new Function('window', source)(window)
  if (contribution?.id !== packageName || typeof contribution.factory !== 'function') {
    throw new Error(`Missing published Client factory for ${packageName}`)
  }
  const value = contribution.factory(specifier => require(specifier))
  modules.set(packageName, value)
  return value
}
