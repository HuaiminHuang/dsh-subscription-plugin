/** Session-result card: requests bytes only through the authenticated Host route. */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { imageCard } from './card.ts'
import css from './ToolImageView.module.css'

type Props = PropsRuntime<'tool.call.toolview'> & PropsLocale<'tool.codexImage'>

export function ToolImageView(props: Props) {
  const { t, callId, block, phase } = props
  const path = imageCard({ phase, callId, block: phase === 'result' ? block : {} })
  const [attempt, retry] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (path === null) return
    const abort = new AbortController()
    let objectUrl: string | undefined
    setPreview(null)
    setError(false)
    void (async () => {
      try {
        const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: abort.signal })
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('Image unavailable')
        const blob = await response.blob()
        if (blob.size === 0 || blob.size > 20_000_000) throw new Error('Image unavailable')
        if (abort.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setPreview(objectUrl)
      } catch { if (!abort.signal.aborted) setError(true) }
    })()
    return () => { abort.abort(); if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl) }
  }, [path, attempt])

  return <section className={css.card} aria-label={t('title')}>
    <h3 className={css.title}>{t('title')}</h3>
    {phase !== 'result' ? <span role="status">{t('pending')}</span>
      : block.isError || path === null ? <span role="status">{t('failed')}</span>
        : error ? <div role="status">{t('unavailable')} <button type="button" className={css.action} onClick={() => retry(value => value + 1)}>{t('retry')}</button></div>
          : preview === null ? <span role="status">{t('loading')}</span>
            : <><img className={css.image} src={preview} alt={t('alt')} />
              <a className={css.action} href={preview} download="generated-image">{t('download')}</a></>}
  </section>
}
