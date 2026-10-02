import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const modules = new Map()

/** Instantiate published DSH ModuleLoader factories for package smoke tests, without source checkouts. */
export function loadBrowserModule(packageName) {
  if (modules.has(packageName)) return modules.get(packageName)
  let contribution
  const source = readFileSync(require.resolve(`${packageName}/client`), 'utf8')
  const window = { __ModuleLoader__: { load(value) { contribution = value } } }
  new Function('window', source)(window)
  if (contribution?.id !== packageName || typeof contribution.factory !== 'function') {
    throw new Error(`Missing published Client factory for ${packageName}`)
  }
  const value = contribution.factory(specifier => require(specifier))
  modules.set(packageName, value)
  return value
}
