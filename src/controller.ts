import { supportsFast } from './speed.ts'
import type { CodexSpeedState } from './types.ts'
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { createModels } from '@earendil-works/pi-ai'
import type { Api, AuthEvent, AuthPrompt, Credential, Model, MutableModels } from '@earendil-works/pi-ai'
import type { AuthorizationFlow, AuthorizationNotice } from '@deepseek-ai/dsh-authorization'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { CodexLoginMethod, CodexSubscriptionState } from './types.ts'
import { CodexSubscriptionAdapter } from './adapter.ts'
import { CODEX_CREDENTIAL_KEY, PI_PROVIDER_ID, PROVIDER_ID } from './constants.ts'
import { codexCredentialStore, isolatedAuthContext } from './credential-store.ts'
import { codexBaselineModels, fetchCodexModels, mergeCatalog } from './discovery.ts'

/** Bound one catalog discovery so a hanging endpoint cannot hold the login check open. */
const DISCOVERY_TIMEOUT_MS = 15_000

/** Thrown inside the login-state read when discovery was refused by lifecycle state. */
class DiscoveryUnavailable extends Error {}

interface Attempt {
  readonly id: string
  readonly controller: AbortController
  readonly timer: ReturnType<typeof setTimeout>
  timedOut: boolean
}

interface ActiveRequest {
  readonly controller: AbortController
  readonly finished: Promise<void>
}

/** Host owner for the Codex login lifecycle, route registration, and safe Remote state. */
export class CodexSubscriptionController extends TypertRemoteService {
  static inject = ['llm', 'credentials', 'authorization']

  readonly models: MutableModels
  private readonly adapter: CodexSubscriptionAdapter
  private compactModelControl = false
  private readonly fastSelections = new Set<string>()
  private readonly activeRequests = new Set<ActiveRequest>()
  private registration: AdapterRegistrationHandle | undefined
  private attempt: Attempt | undefined
  private readonly instanceId = randomUUID()
  private state: CodexSubscriptionState = { status: 'checking', models: [], compactModelControl: false, instanceId: this.instanceId, revision: 0 }
  private revision = 0
  private readonly listeners = new Set<() => void>()
  private readonly pendingRefreshes = new Set<Promise<void>>()
  private refreshEpoch = 0
  private catalogRefreshTask: Promise<CodexSubscriptionState> | undefined
  private discoveryDone = false
  /** The in-flight discovery attempt, so concurrent checks share one request. */
  private discoveredModels: Promise<void> | undefined
  /** The catalog this process offers: the account's live models once discovery answers. */
  private catalog: readonly Model<Api>[] = codexBaselineModels
  /** Discovery transport; a Host keeps the global fetch, tests inject a stub. */
  private readonly discoveryFetch: typeof fetch = (input, init) => fetch(input, init)
  private disposed = false
  private loginRun: Promise<unknown> | undefined
  private loginTask: Promise<void> | undefined
  private signOutTask: Promise<CodexSubscriptionState> | undefined

  constructor(ctx: Context) {
    super(ctx, 'codexSubscription', { namespace: 'codexSubscription' })
    this.models = createModels({ credentials: codexCredentialStore(ctx), authContext: isolatedAuthContext })
    this.models.setProvider(openaiCodexProvider())
    this.adapter = new CodexSubscriptionAdapter(this)
    ctx.effect(() => this.registerFlow())
    ctx.effect(() => () => this.dispose())
    void this.refreshLoginState()
  }

  /**
   * The catalog this process offers after a saved OAuth grant is found.
   * Once discovery has answered for this account it is the live catalog; until then
   * it is the catalog installed with pi-ai, whose server access is unverified.
   */
  availableModels(): readonly Model<Api>[] {
    return this.state.status === 'signed-in' ? this.catalog : []
  }

  /** Host-local state notification for optional capabilities (never exposes the grant). */
  subscribeState(listener: (state: CodexSubscriptionState) => void): () => void {
    const notify = (): void => { listener(this.state) }
    this.listeners.add(notify)
    notify()
    return () => { this.listeners.delete(notify) }
  }

