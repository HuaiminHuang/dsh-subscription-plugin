import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { MenuSurface, Tooltip, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { CodexSpeedState, CodexSubscriptionState } from '../types.ts'
import { modelEn } from './model-locales.ts'
import { sliderStops } from './model-options.ts'
import css from './ModelControl.module.css'

export interface ModelControlInjected extends ModelSelectInjected {
  controls?: { subscribe(listener: () => void): () => void; getSnapshot(): CodexSubscriptionState }
  getSpeed(model: string): Promise<CodexSpeedState>
  setSpeed(model: string, enabled: boolean): Promise<CodexSpeedState>
}

const fallbackControls: CodexSubscriptionState = { status: 'signed-in', models: [], compactModelControl: true }
const noSubscribe = () => () => {}
const defaultControls = () => fallbackControls

/** One model seat, sharing DSH's directory and authoritative selection for every provider. */
export function ModelControl({ locked, available, directory, load, select, getSpeed, setSpeed, controls, t }:
  ModelControlInjected & { locked: boolean } & PropsLocale<'codex.model'>) {
  const controlState = useSyncExternalStore(controls?.subscribe ?? noSubscribe, controls?.getSnapshot ?? defaultControls)
  const compact = controlState.compactModelControl === true
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const [open, setOpen] = useState(false)
  const [effortList, setEffortList] = useState(false)
  const [modelList, setModelList] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [speed, setSpeedState] = useState<CodexSpeedState>({ enabled: false, supported: false })
  const [speedReady, setSpeedReady] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const modelTrigger = useRef<HTMLButtonElement>(null)
  const active = useRef(true)
  const operation = useRef(false)
  const generation = useRef(0)
  const current = state.current
  const group = state.groups.find(item => item.id === current?.provider)
  const model = group?.models.find(item => item.id === current?.model)
  const stops = sliderStops(model?.reasoning, t('default')).map(item => ({
    ...item, name: compact && item.id !== undefined && ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(item.id)
      ? t(item.id as keyof typeof modelEn) : item.name,
  }))
  const effective = current?.reasoningEffort ?? model?.reasoning?.defaultEffort
  const index = stops.findIndex(item => item.id === effective)
  // Keep pointer movement continuous; only the committed value is an effort index.
  const [draft, setDraft] = useState(0)
  const draftModel = useRef<string>()
  const nearest = Math.round(draft)
  const progress = stops.length < 2 ? 0 : draft / (stops.length - 1)
  const refreshing = state.status === 'loading'
  const busy = locked || pending || state.pending !== null || refreshing
  const codex = current?.provider === 'codex-subscription'
  const caption = model?.name ?? current?.model ?? t('choose')
  const savedEffort = index >= 0 ? stops[index]?.name : state.retainedEffort ?? effective
  const triggerLabel = open ? t('choose') : [caption, savedEffort].filter(Boolean).join(' ')

  useEffect(() => { active.current = true; return () => { active.current = false; generation.current++ } }, [])
  useEffect(() => {
    const key = `${current?.provider}:${current?.model}`
    // A save's intermediate projection must not rewind the locally previewed thumb.
    if (operation.current && draftModel.current === key) return
    draftModel.current = key
    setDraft(Math.max(0, index))
  }, [index, current?.model, current?.provider])
  useEffect(() => {
    const epoch = ++generation.current
    setSpeedReady(false)
    setSpeedState({ enabled: false, supported: false })
    if (!codex || current === null) return
    let disposed = false
    void getSpeed(current.model).then(value => {
      if (!disposed && epoch === generation.current) { setSpeedState(value); setSpeedReady(true) }
    }).catch(() => { if (!disposed && epoch === generation.current) setFailed(true) })
    return () => { disposed = true }
  }, [codex, current?.model, getSpeed, controlState.status, controlState.instanceId])

  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const anchor = trigger.current?.getBoundingClientRect()
      const card = panel.current?.getBoundingClientRect()
      if (!anchor || !card) return
      const margin = 8
      setPosition({
        left: Math.max(margin, Math.min(anchor.right - card.width, window.innerWidth - card.width - margin)),
        top: Math.max(margin, anchor.top - card.height - margin >= margin
          ? anchor.top - card.height - margin : Math.min(anchor.bottom + margin, window.innerHeight - card.height - margin)),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    const observer = new ResizeObserver(place)
    if (panel.current) observer.observe(panel.current)
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, compact, effortList, modelList])

  const close = (): void => { setModelList(false); setEffortList(false); setOpen(false); trigger.current?.focus() }
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent): void => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) { setOpen(false); setModelList(false); setEffortList(false) }
    }
    document.addEventListener('mousedown', outside)
    const focus = modelList || effortList
      ? panel.current?.querySelector<HTMLElement>('[aria-checked="true"],button:not(:disabled)')
      : modelTrigger.current ?? panel.current?.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled)')
    focus?.focus()
    return () => { document.removeEventListener('mousedown', outside) }
  }, [open, compact, modelList, effortList])

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    if (operation.current || busy) return
    operation.current = true
    setPending(true); setFailed(false)
    try { await action() } catch { if (active.current) { setFailed(true); setDraft(Math.max(0, index)) } }
    finally { operation.current = false; if (active.current) setPending(false) }
  }
  const effort = async (value: string | undefined): Promise<void> => {
    if (!current) return
    const outcome = await select({ provider: current.provider, model: current.model,
      ...value === undefined ? {} : { reasoningEffort: value } })
    if (outcome && !outcome.ok) throw new Error('Selection failed')
  }
  const toggleFast = (): void => {
    if (!current || !speedReady || !speed.supported) return
    const epoch = generation.current
    void run(async () => {
      const next = await setSpeed(current.model, !speed.enabled)
      if (active.current && epoch === generation.current) setSpeedState(next)
    })
  }
  const reset = (): void => {
    const selected = current
    void run(async () => {
      await effort(model?.reasoning?.defaultEffort)
      if (codex && selected) {
        const next = await setSpeed(selected.model, false)
        if (active.current) setSpeedState(next)
      }
      if (active.current) setDraft(Math.max(0, stops.findIndex(item => item.id === model?.reasoning?.defaultEffort)))
    })
  }
  const commit = (value: number): void => {
    const next = Math.max(0, Math.min(stops.length - 1, Math.round(value)))
    setDraft(next)
    if (stops.length === 0 || next === index) return
    void run(async () => { await effort(stops[next]?.id) })
  }
  if (!available) return null
  return <>
    <button ref={trigger} type="button" className={css.trigger} disabled={locked}
      aria-haspopup="dialog" aria-expanded={open} aria-label={`${t('choose')}: ${caption}${codex && speed.enabled ? `, ${t('fast')}` : ''}`}
      onClick={() => { if (open) close(); else { setOpen(true); setModelList(false); setFailed(false); load() } }}>
      {!open && codex && speed.supported && speed.enabled && <svg className={css.fastIndicator} data-fast="true"
        viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" focusable="false"><path d="M13.5 2.5 5 13h6l-1 8.5L19 11h-6.5l1-8.5Z" /></svg>}
      <span className={css.caption}>{triggerLabel}</span> <span aria-hidden="true">⌄</span>
    </button>
    {open && createPortal(<MenuSurface ref={panel} className={`${css.panel} ${compact ? '' : css.classic} ${modelList ? css.modelPopup : ''} scrollable`} role="dialog" aria-label={t('panel')}
      aria-busy={busy} data-saving={pending || state.pending !== null || refreshing} style={{ position: 'fixed', ...position }} onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); if (modelList) { setModelList(false) } else if (effortList) { setEffortList(false) } else close() }
        if (event.key === 'Tab') {
          const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)') ?? [])]
          const at = nodes.indexOf(document.activeElement as HTMLElement)
          if (nodes.length && (event.shiftKey ? at <= 0 : at === nodes.length - 1)) {
            event.preventDefault(); nodes[event.shiftKey ? nodes.length - 1 : 0]?.focus()
          }
        }
      }}>
      {modelList ? <div role="menu" aria-label={t('choose')} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const nodes = [...(panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)') ?? [])]
          const at = nodes.indexOf(document.activeElement as HTMLButtonElement)
          nodes[(at + (event.key === 'ArrowDown' ? 1 : -1) + nodes.length) % nodes.length]?.focus()
        }
      }}>
        <button type="button" className={css.row} onClick={() => { setModelList(false) }}>{t('back')}</button>
      <div className={css.group}>{t('choose')}</div>
      {state.groups.map(provider => <section key={provider.id}>
        <div className={css.group}>{provider.name}</div>
        {provider.models.map(entry => <button type="button" key={entry.id} className={css.option} role="menuitemradio"
          disabled={busy} aria-checked={provider.id === current?.provider && entry.id === current.model} onClick={() => {
            void run(async () => {
              const reasoningEffort = provider.id === current?.provider && entry.id === current.model
                ? current.reasoningEffort ?? entry.reasoning?.defaultEffort : entry.reasoning?.defaultEffort
              const outcome = await select({ provider: provider.id, model: entry.id,
                ...reasoningEffort === undefined ? {} : { reasoningEffort } })
              if (outcome && !outcome.ok) throw new Error('Selection failed')
              if (active.current) { setModelList(false) }
            })
          }}><span>{entry.name}</span>{provider.id === current?.provider && entry.id === current.model && <span>✓</span>}</button>)}
      </section>)}
      </div> : compact ? <>
        <div className={css.header}>
          {codex ? <Tooltip portal side="top" label={speed.supported ? t('fastHint') : t('unsupported')}>
            <button type="button" className={css.icon} aria-label={t('fast')} aria-pressed={speed.enabled}
              disabled={busy || !speedReady || !speed.supported} onClick={toggleFast}>
              <svg className={css.lightning} viewBox="0 0 24 24" fill={speed.enabled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M13.5 2.5 5 13h6l-1 8.5L19 11h-6.5l1-8.5Z" />
              </svg>
            </button>
          </Tooltip> : <span />}
          <span className={css.effort}>{index < 0 ? state.retainedEffort ?? effective ?? t('default') : stops[nearest]?.name ?? t('default')}</span>
          <Tooltip portal side="top" label={t('reset')}><button type="button" className={css.icon} aria-label={t('reset')}
            disabled={busy || !model || state.routable === false || (codex && !speedReady)} onClick={reset}><IconRefreshOutlineRegular /></button></Tooltip>
        </div>
        <button ref={modelTrigger} type="button" className={css.model} disabled={busy} aria-haspopup="menu" aria-expanded={modelList}
          onClick={() => { setModelList(value => !value) }}>{caption} ›</button>
        {stops.length > 0 ? <div className={css.slider}>
          <input type="range" min={0} max={Math.max(0, stops.length - 1)} step="any" value={draft}
            style={{ background: `linear-gradient(to right, var(--dsw-alias-state-business-primary) calc(${progress * 100}% + ${13 - progress * 26}px), var(--dsw-alias-bg-module-platform) 0)` }}
            aria-label={t('thinking')} aria-valuetext={stops[nearest]?.name} disabled={locked || state.routable === false || stops.length < 2} aria-disabled={busy}
            onChange={event => { if (!busy) setDraft(Number(event.target.value)) }}
            onPointerDown={event => { if (busy) { event.preventDefault(); return } event.currentTarget.setPointerCapture(event.pointerId) }}
            onPointerUp={event => { if (!busy) commit(Number(event.currentTarget.value)) }}
            onPointerCancel={() => { setDraft(Math.max(0, index)) }}
            onBlur={event => { if (!busy) commit(Number(event.currentTarget.value)) }}
            onKeyDown={event => {
              if (busy) { event.preventDefault(); return }
              let next: number
              if (event.key === 'Home') next = 0
              else if (event.key === 'End') next = stops.length - 1
              else if (['ArrowRight', 'ArrowUp'].includes(event.key)) next = Math.min(stops.length - 1, nearest + 1)
              else if (['ArrowLeft', 'ArrowDown'].includes(event.key)) next = Math.max(0, nearest - 1)
              else return
              event.preventDefault(); setDraft(next)
            }}
            onKeyUp={event => { if (!busy && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) commit(Number(event.currentTarget.value)) }} />
          <div className={css.ticks} aria-hidden="true">{stops.map((item, at) => <i key={item.id ?? 'default'} style={{ left: `${stops.length < 2 ? 50 : at / (stops.length - 1) * 100}%` }} />)}</div>
        </div> : <p className={css.hint}>{t('none')}</p>}
      </> : effortList ? <>
        <button className={css.row} type="button" onClick={() => { setEffortList(false) }}>{t('back')}</button>
        {stops.map(item => <button key={item.id ?? 'default'} type="button" className={css.option} role="menuitemradio"
          aria-checked={item.id === effective} disabled={busy || !state.routable}
          onClick={() => { void run(async () => { await effort(item.id); if (active.current) setEffortList(false) }) }}>{item.name}{item.id === effective ? ' ✓' : ''}</button>)}
      </> : <>
        <button ref={modelTrigger} type="button" className={css.row} disabled={busy} aria-haspopup="menu" aria-expanded={modelList}
          onClick={() => { setModelList(value => !value) }}><span>{t('model')}</span><span className={css.value}>{caption}</span>›</button>
        {stops.length > 0 && <button type="button" className={css.row} disabled={busy || !state.routable}
          onClick={() => { setEffortList(true) }}><span>{t('effortMenu')}</span><span className={css.value}>{index < 0 ? state.retainedEffort ?? effective : stops[index]?.name}</span>›</button>}
        {codex && <div className={css.row}><span>{t('speed')}</span><span className={css.value}>{speed.enabled ? t('fast') : t('standard')}</span>
          <Tooltip portal side="top" label={speed.supported ? t('fastHint') : t('unsupported')}>
            <button type="button" role="switch" className={css.switch} aria-label={t('fast')} aria-checked={speed.enabled}
              disabled={busy || !speedReady || !speed.supported} onClick={toggleFast}><i /></button>
          </Tooltip>
        </div>}
      </>}
      {(failed || state.error || state.failures.length > 0) && <p role="alert" className={css.error}>{t('failed')}</p>}
      {(state.status === 'error' || state.failures.length > 0) && <button type="button" className={css.model} disabled={busy} onClick={load}>{t('retry')}</button>}
    </MenuSurface>, document.body)}

  </>
}
