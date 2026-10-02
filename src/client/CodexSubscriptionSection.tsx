import { useEffect, useRef, useState } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CodexLoginMethod, CodexSubscriptionState, CodexUsageSnapshot } from '../types.ts'
import type { en } from './locales.ts'
import { UsageCard } from './UsageCard.tsx'
import css from './CodexSubscriptionSection.module.css'

/** Browser-facing Host calls for the Codex settings page. */
export interface CodexSubscriptionOperations {
  getUsage(): Promise<CodexUsageSnapshot>
  refreshUsage(): Promise<CodexUsageSnapshot>
  getState(): Promise<CodexSubscriptionState>
  beginLogin(method: CodexLoginMethod): Promise<CodexSubscriptionState>
  cancelLogin(attemptId: string): Promise<CodexSubscriptionState>
  signOut(): Promise<CodexSubscriptionState>
  refreshModels(): Promise<CodexSubscriptionState>
}

/** Data injected from the Client plugin activation. */
export interface CodexSubscriptionInjected {
  operations: CodexSubscriptionOperations
  hooks: { state: { getSnapshot(): CodexSubscriptionState; subscribe(listener: () => void): () => void } }
}

/** Settings section props supplied by the DSH slot renderer. */
export type CodexSubscriptionSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.codexSubscription'>
  & InjectFace<CodexSubscriptionInjected>

function dotState(state: CodexSubscriptionState): 'done' | 'ongoing' | 'error' | 'idle' {
  switch (state.status) {
    case 'signed-in': return 'done'
    case 'signing-in':
    case 'checking': return 'ongoing'
    case 'error': return 'error'
    case 'signed-out': return 'idle'
  }
}

