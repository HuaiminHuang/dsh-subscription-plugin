/** Independently switchable image tool row within the subscription Bundle. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-tools'
import type { CodexSubscriptionController } from './controller.ts'
import { mountImageFeature } from './imagegen/index.ts'

export const name = '@h2mzzz/dsh-openai-subscription/imagegen'
/** Missing capabilities leave this row pending without blocking text login. */
export const inject = ['codexSubscription', 'tools', 'skills', 'attachments', 'connection', 'sessionQuery']

/** Register after sign-in and await image teardown when the Plugins switch is disabled. */
export function apply(ctx: Context): void {
  ctx.effect(() => mountImageFeature(ctx, ctx.get('codexSubscription') as CodexSubscriptionController),
    'openai-subscription-imagegen: tool, Skill, and image delivery')
}
