/** Opt-in Host plugin for ChatGPT/Codex subscription authentication and model routing. */
import type { Context } from '@deepseek-ai/cordis'
import { CodexSubscriptionController } from './controller.ts'

export { CodexSubscriptionController } from './controller.ts'
export type { CodexLoginPrompt, CodexLoginStatus, CodexSubscriptionState } from './types.ts'

/** Cordis Loader entry name. */
export const name = 'dsh-openai-subscription'

/** Required Host services for the first supported Web/Desktop compositions. */
export const inject = ['llm', 'credentials', 'authorization']

/** Mount the isolated Host controller and its explicit Remote namespace. */
export function apply(ctx: Context): void {
  ctx.plugin(CodexSubscriptionController)
}