  /** Link an adapter request to the plugin lifetime and an optional caller cancellation signal. */
  openRequest(signal: AbortSignal | undefined): Disposable & { readonly signal: AbortSignal } {
    if (this.disposed || this.signOutTask !== undefined) {
      throw new LlmError('Codex plugin is not accepting requests', 'NO_ADAPTER')
    }
    const controller = new AbortController()
    const abort = (): void => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    let finish!: () => void
    const request: ActiveRequest = { controller, finished: new Promise<void>(resolve => { finish = resolve }) }
    this.activeRequests.add(request)
    return {
      signal: controller.signal,
      [Symbol.dispose]: () => {
        signal?.removeEventListener('abort', abort)
        controller.abort('Codex subscription request completed')
        this.activeRequests.delete(request)
        finish()
      },
    }
  }

  /** Borrow only a fresh, plugin-owned OAuth access for one Host image operation. */
  async withImageAuth<T>(signal: AbortSignal, run: (access: string, signal: AbortSignal) => Promise<T>): Promise<T> {
    using request = this.openRequest(signal)
    if (this.state.status !== 'signed-in') throw new LlmError('Codex subscription is not signed in', 'NO_ADAPTER')
    const resolved = await this.models.getAuth(PI_PROVIDER_ID, { signal: request.signal })
    request.signal.throwIfAborted()
    if (resolved?.source !== 'OAuth' || typeof resolved.auth.apiKey !== 'string') {
      throw new LlmError('Codex subscription OAuth is unavailable', 'NO_ADAPTER')
    }
    const result = await run(resolved.auth.apiKey, request.signal)
    request.signal.throwIfAborted()
    return result
  }

  /** Owned by the optional compact-control Loader entry, never a Remote setting. */
  setCompactModelControl(enabled: boolean): void {
    this.compactModelControl = enabled
    this.publish(this.state)
  }

  /** Read safe login state; this never returns a credential, token, or callback URL. */
  @Remote
  getState(): CodexSubscriptionState { return this.state }

  /** Start one explicitly selected Codex OAuth method for this plugin-owned credential. */
  @Remote
  beginLogin(method: CodexLoginMethod): CodexSubscriptionState {
    if (method !== 'browser' && method !== 'device_code') {
      throw new LlmError('Unknown Codex sign-in method', 'INVALID_AUTHORIZATION_METHOD')
    }
    if (this.disposed || this.signOutTask !== undefined || this.pendingRefreshes.size !== 0
      || this.loginRun !== undefined) {
      throw new LlmError('Codex login is not ready', 'INVALID_AUTHORIZATION_METHOD')
    }
    if (this.attempt !== undefined) return this.state
    const controller = new AbortController()
    const attempt: Attempt = {
      id: randomUUID(), controller, timedOut: false,
      timer: setTimeout(() => {
        attempt.timedOut = true
        controller.abort()
      }, method === 'browser' ? 10 * 60_000 : 16 * 60_000),
    }
    attempt.timer.unref()
    this.attempt = attempt
    this.discoveryDone = false
    this.publish({ status: 'signing-in', attemptId: attempt.id, method, models: [] })
    const task = this.ctx.authorization.begin({
      key: CODEX_CREDENTIAL_KEY,
      method,
      signal: controller.signal,
      interaction: {
        notify: notice => this.notice(attempt, notice),
        prompt: () => Promise.reject(new LlmError('Unexpected Codex sign-in prompt', 'UNSUPPORTED_OPTION')),
      },
    }).then(
      async outcome => {
        clearTimeout(attempt.timer)
        if (this.attempt !== attempt) return
        this.attempt = undefined
        if (outcome.status === 'cancelled') {
          this.publish(attempt.timedOut
            ? { status: 'error', error: 'login-timeout', models: [], checkedAt: new Date().toISOString() }
            : { status: 'signed-out', models: [], checkedAt: new Date().toISOString() })
          return
        }
        await this.refreshLoginState()
      },
      () => {
        clearTimeout(attempt.timer)
        if (this.attempt !== attempt) return
        this.attempt = undefined
        this.publish({
          status: 'error', models: [], checkedAt: new Date().toISOString(),
          error: attempt.timedOut ? 'login-timeout' : 'login-failed',
        })
      },
    ).catch(() => {
      // A failed state projection must not leave a detached Host rejection.
      if (this.attempt !== attempt || this.disposed) return
      this.attempt = undefined
      this.publish({ status: 'error', error: 'login-failed', models: [], checkedAt: new Date().toISOString() })
    }).finally(() => {
      if (this.loginTask === task) this.loginTask = undefined
    })
    this.loginTask = task
    return this.state
  }

  /** Cancel the current login, including pi-ai's loopback listener and device-code polling. */
  @Remote
  cancelLogin(attemptId: string): CodexSubscriptionState {
    if (this.attempt?.id !== attemptId) return this.state
    this.attempt.controller.abort()
    this.ctx.authorization.cancel(CODEX_CREDENTIAL_KEY)
    return this.state
  }

