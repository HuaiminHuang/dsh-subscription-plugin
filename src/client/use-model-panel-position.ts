/** Position the model panel and own the observers that keep it aligned. */
import { useLayoutEffect, useState, type RefObject } from 'react'

export function modelPanelPosition(
  anchor: { right: number; top: number; bottom: number },
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const margin = 8
  return {
    left: Math.max(margin, Math.min(anchor.right - card.width, viewport.width - card.width - margin)),
    top: Math.max(margin, anchor.top - card.height - margin >= margin
      ? anchor.top - card.height - margin : Math.min(anchor.bottom + margin, viewport.height - card.height - margin)),
  }
}

export function useModelPanelPosition({ open, compact, effortList, modelList, trigger, panel }: {
  open: boolean; compact: boolean; effortList: boolean; modelList: boolean
  trigger: RefObject<HTMLButtonElement>; panel: RefObject<HTMLDivElement>
}): { left: number; top: number } {
  const [position, setPosition] = useState({ left: 0, top: 0 })
  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const anchor = trigger.current?.getBoundingClientRect()
      const card = panel.current?.getBoundingClientRect()
      if (anchor && card) setPosition(modelPanelPosition(anchor, card, { width: window.innerWidth, height: window.innerHeight }))
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    const observer = new ResizeObserver(place)
    if (panel.current) observer.observe(panel.current)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, compact, effortList, modelList, trigger, panel])
  return position
}
