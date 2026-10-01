/** Browser entry for the Codex subscription settings page and its isolated Remote. */
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ModelControl } from './ModelControl.tsx'
import { modelEn, modelZh } from './model-locales.ts'
import { install as installModelStyles } from './ModelControl.module.css'
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CodexSubscriptionState } from '../types.ts'
import remote from '../remote.ts'
import { CodexSubscriptionSection, type CodexSubscriptionOperations } from './CodexSubscriptionSection.tsx'
import { install as installStyles } from './CodexSubscriptionSection.module.css'
import { en, zh } from './locales.ts'
import { ToolImageView } from './imagegen/ToolImageView.tsx'
import { install as installImageStyles } from './imagegen/ToolImageView.module.css'
import { en as imageEn, zh as imageZh } from './imagegen/locales.ts'

export const inject = ['remote', 'slots', 'locale']

class StateStore {
  private readonly listeners = new Set<() => void>()
  private state: CodexSubscriptionState = { status: 'checking', models: [] }

  getSnapshot = (): CodexSubscriptionState => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  set(state: CodexSubscriptionState): void {
    if (state.instanceId !== undefined && state.instanceId === this.state.instanceId
      && state.revision !== undefined && this.state.revision !== undefined
      && state.revision < this.state.revision) return
    this.state = state
    for (const listener of this.listeners) listener()
  }
}

function result<T>(response: RemoteResult<T>): T {
  if (response.ok) return response.value
  throw response.error
}

/** Mount the generated-equivalent Remote and a root settings page. */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(remote)
  const disposeStyles = installStyles()
  const disposeImageStyles = installImageStyles()
  const disposeModelStyles = installModelStyles()
  const imageView = ctx.inject(['slots', 'locale'], child => {
    child.effect(() => child.locale.register('tool.codexImage', { en: imageEn, zh: imageZh }))
    child.slots.inject('tool.call.toolview', () => child.slots.register({
      name: 'tool.call.toolview', key: 'codex_generate_image', locale: 'tool.codexImage',
    }, ToolImageView))
  })
  void Promise.resolve(imageView).catch(() => { /* A missing optional Tool view must not break settings. */ })
  const store = new StateStore()
  const call = async <T>(operation: () => Promise<RemoteResult<T>>): Promise<T> => {
    const next = result(await operation())
    store.set(next as CodexSubscriptionState)
    return next
  }
  // The namespace is installed by $mount above. Only the child that declares
  // its service dependency may access child.remote.codexSubscription.
  const ui = ctx.inject(['slots', 'locale', 'remote.codexSubscription'], (child) => {
    const t = child.locale.bind('settings.codexSubscription')
    const operations: CodexSubscriptionOperations = {
      getState: () => call(() => child.remote.codexSubscription.getState()),
      beginLogin: method => call(() => child.remote.codexSubscription.beginLogin(method)),
      cancelLogin: attemptId => call(() => child.remote.codexSubscription.cancelLogin(attemptId)),
      signOut: () => call(() => child.remote.codexSubscription.signOut()),
      refreshModels: () => call(() => child.remote.codexSubscription.refreshModels()),
    }
    child.effect(() => child.locale.register('settings.codexSubscription', { en, zh }))
    child.effect(() => {
      let stream: ReturnType<typeof child.remote.codexSubscription.watch> | undefined
      let watching: Promise<void> | undefined
      const synchronize = (): void => {
        // Client transport starts after Loader activation. These calls are
        // intentionally detached so a disconnected Host never fails this
        // package's Client entry; connection/reset invokes them again.
        void operations.getState().catch(() => {})
        stream?.dispose()
        stream = child.remote.codexSubscription.watch()
        const current = stream
        watching = (async () => {
          try {
            for await (const item of current) {
              if (stream === current) store.set(item)
            }
          } catch { /* connection resets retain the latest safe view */ }
        })()
      }
      const disposeReset = child.on('connection/reset', synchronize)
      synchronize()
      return async () => {
        disposeReset()
        stream?.dispose()
        await watching
      }
    }, 'codex-subscription: safe state synchronization')
    child.slots.inject('settings.section', () => child.slots.register({
      name: 'settings.section', id: 'codex-subscription', order: 12, label: () => t('nav'),
      locale: 'settings.codexSubscription', inject: () => ({ operations, hooks: { state: store } }),
    }, CodexSubscriptionSection))
  })
  const modelUi = ctx.inject(['modelDirectories', 'sessions', 'slots', 'locale', 'remote', 'remote.session', 'remote.codexSubscription'], child => {
    child.effect(() => child.locale.register('codex.model', { en: modelEn, zh: modelZh }))
    child.slots.inject('conversation.input.model', () => child.slots.register({
      name: 'conversation.input.model', locale: 'codex.model', priority: -10,
      inject: sessionId => {
        const directory = child.modelDirectories.directoryFor(sessionId)
        const available = child.sessions.subagentAddress(sessionId) === undefined
        return {
          available, directory: directory.store, controls: store,
          load: () => { if (available) void directory.load().catch(() => {}) },
          select: selection => available ? directory.select(selection) : Promise.resolve(undefined),
          getSpeed: async (model: string) => result(await child.remote.codexSubscription.getSpeed(String(sessionId), model)),
          setSpeed: async (model: string, enabled: boolean) => result(await child.remote.codexSubscription.setSpeed(String(sessionId), model, enabled)),
        }
      },
    }, ModelControl))
  })
  void Promise.resolve(modelUi).catch(() => { /* Optional model owner must not break settings. */ })
  try { await ui } catch (error) {
    await modelUi.dispose()
    disposeModelStyles()
    await ui.dispose()
    await imageView.dispose()
    disposeImageStyles()
    disposeStyles()
    await disposeRemote()
    throw error
  }
  return async () => {
    await modelUi.dispose()
    disposeModelStyles()
    await ui.dispose()
    await imageView.dispose()
    disposeImageStyles()
    disposeStyles()
    await disposeRemote()
  }
}
