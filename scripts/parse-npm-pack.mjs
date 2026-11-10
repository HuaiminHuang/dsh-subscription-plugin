/** Read the single requested package from npm 11's array or npm 12's name map. */
export function parseNpmPack(stdout, expected) {
  const fail = detail => { throw new Error(`Invalid npm pack JSON: ${detail}`) }
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  const output = JSON.parse(stdout)
  let packed
  if (Array.isArray(output)) {
    if (output.length !== 1) fail('expected exactly one package')
    packed = output[0]
  } else if (record(output)) {
    const keys = Object.keys(output)
    if (keys.length !== 1 || keys[0] !== expected.name) fail('expected a single matching package name')
    packed = output[expected.name]
  } else {
    fail('expected an array or package-name map')
  }
  if (!record(packed) || packed.name !== expected.name || packed.version !== expected.version) {
    fail('package identity does not match package.json')
  }
  if (typeof packed.filename !== 'string' || !packed.filename.endsWith('.tgz')
    || packed.filename.length <= 4 || /[/\\\u0000]/u.test(packed.filename)) {
    fail('expected a tarball basename')
  }
  if (typeof packed.shasum !== 'string' || !/^[a-f\d]{40}$/u.test(packed.shasum)) fail('expected a SHA1 checksum')
  if (!Array.isArray(packed.files) || packed.files.length === 0
    || packed.files.some(file => !record(file) || typeof file.path !== 'string' || file.path.length === 0)) {
    fail('expected a nonempty file manifest with string paths')
  }
  return packed
}

/** Exact-version npm view returns a peer map on npm 11, or [peerMap] on npm 12. */
export function parseNpmPeerDependencies(stdout) {
  const output = JSON.parse(stdout)
  const peers = Array.isArray(output) && output.length === 1 ? output[0] : output
  if (peers === null || typeof peers !== 'object' || Array.isArray(peers)
    || Object.keys(peers).length === 0
    || Object.entries(peers).some(([name, range]) => !name.startsWith('@deepseek-ai/') || typeof range !== 'string' || range.length === 0)) {
    throw new Error('Invalid npm view JSON: expected one nonempty DSH peer dependency map')
  }
  return peers
}
