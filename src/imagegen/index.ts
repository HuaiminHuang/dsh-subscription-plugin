/** Optional image owner: tool/Skill follow login, read-only historical delivery follows Bundle lifetime. */
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { CodexSubscriptionController } from '../controller.ts'
import { imageResponse } from './artifact.ts'
import { createImageTool } from './tool.ts'
import { imageSkill } from './skill.ts'

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
    }),
  })
  let unsubscribe: () => void
  try {
    unsubscribe = controller.subscribeState(state => {
      if (closed) return
      try {
        if (state.status === 'signed-in') {
          if (removeTool === undefined) {
            removeTool = ctx.tools.register(imageTool)
            removeSkill = ctx.skills.register(imageSkill())
          }
        } else {
          removeSkill?.()
          removeSkill = undefined
          removeTool?.()
          removeTool = undefined
        }
      } catch {
        // An optional image contribution cannot turn a valid text login into an error.
        try { removeSkill?.() } catch { /* Preserve the text login. */ }
        removeSkill = undefined
        try { removeTool?.() } catch { /* Preserve the text login. */ }
        removeTool = undefined
        try { (ctx.get('logger') as { warn?: (text: string) => void } | undefined)?.warn?.('codex image tool registration failed') }
        catch { /* A diagnostic must not escape into controller.publish(). */ }
      }
    })
  } catch (error) {
    void route()
    throw error
  }
  return async () => {
    if (closed) return
    closed = true
    unsubscribe()
    removeSkill?.()
    removeTool?.()
    owner.abort('Image tool unloaded')
    await Promise.allSettled([...tasks])
    await route()
  }
}
