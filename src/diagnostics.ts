/** Host diagnostics contain fixed categories, never provider responses or credentials. */
import type { Context } from '@deepseek-ai/cordis'

export function warnHost(ctx: Context, category: string): void {
  try {
    const logger = ctx.get('logger') as { warn?: (message: string) => void } | undefined
    logger?.warn?.(`codex subscription: ${category}`)
  } catch { /* Reporting must not interrupt state publication or cleanup. */ }
}
