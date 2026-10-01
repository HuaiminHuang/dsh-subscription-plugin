import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { defineConfig } from 'tsdown'
import { transform } from 'lightningcss'
import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'

const PACKAGE_ID = '@h2mzzz/dsh-openai-subscription'
const clientExternals = new Set(['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'])
const CSS_PREFIX = '\0dsh-openai-subscription-css:'

/** Compile a package-owned CSS module with a lifecycle-owned style installer. */
const clientCssPlugin = {
  name: 'dsh-openai-subscription-css-modules',
  resolveId(source: string, importer: string | undefined) {
    if (!source.endsWith('.module.css') || importer === undefined) return null
    const file = resolve(dirname(importer), source)
    return CSS_PREFIX + relative(process.cwd(), file).replaceAll('\\', '/') + '.mjs'
  },
  async load(this: { addWatchFile(file: string): void }, id: string) {
    if (!id.startsWith(CSS_PREFIX)) return null
    const file = resolve(process.cwd(), id.slice(CSS_PREFIX.length, -'.mjs'.length))
    this.addWatchFile(file)
    const compiled = transform({ filename: file, code: await readFile(file), cssModules: { pattern: '[hash]_[local]' }, minify: true })
    const classes: Record<string, string> = {}
    for (const [local, value] of Object.entries(compiled.exports ?? {})) classes[local] = value.name
    const tagId = `${PACKAGE_ID}/${file.split('/').at(-1) ?? 'style'}`
    return [
      `const css = ${JSON.stringify(compiled.code.toString())}`,
      `const tagId = ${JSON.stringify(tagId)}`,
      'let owners = 0',
      'export function install() {',
      "  if (typeof document === 'undefined') return () => {}",
      "  let tag = document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']')",
      '  if (tag === null) {',
      "    tag = document.createElement('style')",
      `    tag.dataset.plugin = ${JSON.stringify(PACKAGE_ID)}`,
      '    tag.dataset.pluginCss = tagId',
      '    tag.textContent = css',
      '    document.head.appendChild(tag)',
      '  }',
      '  owners++',
      '  let disposed = false',
      '  return () => {',
      '    if (disposed) return',
      '    disposed = true',
      '    owners--',
      "    if (owners === 0) document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']')?.remove()",
      '  }',
      '}',
      `export default ${JSON.stringify(classes)}`,
    ].join('\n')
  },
}

/** Build the Host entry, external-package Typert records, and DSH Client factory. */
export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      imagegen: 'src/imagegen-entry.ts',
      'model-control': 'src/model-control-entry.ts',
      'typert.host': 'src/typert.host.ts',
      'typert.remote-client': 'src/remote.ts',
    },
    outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
    fixedExtension: false, dts: false, clean: false,
    outputOptions: { chunkFileNames: '[name].js' },
    // Lowers standard decorators; reflection files remain explicit because the
    // upstream generator intentionally scans only its own workspace packages.
    plugins: [typertPlugin({ mode: 'package', faces: ['host'] })],
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib', format: ['cjs'], platform: 'browser', target: 'es2024',
    dts: false, sourcemap: true, clean: false,
    deps: {
      neverBundle: source => clientExternals.has(source),
      alwaysBundle: source => !clientExternals.has(source),
    },
    plugins: [{
      name: 'dsh-openai-subscription-client-externals',
      resolveId(source: string) {
        return clientExternals.has(source) ? { id: source, external: true } : null
      },
    }, clientCssPlugin],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
