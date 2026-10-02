/** Account limits on the settings page, never inferred from model token usage. */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { CodexUsageSnapshot } from '../types.ts'
import css from './CodexSubscriptionSection.module.css'

type Props = PropsLocale<'settings.codexSubscription'> & {
  getUsage(): Promise<CodexUsageSnapshot>
  refreshUsage(): Promise<CodexUsageSnapshot>
}

export function UsageCard({ t, getUsage, refreshUsage }: Props) {
  const [snapshot, setSnapshot] = useState<CodexUsageSnapshot>()
  const [busy, setBusy] = useState(true)
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(Date.now)
  const pending = useRef(false)
  const active = useRef(true)

  useEffect(() => {
    active.current = true
    let disposed = false
    setBusy(true)
    void getUsage().then(value => { if (!disposed) { setSnapshot(value); setFailed(false); setNow(Date.now()) } })
      .catch(() => { if (!disposed) setFailed(true) }).finally(() => { if (!disposed) setBusy(false) })
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => { disposed = true; active.current = false; clearInterval(timer) }
  }, [getUsage])

  const refresh = (): void => {
    if (pending.current || busy) return
    pending.current = true
    setBusy(true)
    void refreshUsage().then(value => {
      if (active.current) { setSnapshot(value); setFailed(false); setNow(Date.now()) }
    }).catch(() => { if (active.current) setFailed(true) }).finally(() => {
      pending.current = false
      if (active.current) setBusy(false)
    })
  }

  const resetLabel = (resetsAt: number | null): string => {
    if (resetsAt === null) return t('resetUnknown')
    const minutes = Math.ceil((resetsAt * 1000 - now) / 60_000)
    if (minutes <= 0) return t('resetDue')
    const days = Math.floor(minutes / 1440)
    const hours = Math.floor(minutes % 1440 / 60)
    const parts = days > 0 ? `${days} ${t('days')} ${hours} ${t('hours')}`
      : hours > 0 ? `${hours} ${t('hours')} ${minutes % 60} ${t('minutes')}` : `${minutes} ${t('minutes')}`
    return `${t('resetPrefix')}${parts}${t('resetSuffix')}`
  }

  return <section aria-label={t('limits')} aria-busy={busy}>
    <div className={css.cardHeader}>
      <h3 className={css.modelsTitle}>{t('limits')}</h3>
      <Button size="sm" variant="outline" disabled={busy} onClick={refresh}>{t('refreshLimits')}</Button>
    </div>
    <div className={`${css.card} ${css.usageCard}`}>
      {busy && !snapshot ? <div className={css.usageLoading} role="status" aria-label={t('loadingLimits')}>
        <span className={css.spinner} aria-hidden="true" />
      </div> : [300, 10080].map(duration => {
        const window = snapshot?.windows.find(item => item.windowDurationMins === duration)
        const label = duration === 300 ? t('fiveHourLimit') : t('weeklyLimit')
        const remaining = window ? Math.max(0, 100 - window.usedPercent) : undefined
        return <div className={css.usageWindow} key={duration}>
          <h4 className={css.modelsTitle}>{label}</h4>
          <div className={css.usageMeta}>
            <span>{window ? resetLabel(window.resetsAt) : t('limitsUnknown')}</span>
            {remaining !== undefined && <span>{t('remaining')} {Math.round(remaining)}%</span>}
          </div>
          {remaining !== undefined && <div className={css.usageTrack} role="progressbar" aria-label={label}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={remaining} aria-valuetext={`${t('remaining')} ${Math.round(remaining)}%`}>
            <div className={css.usageFill} style={{ width: `${remaining}%` }} />
          </div>}
        </div>
      })}
    </div>
    <div className={css.usageFooter} aria-live="polite">
      {failed ? <span className={css.error}>{snapshot ? t('limitsStale') : t('limitsFailed')}</span>
        : snapshot && <span>{t('limitsUpdated')} {new Date(snapshot.checkedAt).toLocaleTimeString()}</span>}
    </div>
  </section>
}
