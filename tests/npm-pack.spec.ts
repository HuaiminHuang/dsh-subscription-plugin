import { describe, expect, it } from 'vitest'
import { parseNpmPack, parseNpmPeerDependencies } from '../scripts/parse-npm-pack.mjs'

const expected = { name: '@scope/plugin', version: '1.2.3' }
const packed = {
  ...expected,
  filename: 'scope-plugin-1.2.3.tgz',
  shasum: '0123456789abcdef0123456789abcdef01234567',
  files: [{ path: 'lib/index.js', size: 123 }],
}
const wrappers = {
  'npm 11 array': (value: unknown) => [value],
  'npm 12 package-name map': (value: unknown) => ({ [expected.name]: value }),
}

for (const [name, wrap] of Object.entries(wrappers)) {
  describe(name, () => {
    it('retains the exact artifact metadata and file manifest', () => {
      expect(parseNpmPack(JSON.stringify(wrap(packed)), expected)).toEqual(packed)
    })
    it.each([
      ['wrong package', { ...packed, name: '@other/plugin' }],
      ['wrong version', { ...packed, version: '1.2.4' }],
      ['missing filename', { ...packed, filename: undefined }],
      ['traversal filename', { ...packed, filename: '../plugin.tgz' }],
      ['Windows path', { ...packed, filename: 'folder\\plugin.tgz' }],
      ['wrong suffix', { ...packed, filename: 'plugin.zip' }],
      ['missing checksum', { ...packed, shasum: undefined }],
      ['invalid checksum', { ...packed, shasum: 'bad' }],
      ['missing file manifest', { ...packed, files: undefined }],
      ['empty file manifest', { ...packed, files: [] }],
      ['invalid file entry', { ...packed, files: [null] }],
      ['missing file path', { ...packed, files: [{}] }],
      ['empty file path', { ...packed, files: [{ path: '' }] }],
      ['non-string file path', { ...packed, files: [{ path: 1 }] }],
      ['null package', null],
    ])('rejects %s', (_label, value) => {
      expect(() => parseNpmPack(JSON.stringify(wrap(value)), expected)).toThrow('Invalid npm pack JSON')
    })
  })
}

it.each([
  null, 1, 'text', [], {}, [packed, packed],
  { [expected.name]: packed, other: packed },
  { other: packed }, { error: { code: 'EFAIL', summary: 'pack failed' } },
])('rejects invalid or ambiguous envelopes: %j', value => {
  expect(() => parseNpmPack(JSON.stringify(value), expected)).toThrow('Invalid npm pack JSON')
})
it('rejects malformed JSON without guessing or extracting a successful-looking payload', () => {
  expect(() => parseNpmPack(`warning\n${JSON.stringify([packed])}`, expected)).toThrow(SyntaxError)
})


describe('npm view peerDependencies', () => {
  const peers = { '@deepseek-ai/cordis': '~4.0.4', '@deepseek-ai/dsh-brand': '0.2.0-rc.2' }
  it.each([peers, [peers]])('accepts the old object or new singleton array: %j', value => {
    expect(parseNpmPeerDependencies(JSON.stringify(value))).toEqual(peers)
  })
  it.each([null, {}, [], [peers, peers], [null], { error: 'failed' },
    { '@deepseek-ai/cordis': {} }, { '@deepseek-ai/cordis': '' }])('rejects invalid peer metadata: %j', value => {
    expect(() => parseNpmPeerDependencies(JSON.stringify(value))).toThrow('Invalid npm view JSON')
  })
})
