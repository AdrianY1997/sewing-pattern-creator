/**
 * Pan/zoom/cursor handling of the canvas viewport:
 * - wheel: zoom at the cursor; shift + wheel: pan
 * - middle-button drag, space + drag, or drag with the "Mover" tool: pan
 */
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import type { Vec } from '../../core'
import { useEditorStore } from '../store/editorStore'
import { screenToWorld, wheelZoomFactor } from './viewTransform'

const LINE_HEIGHT_PX = 16

const isEditable = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

/** Viewport-relative position of a mouse event. */
const localPoint = (el: HTMLElement, ev: { clientX: number; clientY: number }): Vec => {
  const r = el.getBoundingClientRect()
  return { x: ev.clientX - r.left, y: ev.clientY - r.top }
}

export interface ViewportControls {
  /** World position (mm) under the cursor, null when outside. */
  readonly cursor: Vec | null
  readonly panning: boolean
  readonly spaceDown: boolean
  readonly handlers: {
    onPointerDown(ev: PointerEvent<HTMLElement>): void
    onPointerMove(ev: PointerEvent<HTMLElement>): void
    onPointerUp(ev: PointerEvent<HTMLElement>): void
    onPointerLeave(): void
  }
}

export function useViewportControls(ref: RefObject<HTMLElement | null>): ViewportControls {
  const [cursor, setCursor] = useState<Vec | null>(null)
  const [panning, setPanning] = useState(false)
  const [spaceDown, setSpaceDown] = useState(false)
  const last = useRef<Vec | null>(null)

  // Wheel needs a non-passive listener to prevent page scroll / browser zoom.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const k = ev.deltaMode === 1 ? LINE_HEIGHT_PX : 1
      const store = useEditorStore.getState()
      if (ev.shiftKey) store.panBy(-ev.deltaX * k, -ev.deltaY * k)
      else store.zoomAt(localPoint(el, ev), wheelZoomFactor(ev.deltaY * k))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref])

  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.code !== 'Space' || isEditable(ev.target)) return
      const inCanvas = ev.target === document.body || ref.current?.contains(ev.target as Node)
      if (inCanvas) ev.preventDefault()
      setSpaceDown(true)
    }
    const up = (ev: KeyboardEvent) => ev.code === 'Space' && setSpaceDown(false)
    const blur = () => setSpaceDown(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [ref])

  const handlers: ViewportControls['handlers'] = {
    onPointerDown(ev) {
      // Floating panels (Capas, zoom, readout) live in the viewport but are not canvas.
      if (!(ev.target instanceof Element) || !ev.target.closest('.canvas-svg')) return
      const store = useEditorStore.getState()
      const pan = ev.button === 1 || (ev.button === 0 && (spaceDown || store.tool === 'pan'))
      if (pan) {
        ev.preventDefault()
        ev.currentTarget.setPointerCapture(ev.pointerId)
        last.current = { x: ev.clientX, y: ev.clientY }
        setPanning(true)
      } else if (ev.button === 0) store.selectPiece(null) // click on empty canvas
    },
    onPointerMove(ev) {
      const el = ref.current
      if (!el) return
      if (panning && last.current) {
        useEditorStore.getState().panBy(ev.clientX - last.current.x, ev.clientY - last.current.y)
        last.current = { x: ev.clientX, y: ev.clientY }
      }
      setCursor(screenToWorld(useEditorStore.getState().view, localPoint(el, ev)))
    },
    onPointerUp(ev) {
      if (!panning) return
      if (ev.currentTarget.hasPointerCapture(ev.pointerId))
        ev.currentTarget.releasePointerCapture(ev.pointerId)
      last.current = null
      setPanning(false)
    },
    onPointerLeave() {
      if (!panning) setCursor(null)
    },
  }

  return { cursor, panning, spaceDown, handlers }
}
