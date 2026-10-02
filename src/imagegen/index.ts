/** Optional image owner: tool/Skill follow login, read-only historical delivery follows Bundle lifetime. */
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { CodexSubscriptionController } from '../controller.ts'
import { imageResponse } from './artifact.ts'
import { createImageTool } from './tool.ts'
import { imageSkill } from './skill.ts'
import { disposeAll } from '../lifecycle.ts'
import { warnHost } from '../diagnostics.ts'

export function mountImageFeature(ctx: Context, controller: CodexSubscriptionController): () => Promise<void> {
  const owner = new AbortController()
  const tasks = new Set<Promise<unknown>>()
  let removeTool: (() => void) | undefined
  let removeSkill: (() => void) | undefined
  let closed = false
  const imageTool = createImageTool({
    fetcher: fetch,
    saveImages: images => ctx.attachments.saveImages(images),
    withImageAuth: async (signal, run) => {
      const work = controller.withImageAuth(AbortSignal.any([signal, owner.signal]), run)
      tasks.add(work)
      try { return await work } finally { tasks.delete(work) }
    },
  })
  const route = ctx.connection.fetch.register({
    path: '/api/codex-subscription/image', methods: ['GET', 'HEAD'], requestBody: 'buffered',
    fetch: request => imageResponse(request, {
      events: async (sessionId, signal) => {
        using observation = await ctx.sessionQuery.observeSession(SessionId(sessionId), {
          signal, projectionMode: 'none',
        })
        return [...observation.events]
      },
      readImage: (ref, signal) => ctx.attachments.readImage(ref, signal),
      diagnose: category => warnHost(ctx, `image-preview-${category}`),
    }),
  })
  let unsubscribe: () => void
  try {
    unsubscribe = controller.subscribeState(state => {
      if (closed) return
      if (state.status === 'signed-in') {
        if (removeTool === undefined) {
          try { removeTool = ctx.tools.register(imageTool) }
          catch { warnHost(ctx, 'image-tool-registration-failed'); return }
        }
        if (removeSkill === undefined) {
          try { removeSkill = ctx.skills.register(imageSkill()) }
          catch { warnHost(ctx, 'image-skill-registration-failed') }
        }
      } else {
        const skill = removeSkill
        const tool = removeTool
        removeSkill = undefined
        removeTool = undefined
        for (const remove of [skill, tool]) {
          try { remove?.() } catch { warnHost(ctx, 'image-registration-cleanup-failed') }
        }
      }
    })
  } catch (error) {
    void route().catch(() => warnHost(ctx, 'image-route-cleanup-failed'))
    throw error
  }
  return async () => {
    if (closed) return
    closed = true
    owner.abort('Image tool unloaded')
    await disposeAll([
      unsubscribe, () => removeSkill?.(), () => removeTool?.(),
      () => Promise.allSettled([...tasks]), route,
    ])
  }
}