/** Render the token-free ChatGPT sign-in and Codex availability surface. */
export function CodexSubscriptionSection({ t, useState: useCodexState, operations }: CodexSubscriptionSectionProps) {
  const state = useCodexState(value => value)
  const [copied, setCopied] = useState(false)
  const [methodsExpanded, setMethodsExpanded] = useState(false)
  const [operationFailed, setOperationFailed] = useState(false)
  const [refreshingModels, setRefreshingModels] = useState(false)
  const [modelsRefreshFailed, setModelsRefreshFailed] = useState(false)
  const refreshInFlight = useRef(false)
  const pendingBrowserTab = useRef<Window | null>(null)
  const mounted = useRef(true)
  const busy = state.status === 'signing-in' || state.status === 'checking'
  const canSignIn = state.status === 'signed-out' || state.status === 'error'
  const label = state.status === 'signed-in' ? t('signedIn')
    : state.status === 'signing-in' ? t('signingIn')
      : state.status === 'checking' ? t('checking')
        : state.status === 'error' ? t('error') : t('signedOut')
  const error = state.error === 'login-failed' ? t('loginFailed')
    : state.error === 'login-timeout' ? t('loginTimeout')
    : state.error === 'saved-login-unavailable' ? t('savedLoginUnavailable') : undefined

  useEffect(() => {
    setCopied(false)
  }, [state.notice?.url])

  useEffect(() => { setOperationFailed(false) }, [state.revision])

  useEffect(() => {
    const tab = pendingBrowserTab.current
    if (tab === null) return
    if (state.status === 'signing-in' && state.method === 'browser' && state.notice?.url !== undefined) {
      pendingBrowserTab.current = null
      try {
        if (!tab.closed) tab.location.replace(state.notice.url)
      } catch {
        tab.close() // The visible link below remains available when popup navigation fails.
      }
    } else if (state.status === 'error' || state.status === 'signed-in'
      || (state.status === 'signing-in' && state.method !== 'browser')) {
      pendingBrowserTab.current = null
      tab.close()
    }
  }, [state.status, state.method, state.notice?.url])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; pendingBrowserTab.current?.close() }
  }, [])

  const runOperation = (operation: Promise<unknown>, onFailure?: () => void): void => {
    setOperationFailed(false)
    void operation.catch(() => {
      try { onFailure?.() } catch { /* The operation failure still needs safe feedback. */ }
      if (mounted.current) setOperationFailed(true)
    })
  }

  const beginBrowserLogin = (): void => {
    setMethodsExpanded(false)
    // Open during the user's click: an asynchronously returned URL would be
    // blocked as a popup by many browsers. The manual link remains a fallback.
    const tab = window.open('about:blank', '_blank')
    if (tab !== null) tab.opener = null
    pendingBrowserTab.current = tab
    runOperation(operations.beginLogin('browser'), () => {
      if (pendingBrowserTab.current === tab) {
        pendingBrowserTab.current = null
        tab?.close()
      }
    })
  }

  const cancel = (attemptId: string): void => {
    pendingBrowserTab.current?.close()
    pendingBrowserTab.current = null
    runOperation(operations.cancelLogin(attemptId))
  }

  const beginDeviceLogin = (): void => {
    setMethodsExpanded(false)
    runOperation(operations.beginLogin('device_code'))
  }

  const refreshModels = (): void => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setRefreshingModels(true)
    setModelsRefreshFailed(false)
    void operations.refreshModels().catch(() => {
      if (mounted.current) setModelsRefreshFailed(true)
    }).finally(() => {
      refreshInFlight.current = false
      if (mounted.current) setRefreshingModels(false)
    })
  }

  return (
    <section className={css.section} aria-busy={busy}>
      <div>
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.intro}>{t('intro')}</p>
      </div>
      <div className={css.card}>
        <div className={css.cardHeader}>
          <div className={css.status}>
            <StateDot state={dotState(state)} />
            <span>{label}</span>
          </div>
          <div className={css.headerActions}>
            {state.status === 'signing-in' && state.attemptId !== undefined ? (
              <Button variant="outline" size="sm" onClick={() => { cancel(state.attemptId!) }}>{t('cancel')}</Button>
            ) : state.status === 'signed-in' ? (
              <Button variant="ghost" size="sm" disabled={refreshingModels} onClick={() => { runOperation(operations.signOut()) }}>{t('signOut')}</Button>
            ) : canSignIn ? (
              <Button variant="primary" size="sm" aria-expanded={methodsExpanded} aria-controls="codex-subscription-methods"
                onClick={() => { setMethodsExpanded(expanded => !expanded) }}>
                {methodsExpanded ? t('hideMethods') : t('showMethods')}
              </Button>
            ) : null}
          </div>
        </div>
        {error !== undefined && <p className={css.error} role="status">{error}</p>}
        {error === undefined && operationFailed && <p className={css.error} role="alert">{t('operationFailed')}</p>}
        {state.notice !== undefined && (
          <div className={css.notice}>
            <p>{state.notice.kind === 'browser' ? t('browserNotice')
              : state.notice.kind === 'device_code' ? t('deviceNotice') : t('progressNotice')}</p>
            {state.notice.code !== undefined && <code className={css.code}>{state.notice.code}</code>}
            {state.notice.url !== undefined && (
              <div className={css.actions}>
                <Button variant="outline" size="sm" onClick={() => {
                  try { window.open(state.notice?.url, '_blank', 'noopener,noreferrer') }
                  catch { setOperationFailed(true) }
                }}>
                  {t('openLink')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  runOperation(navigator.clipboard.writeText(state.notice?.url ?? '').then(() => {
                    if (mounted.current) setCopied(true)
                  }))
                }}>
                  {copied ? t('copied') : t('copyLink')}
                </Button>
              </div>
            )}
          </div>
        )}
        {canSignIn && methodsExpanded && (
          <div id="codex-subscription-methods" className={css.methodList}>
            <div className={css.method}>
              <span>{t('browserDescription')}</span>
              <Button className={css.methodButton} variant="primary" size="sm" onClick={beginBrowserLogin}>{t('browserSignIn')}</Button>
            </div>
            <div className={css.method}>
              <span>{t('deviceDescription')}</span>
              <Button className={css.methodButton} variant="outline" size="sm" onClick={beginDeviceLogin}>{t('deviceSignIn')}</Button>
            </div>
          </div>
        )}
      </div>
      {state.status === 'signed-in' && <UsageCard key={state.instanceId} t={t}
        getUsage={operations.getUsage} refreshUsage={operations.refreshUsage} />}
      <details className={css.modelDisclosure}>
        <summary className={css.modelsTitle}>{t('models')} ({state.models.length})</summary>
        <div className={css.cardHeader} aria-busy={refreshingModels}>
          {state.status === 'signed-in' && (
            <Button variant="outline" size="sm" disabled={refreshingModels} onClick={refreshModels}>{t('refreshModels')}</Button>
          )}
        </div>
        {modelsRefreshFailed && <p className={css.error} role="alert">{t('refreshModelsFailed')}</p>}
        {state.models.length === 0 ? <p className={css.empty}>{t('noModels')}</p> : (
          <ul className={css.models}>{state.models.map(model => <li key={model.id}><span>{model.name}</span><code>{model.id}</code></li>)}</ul>
        )}
      </details>
    </section>
  )
}