  /** Read the speed choice owned by this Host lifetime, session, and exact model. */
  @Remote
  getSpeed(sessionId: string, model: string): CodexSpeedState {
    this.assertSpeedKey(sessionId, model)
    const supported = this.availableModels().some(candidate => candidate.id === model) && supportsFast(model)
    return { enabled: supported && this.fastSelections.has(`${sessionId}:${model}`), supported }
  }

  /** Request Fast independently of the saved model and reasoning selection. */
  @Remote
  setSpeed(sessionId: string, model: string, enabled: boolean): CodexSpeedState {
    this.assertSpeedKey(sessionId, model)
    if (typeof enabled !== 'boolean' || this.disposed || this.signOutTask !== undefined
      || this.state.status !== 'signed-in') throw new LlmError('Speed selection is unavailable', 'UNSUPPORTED_OPTION')
    const current = this.getSpeed(sessionId, model)
    if (enabled && !current.supported) throw new LlmError('This model cannot request Fast', 'UNSUPPORTED_OPTION')
    const key = `${sessionId}:${model}`
    if (enabled) {
      if (this.fastSelections.size >= 1024 && !this.fastSelections.has(key)) {
        throw new LlmError('Too many speed selections', 'UNSUPPORTED_OPTION')
      }
      this.fastSelections.add(key)
    } else this.fastSelections.delete(key)
    return this.getSpeed(sessionId, model)
  }

  /** Capture the request mode; auxiliary and unscoped calls retain Standard. */
  requestFast(sessionId: string | undefined, model: string): boolean {
    return sessionId !== undefined && supportsFast(model) && this.fastSelections.has(`${sessionId}:${model}`)
  }

