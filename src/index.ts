/** Opt-in Host plugin for ChatGPT/Codex subscription authentication and model routing. */
import type { Context } from '@deepseek-ai/cordis'
import { CodexSubscriptionController } from './controller.ts'

export { CodexSubscriptionController } from './controller.ts'
export type { CodexLoginMethod, CodexLoginStatus, CodexSubscriptionState } from './types.ts'

/** Cordis Loader entry name. */
export const name = '@h2mzzz/dsh-openai-subscription'

/** Required Host services for the first supported Web/Desktop compositions. */
export const inject = ['llm', 'credentials', 'authorization']

/** Mount the isolated Host controller and await its disposal with the Loader row. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const controller = ctx.plugin(CodexSubscriptionController)
  try { await controller } catch (error) {
    await controller.dispose()
    throw error
  }
  return () => controller.dispose()
}
