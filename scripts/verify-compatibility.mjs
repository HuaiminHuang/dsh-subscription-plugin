import { parseNpmPack, parseNpmPeerDependencies } from './parse-npm-pack.mjs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Build once before this script. Each lane installs the exact same packed artifact,
// never the working tree or a per-version rebuild. No user's DSH profile is read.
const versions = ['0.2.0-rc.2', '0.2.1-rc.5', '0.2.2-alpha.3', '0.2.2-rc.1']
const selected = process.argv.slice(2)
for (const version of selected) assert(versions.includes(version), `Unsupported matrix target: ${version}`)
const root = fileURLToPath(new URL('..', import.meta.url))
const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-subscription-compat-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
function run(command, args, cwd, env = {}, capture = false) {
  const result = spawnSync(command, args, {
    cwd, env: { ...process.env, ...env }, encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    // npm's Windows shim needs cmd.exe; arguments are fixed literals or owned paths.
    shell: process.platform === 'win32' && command === npm,
    timeout: 10 * 60_000,
  })
  if (result.error) throw result.error
  assert.equal(result.signal, null, `${command} was terminated by ${result.signal}`)
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed${capture ? `: ${result.stderr}` : ''}`)
  return result.stdout
}
try {
  const scripts = join(temporary, 'scripts')
  await mkdir(scripts)
  for (const script of ['verify-profile.mjs', 'verify-package.mjs', 'load-browser-module.mjs', 'parse-npm-pack.mjs']) {
    await copyFile(join(root, 'scripts', script), join(scripts, script))
  }
  const packed = parseNpmPack(run(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], root, {}, true), metadata)
  const artifact = join(temporary, packed.filename)
  console.log(`Testing one artifact: ${packed.filename} (${packed.shasum})`)
  for (const version of selected.length ? selected : versions) {
    console.log(`\n=== DSH ${version} ===`)
    const lane = join(temporary, version)
    const home = join(lane, 'dsh-home')
    const profile = join(home, 'profiles', 'compatibility')
    await mkdir(profile, { recursive: true })
    await mkdir(join(lane, 'scripts'))
    // Query the runtime's own Cordis ranges: old DSH uses Cordis 4.0, new DSH
    // uses 4.1. Pin all DSH peers explicitly to prevent a mixed-version runtime.
    const bootPeers = parseNpmPeerDependencies(run(npm, ['view', `@deepseek-ai/dsh-app-boot@${version}`, 'peerDependencies', '--json', '--registry=https://registry.npmjs.org'], lane, {}, true))
    const settingsPeers = parseNpmPeerDependencies(run(npm, ['view', `@deepseek-ai/dsh-settings@${version}`, 'peerDependencies', '--json', '--registry=https://registry.npmjs.org'], lane, {}, true))
    const dependencies = Object.fromEntries(Object.entries(bootPeers).map(([name, range]) => [name, name.startsWith('@deepseek-ai/dsh-') ? version : range]))
    for (const name of Object.keys(metadata.peerDependencies)) {
      dependencies[name] = name.startsWith('@deepseek-ai/dsh-') ? version : (dependencies[name] ?? metadata.peerDependencies[name])
    }
    for (const [name, range] of Object.entries(metadata.devDependencies)) {
      if (name.startsWith('@deepseek-ai/dsh-')) dependencies[name] = version
      else if (name.startsWith('@deepseek-ai/cordis-')) dependencies[name] = dependencies[name] ?? range
    }
    // DSH supplies these browser modules; Node smoke tests need explicit hosts.
    for (const name of ['react', 'react-dom', 'jsdom']) dependencies[name] = metadata.devDependencies[name]
    dependencies['@deepseek-ai/schemastery'] = settingsPeers['@deepseek-ai/schemastery']
    dependencies['@deepseek-ai/dsh-app-boot'] = version
    dependencies[metadata.name] = `file:${artifact}`
    await writeFile(join(lane, 'package.json'), JSON.stringify({ name: 'dsh-subscription-compatibility', private: true, type: 'module', dependencies }, null, 2))
    const env = { DSH_HOME: home }
    run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'], lane, env)
    for (const name of Object.keys(dependencies).filter(name => name.startsWith('@deepseek-ai/dsh-'))) {
      const installed = JSON.parse(await readFile(join(lane, 'node_modules', name, 'package.json'), 'utf8'))
      assert.equal(installed.version, version, `Runtime package drift: ${name}`)
    }
    await writeFile(join(profile, 'package.json'), JSON.stringify({ private: true, dsh: { profile: { bundles: [metadata.name] } } }))
    await writeFile(join(profile, 'cordis.patch.yml'), '[]\n')
    await copyFile(join(scripts, 'verify-profile.mjs'), join(lane, 'scripts/verify-profile.mjs'))
    run(process.execPath, [join(lane, 'scripts/verify-profile.mjs'), home, 'compatibility'], lane, env)
    const installedPlugin = join(lane, 'node_modules', metadata.name)
    await mkdir(join(installedPlugin, 'scripts'))
    for (const script of ['verify-package.mjs', 'load-browser-module.mjs', 'parse-npm-pack.mjs']) {
      await copyFile(join(scripts, script), join(installedPlugin, 'scripts', script))
    }
    run(process.execPath, [join(installedPlugin, 'scripts/verify-package.mjs')], installedPlugin, env)
    console.log(`PASS: DSH ${version}`)
  }
} finally {
  // Await child exit before deleting its isolated installation. Retry only OS file
  // handle contention, not failed tests or network requests (notably on Windows).
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
