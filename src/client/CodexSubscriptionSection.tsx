import { useEffect, useState } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CodexSubscriptionState } from '../types.ts'
import type { en } from './locales.ts'
import css from './CodexSubscriptionSection.module.css'

/** Browser-facing Host calls for the Codex settings page. */
export interface CodexSubscriptionOperations {
  getState(): Promise<CodexSubscriptionState>
  beginLogin(): Promise<CodexSubscriptionState>
  cancelLogin(attemptId: string): Promise<CodexSubscriptionState>
  answerChoice(attemptId: string, answer: string): Promise<CodexSubscriptionState>
  refreshLogin(): Promise<CodexSubscriptionState>
  signOut(): Promise<CodexSubscriptionState>
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
  const [answer, setAnswer] = useState('')
  const [copied, setCopied] = useState(false)
  const busy = state.status === 'signing-in' || state.status === 'checking'
  const label = state.status === 'signed-in' ? t('signedIn')
    : state.status === 'signing-in' ? t('signingIn')
      : state.status === 'checking' ? t('checking')
        : state.status === 'error' ? t('error') : t('signedOut')
  const error = state.error === 'login-failed' ? t('loginFailed')
    : state.error === 'saved-login-unavailable' ? t('savedLoginUnavailable') : undefined

  useEffect(() => {
    setAnswer('')
    setCopied(false)
  }, [state.prompt, state.notice?.url])

  const submit = async (): Promise<void> => {
    if (state.attemptId === undefined || answer.length === 0) return
    await operations.answerChoice(state.attemptId, answer)
  }

  return (
    <section className={css.section} aria-busy={busy}>
      <div>
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.intro}>{t('intro')}</p>
      </div>
      <div className={css.card}>
        <div className={css.status}>
          <StateDot state={dotState(state)} />
          <span>{label}</span>
        </div>
        {error !== undefined && <p className={css.error} role="status">{error}</p>}
        {state.notice !== undefined && (
          <div className={css.notice}>
            <p>{state.notice.message}</p>
            {state.notice.code !== undefined && <code className={css.code}>{state.notice.code}</code>}
            {state.notice.url !== undefined && (
              <div className={css.actions}>
                <Button variant="outline" size="sm" onClick={() => { window.open(state.notice?.url, '_blank', 'noopener,noreferrer') }}>
                  {t('openLink')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  void navigator.clipboard.writeText(state.notice?.url ?? '').then(() => { setCopied(true) })
                }}>
                  {copied ? t('copied') : t('copyLink')}
                </Button>
              </div>
            )}
          </div>
        )}
        {state.prompt !== undefined && state.attemptId !== undefined && (
          <form className={css.prompt} onSubmit={(event) => { event.preventDefault(); void submit() }}>
            <label htmlFor="codex-subscription-answer">{t('selectMethod')}</label>
            <select id="codex-subscription-answer" value={answer} onChange={event => { setAnswer(event.target.value) }}>
              <option value="">{t('selectMethod')}</option>
              {state.prompt.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <Button variant="primary" size="sm" disabled={answer.length === 0}>{t('promptAnswer')}</Button>
          </form>
        )}
        <p className={css.safeNotice}>{t('safeNotice')}</p>
        <div className={css.actions}>
          {state.status === 'signing-in' && state.attemptId !== undefined ? (
            <Button variant="outline" onClick={() => { void operations.cancelLogin(state.attemptId!) }}>{t('cancel')}</Button>
          ) : state.status === 'signed-in' ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => { void operations.refreshLogin() }}>{t('refresh')}</Button>
              <Button variant="ghost" disabled={busy} onClick={() => { void operations.signOut() }}>{t('signOut')}</Button>
            </>
          ) : (
            <>
              <Button variant="primary" disabled={busy} onClick={() => { void operations.beginLogin() }}>{t('signIn')}</Button>
              <Button variant="outline" disabled={busy} onClick={() => { void operations.refreshLogin() }}>{t('refresh')}</Button>
            </>
          )}
        </div>
      </div>
      <div>
        <h3 className={css.modelsTitle}>{t('models')}</h3>
        {state.models.length === 0 ? <p className={css.empty}>{t('noModels')}</p> : (
          <ul className={css.models}>{state.models.map(model => <li key={model.id}><span>{model.name}</span><code>{model.id}</code></li>)}</ul>
        )}
      </div>
    </section>
  )
}
