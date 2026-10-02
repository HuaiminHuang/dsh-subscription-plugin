import ts from 'typescript'

/** Lower the same standard decorators as the pinned DSH build, without a workspace generator. */
export const standardDecorators = {
  name: 'codex-subscription-standard-decorators',
  transform(code: string, id: string) {
    const file = id.split('?', 1)[0] ?? id
    if (!/\.[cm]?tsx?$/.test(file) || !/^\s*@[A-Za-z_$][\w$]*/m.test(code)) return
    const result = ts.transpileModule(code, {
      fileName: file,
      compilerOptions: {
        target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext, sourceMap: true,
        ...(file.endsWith('x') ? { jsx: ts.JsxEmit.ReactJSX } : {}),
      },
    })
    return { code: result.outputText.replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'), map: result.sourceMapText }
  },
}
