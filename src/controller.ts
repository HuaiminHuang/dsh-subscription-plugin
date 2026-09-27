import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { createModels } from '@earendil-works/pi-ai'
import type { Api, AuthEvent, AuthPrompt, Model, MutableModels } from '@earendil-works/pi-ai'
import type { AuthorizationFlow, AuthorizationNotice, AuthorizationPrompt } from '@deepseek-ai/dsh-authorization'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { CodexLoginPrompt, CodexSubscriptionState } from './types.ts'
import { CodexSubscriptionAdapter } from './adapter.ts'
import { CODEX_CREDENTIAL_KEY, PI_PROVIDER_ID, PROVIDER_ID } from './constants.ts'
import { codexCredentialStore, isolatedAuthContext } from './credential-store.ts'

interface PendingPrompt {
  readonly view: CodexLoginPrompt
  readonly settle: (answer: string | Error) => void
}

interface Attempt {
  readonly id: string
  pending?: PendingPrompt
}

/** Host owner for the Codex login lifecycle, route registration, and safe Remote state. */
export class CodexSubscriptionController extends TypertRemoteService {
  static inject = ['llm', 'credentials', 'authorization']

  readonly models: MutableModels
  private readonly adapter: CodexSubscriptionAdapter
  private readonly activeRequests = new Set<AbortController>()
  private registration: AdapterRegistrationHandle | undefined
  private attempt: Attempt | undefined
  private state: CodexSubscriptionState = { status: 'checking', models: [] }
  private readonly listeners = new Set<() => void>()

  constructor(ctx: Context) {
    super(ctx, 'codexSubscription', { namespace: 'codexSubscription' })
    this.models = createModels({ credentials: codexCredentialStore(ctx), authContext: isolatedAuthContext })
    this.models.setProvider(openaiCodexProvider())
    this.adapter = new CodexSubscriptionAdapter(this)
    ctx.effect(() => this.registerFlow())
    ctx.effect(() => () => {
      this.ctx.authorization.cancel(CODEX_CREDENTIAL_KEY)
      this.registration?.()
      this.registration = undefined
      for (const request of this.activeRequests) request.abort('Codex subscription plugin unloaded')
      this.listeners.clear()
    })
    void this.refreshLoginState()
  }

  /** The current account-allowed static provider models, after an authenticated preflight. */
  availableModels(): readonly Model<Api>[] {
    return this.state.status === 'signed-in' ? this.models.getModels(PI_PROVIDER_ID) : []
  }

  /** Link an adapter request to the plugin lifetime and an optional caller cancellation signal. */
  openRequest(signal: AbortSignal | undefined): Disposable & { readonly signal: AbortSignal } {
    const controller = new AbortController()
    const abort = (): void => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    this.activeRequests.add(controller)
    return {
      signal: controller.signal,
      [Symbol.dispose]: () => {
        signal?.removeEventListener('abort', abort)
        controller.abort('Codex subscription request completed')
        this.activeRequests.delete(controller)
      },
    }
  }

  /** Read safe login state; this never returns a credential, token, or callback URL. */
  @Remote
  getState(): CodexSubscriptionState { return this.state }

  /** Start the only permitted login attempt for this plugin-owned credential. */
  @Remote
  beginLogin(): CodexSubscriptionState {
    if (this.attempt !== undefined) return this.state
    const attempt: Attempt = { id: randomUUID() }
    this.attempt = attempt
    this.publish({ status: 'signing-in', attemptId: attempt.id, models: [] })
    void this.ctx.authorization.begin({
      key: CODEX_CREDENTIAL_KEY,
      interaction: {
        notify: notice => this.notice(attempt, notice),
        prompt: prompt => this.prompt(attempt, prompt),
      },
    }).then(
      async outcome => {
        if (this.attempt !== attempt) return
        this.attempt = undefined
        if (outcome.status === 'cancelled') {
          this.publish({ status: 'signed-out', models: [], checkedAt: new Date().toISOString() })
          return
        }
        await this.refreshLoginState()
      },
      () => {
        if (this.attempt !== attempt) return
        this.attempt = undefined
        this.publish({
          status: 'error', models: [], checkedAt: new Date().toISOString(),
          error: 'login-failed',
        })
      },
    )
    return this.state
  }

  /** Cancel the current login, including pi-ai's loopback listener and device-code polling. */
  @Remote
  cancelLogin(attemptId: string): CodexSubscriptionState {
    if (this.attempt?.id !== attemptId) return this.state
    this.attempt.pending?.settle(new Error('login cancelled'))
    this.ctx.authorization.cancel(CODEX_CREDENTIAL_KEY)
    return this.state
  }

  /** Submit one validated choice to the current non-secret OAuth method picker. */
  @Remote
  answerChoice(attemptId: string, answer: string): CodexSubscriptionState {
    const attempt = this.attempt
    if (attempt?.id !== attemptId || attempt.pending === undefined) {
      throw new LlmError('The Codex login prompt is no longer active', 'STALE_AUTHORIZATION_PROMPT')
    }
    if (!attempt.pending.view.options.some(option => option.id === answer)) {
      throw new LlmError('The selected Codex login method is not offered by this attempt', 'INVALID_AUTHORIZATION_PROMPT')
    }
    const pending = attempt.pending
    attempt.pending = undefined
    pending.settle(answer)
    this.publish({ ...this.state, prompt: undefined })
    return this.state
  }

  /** Recheck the saved grant without deleting it; a failed check never signs the user out. */
  @Remote
  async refreshLogin(): Promise<CodexSubscriptionState> {
    if (this.attempt !== undefined) return this.state
    await this.refreshLoginState()
    return this.state
  }

