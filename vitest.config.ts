import { defineConfig } from 'vitest/config'
import ts from 'typescript'

/** Match the Host bundler's standard-decorator lowering for service lifecycle tests. */
const decoratorTransform = {
  name: 'dsh-openai-subscription-test-decorators',
  transform(code: string, id: string) {
    if (!id.endsWith('.ts') || !code.includes('@Remote')) return undefined
    const result = ts.transpileModule(code, {
      fileName: id,
      compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext },
    })
    return { code: result.outputText, map: null }
  },
}

export default defineConfig({
  plugins: [decoratorTransform],
  test: { include: ['tests/**/*.spec.ts'], environment: 'node' },
})