  private assertSpeedKey(sessionId: string, model: string): void {
    if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)
      || typeof model !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(model)) {
      throw new LlmError('Invalid speed selection', 'UNSUPPORTED_OPTION')
    }
  }

  /** Re-fetch the model catalog while retaining the current list on failure. */
  @Remote
  async refreshModels(): Promise<CodexSubscriptionState> {
    if (this.catalogRefreshTask !== undefined) return this.catalogRefreshTask
    if (this.disposed || this.signOutTask !== undefined || this.state.status !== 'signed-in') {
      throw new LlmError('Sign in before refreshing models', 'INVALID_AUTHORIZATION_METHOD')
    }
    this.discoveryDone = false
    const task = (async () => {
      await this.refreshLoginState()
      if (!this.discoveryDone) throw new LlmError('Could not refresh models', 'MODEL_DISCOVERY_FAILED')
      return this.state
    })()
    this.catalogRefreshTask = task
    try { return await task } finally { this.catalogRefreshTask = undefined }
  }

  /** Remove only this plugin's OAuth grant and withdraw its provider route. */
  @Remote
  async signOut(): Promise<CodexSubscriptionState> {
    if (this.signOutTask !== undefined) return this.signOutTask
    if (this.disposed) throw new LlmError('Codex plugin is unloaded', 'INVALID_AUTHORIZATION_METHOD')
    const task = this.finishSignOut()
    this.signOutTask = task
    try { return await task } finally { this.signOutTask = undefined }
  }

  private async finishSignOut(): Promise<CodexSubscriptionState> {
    this.refreshEpoch++
    this.discoveryDone = false
    if (this.attempt !== undefined) {
      clearTimeout(this.attempt.timer)
      this.attempt.controller.abort()
      this.ctx.authorization.cancel(CODEX_CREDENTIAL_KEY)
      this.attempt = undefined
    }
    for (const request of this.activeRequests) request.controller.abort('Codex subscription sign-out')
    await Promise.all([...this.activeRequests].map(request => request.finished))
    // Authorization can answer "cancelled" before an orphaned provider flow
    // stops. Wait for the owned flow itself before deleting the grant.
    await Promise.allSettled([this.loginRun, this.loginTask].filter((task): task is Promise<void> => task !== undefined))
    await Promise.allSettled([...this.pendingRefreshes])
    if (this.disposed) return this.state
    await this.ctx.credentials.deleteRecord(CODEX_CREDENTIAL_KEY)
    if (this.disposed) return this.state
    this.fastSelections.clear()
    this.registration?.replace([])
    this.publish({ status: 'signed-out', models: [], checkedAt: new Date().toISOString() })
    return this.state
  }

  /** Follow safe state changes for a mounted settings page. */
  @Remote({ mode: 'stream' })
  async * watch(signal: AbortSignal): AsyncIterable<CodexSubscriptionState> {
    let seen = this.revision
    yield this.state
    while (!signal.aborted) {
      // A notice can arrive while the consumer processes the previous yield.
      // Do not wait for another publish before delivering that latest snapshot.
      if (seen !== this.revision) {
        seen = this.revision
        yield this.state
        continue
      }
      await new Promise<void>(resolve => {
        const listener = (): void => {
          this.listeners.delete(listener)
          signal.removeEventListener('abort', listener)
          resolve()
        }
        this.listeners.add(listener)
        signal.addEventListener('abort', listener, { once: true })
        if (signal.aborted || seen !== this.revision) listener()
      })
      if (signal.aborted) break
      seen = this.revision
      yield this.state
    }
  }

  private registerFlow(): () => void {
    const flow: AuthorizationFlow = {
      key: CODEX_CREDENTIAL_KEY,
      label: 'OpenAI',
      methods: [
        { id: 'browser', label: '浏览器登录' },
        { id: 'device_code', label: '设备代码登录' },
      ],
      run: async session => {
        const running = this.models.login(PI_PROVIDER_ID, 'oauth', {
          signal: session.signal,
          notify: event => session.notify(this.authorizationNotice(event)),
          // pi-ai starts a manual fallback prompt beside its loopback listener.
          // Keep that promise Host-local: a redirect URL or authorization code
          // must never cross the browser Remote.
          prompt: prompt => {
            if (prompt.type === 'select') {
              if (!prompt.options.some(option => option.id === session.method)) {
                throw new LlmError('The selected Codex sign-in method is unavailable', 'UNSUPPORTED_OPTION')
              }
              return Promise.resolve(session.method)
            }
            if (prompt.type === 'manual_code' && session.method === 'browser') return this.awaitLoopback(prompt.signal)
            throw new LlmError('Codex credential input must remain on the Host', 'UNSUPPORTED_OPTION')
          },
        })
        this.loginRun = running
        try { await running } finally { if (this.loginRun === running) this.loginRun = undefined }
      },
    }
    return this.ctx.authorization.registerFlow(flow)
  }

  private async refreshLoginState(): Promise<void> {
    if (this.disposed || this.signOutTask !== undefined) return
    const epoch = this.refreshEpoch
    const task = this.checkLoginState(epoch)
    this.pendingRefreshes.add(task)
    try { await task } finally { this.pendingRefreshes.delete(task) }
  }

  private async checkLoginState(epoch: number): Promise<void> {
    const checkedAt = new Date().toISOString()
    try {
      // The grant may be valid while this process has never asked the vendor for
      // the account's current catalog, so discover once before reading the list.
      if (!this.discoveryDone) {
        try {
          await this.discoverModels(epoch)
        } catch {
          // Sign-out or unload can refuse the request between the state check and
          // the call; that is a lifecycle answer, not a login failure.
          throw new DiscoveryUnavailable()
        }
        if (this.disposed || this.signOutTask !== undefined || epoch !== this.refreshEpoch) return
      }
      const models = await this.models.getAvailable(PI_PROVIDER_ID)
      if (this.disposed || this.signOutTask !== undefined || epoch !== this.refreshEpoch) return
      if (models.length === 0) {
        this.registration?.replace([])
        this.publish({ status: 'signed-out', models: [], checkedAt })
        return
      }
      if (this.registration === undefined) this.registration = this.ctx.llm.registerAdapter([PROVIDER_ID], this.adapter)
      else this.registration.replace([PROVIDER_ID])
      this.publish({
        status: 'signed-in', checkedAt,
        models: this.catalog.map(model => ({ id: model.id, name: model.name })),
      })
    } catch (error) {
      if (error instanceof DiscoveryUnavailable) return
      if (this.disposed || this.signOutTask !== undefined || epoch !== this.refreshEpoch) return
      this.registration?.replace([])
      this.publish({
        status: 'error', models: [], checkedAt,
        error: 'saved-login-unavailable',
      })
    }
  }

  /**
   * Ask the vendor for this account's catalog.
   * A vendor or transport failure is not a login failure: the catalog already in
   * use stays and the next state check retries discovery. The request is owned by
   * the plugin's active-request set, so sign-out and unload abort it, and it is
   * bounded so a hanging endpoint cannot hold the login check open.
   * @param epoch - login-state generation that requested the discovery.
   */
  private async discoverModels(epoch: number): Promise<void> {
    const credential = await this.readGrant()
    if (credential === undefined || epoch !== this.refreshEpoch) return
    if (this.discoveredModels !== undefined) {
      await this.discoveredModels
      return
    }
    const run = this.runDiscovery(credential, epoch)
    this.discoveredModels = run
    try { await run } finally { if (this.discoveredModels === run) this.discoveredModels = undefined }
  }

  /** One discovery attempt under the plugin's request ownership and a bounded wait. */
  private async runDiscovery(credential: Credential, epoch: number): Promise<void> {
    using request = this.openRequest(undefined)
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(DISCOVERY_TIMEOUT_MS)])
    try {
      const live = await fetchCodexModels(this.discoveryFetch, credential, signal)
      if (epoch !== this.refreshEpoch || this.disposed) return
      // An empty answer keeps the installed catalog: a smaller or older client
      // generation is answered with no models, which is not a retirement, and it
      // must be retried rather than treated as a completed discovery.
      if (live.length === 0) return
      this.catalog = mergeCatalog(live, this.catalog)
      this.discoveryDone = true
    } catch {
      // Cancellation, timeout, and vendor failures all keep the catalog in use.
    }
  }

  /** Read this plugin's own OAuth grant, or undefined when nothing is stored. */
  private async readGrant(): Promise<Credential | undefined> {
    try {
      return await codexCredentialStore(this.ctx).read(PI_PROVIDER_ID)
    } catch {
      return undefined
    }
  }

  private notice(attempt: Attempt, notice: AuthorizationNotice): void {
    if (this.attempt !== attempt) return
    // Provider progress must not replace a still-actionable authorization link.
    if (notice.url === undefined && notice.code === undefined && this.state.notice?.url !== undefined) return
    const kind = notice.url === undefined ? 'progress' : this.state.method ?? 'progress'
    this.publish({ ...this.state, notice: {
      kind,
      ...notice.url === undefined ? {} : { url: notice.url },
      ...notice.code === undefined ? {} : { code: notice.code },
    } })
  }

  private authorizationNotice(event: AuthEvent): AuthorizationNotice {
    switch (event.type) {
      case 'auth_url': return { message: 'browser', url: this.authorizationUrl(event.url) }
      case 'device_code': {
        if (typeof event.userCode !== 'string' || !/^[A-Za-z0-9-]{4,64}$/.test(event.userCode)) {
          throw new LlmError('Invalid Codex device verification code', 'INVALID_AUTHORIZATION_NOTICE')
        }
        return { message: 'device_code', url: this.authorizationUrl(event.verificationUri), code: event.userCode }
      }
      case 'info':
      case 'progress': return { message: 'progress' }
    }
  }

  private authorizationUrl(value: string): string {
    try {
      const url = new URL(value)
      if (url.protocol === 'https:' && url.hostname === 'auth.openai.com') return url.toString()
    } catch {
      // An invalid provider URL is not an actionable login notice.
    }
    throw new LlmError('Invalid Codex authorization page', 'INVALID_AUTHORIZATION_NOTICE')
  }

  /** Wait until pi-ai closes its manual fallback after loopback completion or cancellation. */
  private awaitLoopback(signal: AbortSignal | undefined): Promise<string> {
    return new Promise((_resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason); return }
      signal?.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
    })
  }

  private publish(next: CodexSubscriptionState): void {
    if (this.disposed) return
    this.revision++
    this.state = Object.freeze({ ...next, compactModelControl: this.compactModelControl, instanceId: this.instanceId, revision: this.revision })
    for (const listener of this.listeners) listener()
  }

  private async dispose(): Promise<void> {
    this.disposed = true
    this.fastSelections.clear()
    this.refreshEpoch++
    if (this.attempt !== undefined) {
      clearTimeout(this.attempt.timer)
      this.attempt.controller.abort()
      this.attempt = undefined
    }
    this.ctx.authorization.cancel(CODEX_CREDENTIAL_KEY)
    this.registration?.()
    this.registration = undefined
    for (const request of this.activeRequests) request.controller.abort('Codex subscription plugin unloaded')
    this.listeners.clear()
    await Promise.allSettled([this.loginRun, this.loginTask, this.signOutTask, ...this.pendingRefreshes,
      ...[...this.activeRequests].map(request => request.finished)]
      .filter((task): task is Promise<void> | Promise<CodexSubscriptionState> => task !== undefined))
  }
}
