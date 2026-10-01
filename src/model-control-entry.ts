/** Independent Plugins-panel switch for the compact slider presentation. */
import type { Context } from '@deepseek-ai/cordis'
import type { CodexSubscriptionController } from './controller.ts'
export const name = '@h2mzzz/dsh-openai-subscription/model-control'
export const inject = ['codexSubscription']
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const controller = ctx.get('codexSubscription') as CodexSubscriptionController
    controller.setCompactModelControl(true)
    return () => controller.setCompactModelControl(false)
  }, 'codex-model-control: compact presentation')
}
