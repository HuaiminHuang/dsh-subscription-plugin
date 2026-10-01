import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply, inject } from '../src/index.ts'
import { apply as applyImage, inject as injectImage } from '../src/imagegen-entry.ts'
import type { CodexSubscriptionController } from '../src/controller.ts'

function imageHost(savedLogin = false) {
  const ctx = new Context()
  const removeRoute = vi.fn(async () => {})
  const removeTool = vi.fn()
  const removeSkill = vi.fn()
  const registerRoute = vi.fn(() => removeRoute)
  const registerTool = vi.fn(() => removeTool)
  const registerSkill = vi.fn(() => removeSkill)
  let record = savedLogin ? {
    kind: 'grant',
    payload: { type: 'oauth', access: 'synthetic-access', refresh: 'synthetic-refresh', expires: Date.now() + 60_000 },
  } : undefined
  ctx.provide('llm', { registerAdapter: () => Object.assign(vi.fn(), { replace: vi.fn() }) })
  ctx.provide('credentials', {
    readRecord: async () => record,
    deleteRecord: async () => { record = undefined },
  })
  ctx.provide('authorization', { registerFlow: () => () => {}, cancel: () => {} })
  ctx.provide('tools', { register: registerTool })
  ctx.provide('skills', { register: registerSkill })
  ctx.provide('attachments', { saveImages: vi.fn(), readImage: vi.fn() })
  ctx.provide('sessionQuery', { observeSession: vi.fn() })
  ctx.provide('connection', { fetch: { register: registerRoute } })
  return { ctx, registerRoute, registerTool, registerSkill, removeRoute, removeTool, removeSkill }
}

async function settledLogin(host: CodexSubscriptionController) {
  const abort = new AbortController()
  const stream = host.watch(abort.signal)[Symbol.asyncIterator]()
  try {
    for (;;) {
      const next = await stream.next()
      if (next.done) throw new Error('Login state stream ended before readiness')
      if (next.value.status !== 'checking') return next.value.status
    }
  } finally {
    abort.abort()
    await stream.return?.()
  }
}

describe('image generation Host composition', () => {
  it('registers automatically from a saved login without image config and withdraws on sign-out and unload', async () => {
    const { ctx, registerRoute, registerTool, registerSkill, removeRoute, removeTool, removeSkill } = imageHost(true)
    try {
      const fiber = ctx.plugin({ inject, apply })
      await fiber
      const image = ctx.plugin({ inject: injectImage, apply: applyImage })
      await image
      const host = ctx.get('codexSubscription') as CodexSubscriptionController
      expect(await settledLogin(host)).toBe('signed-in')
      expect(registerTool).toHaveBeenCalledTimes(1)
      expect(registerTool.mock.calls[0]?.[0].name).toBe('codex_generate_image')
      expect(registerSkill.mock.calls[0]?.[0].name).toBe('codex-subscription-imagegen')
      expect(registerRoute).toHaveBeenCalledTimes(1)
      await host.signOut()
      expect(removeTool).toHaveBeenCalledTimes(1)
      expect(removeSkill).toHaveBeenCalledTimes(1)
      expect(removeRoute).not.toHaveBeenCalled()
      await image.dispose()
      expect(host.getState().status).toBe('signed-out')
      await image.dispose()
      await fiber.dispose()
      expect(removeRoute).toHaveBeenCalledTimes(1)
    } finally { await ctx.fiber.dispose() }
  })

  it('switches the image row off and on independently of the signed-in text controller', async () => {
    const { ctx, registerRoute, registerTool, registerSkill, removeRoute, removeTool, removeSkill } = imageHost(true)
    try {
      const account = ctx.plugin({ inject, apply })
      await account
      const host = ctx.get('codexSubscription') as CodexSubscriptionController
      expect(await settledLogin(host)).toBe('signed-in')
      expect(registerTool).not.toHaveBeenCalled()
      const image = ctx.plugin({ inject: injectImage, apply: applyImage })
      await image
      expect(registerTool).toHaveBeenCalledTimes(1)
      await image.dispose()
      expect(removeTool).toHaveBeenCalledTimes(1)
      expect(removeSkill).toHaveBeenCalledTimes(1)
      expect(removeRoute).toHaveBeenCalledTimes(1)
      expect(host.getState().status).toBe('signed-in')
      expect((ctx.get('codexSubscription') as CodexSubscriptionController).getState().instanceId)
        .toBe(host.getState().instanceId)
      const reopened = ctx.plugin({ inject: injectImage, apply: applyImage })
      await reopened
      expect(registerTool).toHaveBeenCalledTimes(2)
      expect(registerSkill).toHaveBeenCalledTimes(2)
      expect(registerRoute).toHaveBeenCalledTimes(2)
      await reopened.dispose()
      await account.dispose()
      expect(removeRoute).toHaveBeenCalledTimes(2)
    } finally { await ctx.fiber.dispose() }
  })

  it('keeps text login available without optional image services', async () => {
    const ctx = new Context()
    ctx.provide('llm', { registerAdapter: vi.fn() })
    ctx.provide('credentials', { readRecord: async () => undefined })
    ctx.provide('authorization', { registerFlow: () => () => {}, cancel: () => {} })
    try {
      const fiber = ctx.plugin({ inject, apply })
      await fiber
      const image = ctx.plugin({ inject: injectImage, apply: applyImage })
      expect(await settledLogin(ctx.get('codexSubscription') as CodexSubscriptionController)).toBe('signed-out')
      await fiber.dispose()
      expect(ctx.get('codexSubscription')).toBeUndefined()
    } finally { await ctx.fiber.dispose() }
  })

  it('keeps the original controller live and owns a read-only route without advertising an unsigned-in image tool', async () => {
    const ctx = new Context()
    const remove = vi.fn(async () => {})
    const registerRoute = vi.fn(() => remove)
    const registerTool = vi.fn(() => vi.fn())
    const registerSkill = vi.fn(() => vi.fn())
    ctx.provide('llm', { registerAdapter: vi.fn() })
    ctx.provide('credentials', { readRecord: async () => undefined })
    ctx.provide('authorization', { registerFlow: () => () => {}, cancel: () => {} })
    ctx.provide('tools', { register: registerTool })
    ctx.provide('skills', { register: registerSkill })
    ctx.provide('attachments', { saveImages: vi.fn(), readImage: vi.fn() })
    ctx.provide('sessionQuery', { observeSession: vi.fn() })
    ctx.provide('connection', { fetch: { register: registerRoute } })
    try {
      const fiber = ctx.plugin({ inject, apply })
      await fiber
      const image = ctx.plugin({ inject: injectImage, apply: applyImage })
      await image
      expect(ctx.get('codexSubscription')).toBeDefined()
      expect(registerRoute).toHaveBeenCalledTimes(1)
      expect(registerTool).not.toHaveBeenCalled()
      expect(registerSkill).not.toHaveBeenCalled()
      await image.dispose()
      await fiber.dispose()
      expect(remove).toHaveBeenCalledTimes(1)
      expect(ctx.get('codexSubscription')).toBeUndefined()
    } finally { await ctx.fiber.dispose() }
  })
})