  /** Remove only this plugin's OAuth grant and withdraw its provider route. */
  @Remote
  async signOut(): Promise<CodexSubscriptionState> {
    if (this.attempt !== undefined) {
      this.attempt.pending?.settle(new Error('login cancelled'))
      this.ctx.authorization.cancel(CODEX_CREDENTIAL_KEY)
      this.attempt = undefined
    }
    for (const request of this.activeRequests) request.abort('Codex subscription sign-out')
    await this.ctx.credentials.deleteRecord(CODEX_CREDENTIAL_KEY)
    this.registration?.replace([])
    this.publish({ status: 'signed-out', models: [], checkedAt: new Date().toISOString() })
    return this.state
  }

  /** Follow safe state changes for a mounted settings page. */
  @Remote({ mode: 'stream' })
  async * watch(signal: AbortSignal): AsyncIterable<CodexSubscriptionState> {
    yield this.state
    while (!signal.aborted) {
      await new Promise<void>(resolve => {
        const listener = (): void => {
          this.listeners.delete(listener)
          signal.removeEventListener('abort', listener)
          resolve()
        }
        this.listeners.add(listener)
        signal.addEventListener('abort', listener, { once: true })
      })
      if (!signal.aborted) yield this.state
    }
  }

  private registerFlow(): () => void {
    const flow: AuthorizationFlow = {
      key: CODEX_CREDENTIAL_KEY,
      label: 'OpenAI / Codex subscription',
      methods: [{ id: 'oauth', label: '使用 ChatGPT 登录' }],
      run: async session => {
        await this.models.login(PI_PROVIDER_ID, 'oauth', {
          signal: session.signal,
          notify: event => session.notify(this.authorizationNotice(event)),
          // pi-ai starts a manual fallback prompt beside its loopback listener.
          // Keep that promise Host-local: a redirect URL or authorization code
          // must never cross the browser Remote.
          prompt: prompt => prompt.type === 'manual_code'
            ? this.awaitLoopback(prompt.signal)
            : session.prompt(this.authorizationPrompt(prompt)),
        })
      },
    }
    return this.ctx.authorization.registerFlow(flow)
  }

  private async refreshLoginState(): Promise<void> {
    const checkedAt = new Date().toISOString()
    try {
      const models = await this.models.getAvailable(PI_PROVIDER_ID)
      if (models.length === 0) {
        this.registration?.replace([])
        this.publish({ status: 'signed-out', models: [], checkedAt })
        return
      }
      if (this.registration === undefined) this.registration = this.ctx.llm.registerAdapter([PROVIDER_ID], this.adapter)
      else this.registration.replace([PROVIDER_ID])
      this.publish({
        status: 'signed-in', checkedAt,
        models: models.map(model => ({ id: model.id, name: model.name })),
      })
    } catch {
      this.registration?.replace([])
      this.publish({
        status: 'error', models: [], checkedAt,
        error: 'saved-login-unavailable',
      })
    }
  }

  private notice(attempt: Attempt, notice: AuthorizationNotice): void {
    if (this.attempt !== attempt) return
    this.publish({ ...this.state, notice })
  }

  private prompt(attempt: Attempt, prompt: AuthorizationPrompt): Promise<string> {
    if (this.attempt !== attempt) return Promise.reject(new Error('stale login attempt'))
    return new Promise<string>((resolve, reject) => {
      const abort = (): void => settle(new Error('login cancelled'))
      const settle = (value: string | Error): void => {
        prompt.signal?.removeEventListener('abort', abort)
        if (attempt.pending?.settle === settle) attempt.pending = undefined
        value instanceof Error ? reject(value) : resolve(value)
      }
      attempt.pending = { view: this.promptView(prompt), settle }
      prompt.signal?.addEventListener('abort', abort, { once: true })
      if (prompt.signal?.aborted) abort()
      else this.publish({ ...this.state, prompt: attempt.pending.view })
    })
  }

  private authorizationNotice(event: AuthEvent): AuthorizationNotice {
    switch (event.type) {
      case 'auth_url': return { message: event.instructions ?? '请在浏览器中继续登录', url: this.safeUrl(event.url) }
      case 'device_code': return { message: '请在验证页面输入代码', url: this.safeUrl(event.verificationUri), code: event.userCode }
      case 'info': return { message: event.message, ...event.links?.[0] === undefined ? {} : { url: this.safeUrl(event.links[0].url) } }
      case 'progress': return { message: event.message }
    }
  }

  private authorizationPrompt(prompt: AuthPrompt): AuthorizationPrompt {
    const signal = prompt.signal === undefined ? {} : { signal: prompt.signal }
    switch (prompt.type) {
      case 'select': return { ...signal, kind: 'select', message: prompt.message, options: prompt.options }
      case 'secret':
      case 'text':
      case 'manual_code': throw new LlmError('Codex credential input must remain on the Host', 'UNSUPPORTED_OPTION')
    }
  }

  private promptView(prompt: AuthorizationPrompt): CodexLoginPrompt {
    switch (prompt.kind) {
      case 'select': return { kind: 'select', message: prompt.message, options: prompt.options }
      case 'secret':
      case 'text': throw new LlmError('Codex login exposes only non-secret choices to Client', 'UNSUPPORTED_OPTION')
    }
  }

  private safeUrl(value: string): string | undefined {
    try {
      return new URL(value).protocol === 'https:' ? value : undefined
    } catch {
      return undefined
    }
  }

  /** Wait until pi-ai closes its manual fallback after loopback completion or cancellation. */
  private awaitLoopback(signal: AbortSignal | undefined): Promise<string> {
    return new Promise((_resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason); return }
      signal?.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
    })
  }

  private publish(next: CodexSubscriptionState): void {
    this.state = Object.freeze(next)
    for (const listener of this.listeners) listener()
  }
}
