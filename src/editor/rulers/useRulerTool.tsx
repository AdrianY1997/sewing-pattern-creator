/**
 * "Reglas" tool of the canvas: the ruler on the canvas and its interactions.
 * - place: drag the body to move the ruler; drag the round handle to turn it (Shift: 15° steps);
 *   Alt + drag, or the wheel over the ruler, slides it along its own working edge
 * - align ("Alinear"): click a point, the ruler moves so its nearest working edge passes through it
 * - trace ("Trazar"): click two points; the curve along the ruler is previewed with its deviation and
 *   applied on "Aplicar" / Enter (see traceOps). "Ajuste automático" moves the ruler to the pose
 *   that follows the existing curve between the two points best (autoAlignRuler)
 * The pose is UI state (persisted per ruler), not an operation.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  alignPose,
  autoAlignRuler,
  bestRulerTrace,
  degToRad,
  dot,
  edgeAt,
  getRuler,
  nearestRulerEdge,
  poseCentredAt,
  radToDeg,
  rotatePose,
  rulerEdge,
  slidePose,
  sub,
  toWorld,
  translatePose,
  wrapDegrees,
  type RulerPose,
  type Vec,
} from '../../core'
import type { SnapResult } from '../canvas/snap'
import { screenToWorld, type Size, type ViewTransform } from '../canvas/viewTransform'
import { newOpId, useEditorStore } from '../store/editorStore'
import { cachedDraft, statePattern } from '../store/useDraft'
import { RulerLayer } from './RulerLayer'
import './rulers.css'
import { RulerPanel } from './RulerPanel'
import { useRulerStore } from './rulerStore'
import { draftCurveSources, existingCurveBetween, piecesCurveSources, planTrace } from './traceOps'

interface RulerDrag {
  readonly kind: 'move' | 'rotate' | 'slide'
  readonly pointerId: number
  readonly start: Vec
  readonly pose0: RulerPose
  readonly contact?: { readonly edgeId: string; readonly s: number }
}

/** Slide (mm) per wheel pixel. */
const WHEEL_MM_PER_PX = 0.1

const localPoint = (el: HTMLElement, ev: { clientX: number; clientY: number }): Vec => {
  const r = el.getBoundingClientRect()
  return { x: ev.clientX - r.left, y: ev.clientY - r.top }
}

const under = (target: EventTarget | null, attr: string) =>
  target instanceof Element ? target.closest(`[${attr}]`) !== null : false

/** Floating panels (the ruler bar, Capas, zoom) live in the viewport but are not canvas. */
const onCanvas = (target: EventTarget | null) =>
  target instanceof Element && target.closest('.canvas-svg') !== null

/** World tangent of a working edge at s for a pose. */
const worldTangent = (pose: RulerPose, edge: ReturnType<typeof rulerEdge>, s: number): Vec => {
  const a = degToRad(pose.angleDeg) + (pose.flipped ? -1 : 1) * edgeAt(edge, s).theta
  return { x: Math.cos(a), y: Math.sin(a) }
}

export interface RulerTool {
  onPointerDownCapture(ev: PointerEvent<HTMLDivElement>): boolean
  onPointerMove(ev: PointerEvent<HTMLDivElement>): void
  onPointerUp(ev: PointerEvent<HTMLDivElement>): boolean
  readonly layer: ReactNode
  readonly panel: ReactNode
  /** CSS class for the viewport cursor. */
  readonly cursorClass: string
}

export function useRulerTool(opts: {
  readonly active: boolean
  readonly viewportRef: RefObject<HTMLDivElement | null>
  readonly view: ViewTransform
  readonly size: Size
  readonly snapAt: (p: Vec, grid?: boolean) => SnapResult | null
}): RulerTool {
  const { active, viewportRef, view, size, snapAt } = opts
  const rulerId = useRulerStore((s) => s.rulerId)
  const stored = useRulerStore((s) => s.poses[s.rulerId])
  const mode = useRulerStore((s) => s.mode)
  const tracePoints = useRulerStore((s) => s.tracePoints)
  const message = useRulerStore((s) => s.message)
  const autoFit = useRulerStore((s) => s.autoFit)
  const ruler = getRuler(rulerId)
  const [drag, setDrag] = useState<RulerDrag | null>(null)
  const [live, setLive] = useState<RulerPose | null>(null)

  // A ruler without a pose yet appears in the middle of the view.
  useEffect(() => {
    if (!active || stored || size.width <= 0) return
    const centre = screenToWorld(view, { x: size.width / 2, y: size.height / 2 })
    useRulerStore.getState().setPose(rulerId, poseCentredAt(ruler, centre))
  }, [active, stored, size, view, rulerId, ruler])

  const pose = live ?? stored ?? null

  const worldAt = (ev: { clientX: number; clientY: number }): Vec | null => {
    const el = viewportRef.current
    return el ? screenToWorld(useEditorStore.getState().view, localPoint(el, ev)) : null
  }

  // ---------- trace ----------
  const trace = useMemo(
    () =>
      pose && tracePoints.length === 2
        ? bestRulerTrace(ruler, pose, tracePoints[0].at, tracePoints[1].at)
        : null,
    [ruler, pose, tracePoints],
  )

  const applyTrace = useCallback(() => {
    const rs = useRulerStore.getState()
    const [a, b] = rs.tracePoints
    if (!trace || !a || !b) return
    const s = useEditorStore.getState()
    if (s.viewMode !== 'pieces') {
      rs.setMessage('Trazar edita piezas separadas: cambia a la vista Piezas')
      return
    }
    const plan = planTrace(trace, a, b, statePattern(s).result.pattern.pieces, newOpId)
    if (plan.kind === 'error') {
      rs.setMessage(plan.message)
      return
    }
    s.applyOps(plan.ops)
    rs.clearTrace()
  }, [trace])

  const autoAlign = useCallback(() => {
    const rs = useRulerStore.getState()
    const [a, b] = rs.tracePoints
    if (!a || !b) return
    const s = useEditorStore.getState()
    const sources =
      s.viewMode === 'pieces'
        ? piecesCurveSources(statePattern(s).result.pattern.pieces)
        : draftCurveSources(cachedDraft(s.blockId, s.size, s.blockOptions).draft)
    const curve = existingCurveBetween(sources.outlines, sources.segments, a.at, b.at)
    const current = rs.poses[ruler.id]
    const fit = autoAlignRuler(ruler, a.at, b.at, {
      ...(curve && { curve }),
      ...(current && { current }),
    })
    if (!fit) {
      rs.setMessage('La regla no alcanza los dos puntos: prueba con otra regla')
      return
    }
    rs.setAutoFit(ruler.id, fit.pose, fit.curveDeviation)
  }, [ruler])

  // Escape cancels the drag or the trace; Enter applies the trace.
  useEffect(() => {
    if (!active) return
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target
      if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (ev.key === 'Escape') {
        setDrag(null)
        setLive(null)
        useRulerStore.getState().clearTrace()
      } else if (ev.key === 'Enter' && trace) {
        ev.preventDefault()
        applyTrace()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, trace, applyTrace])

  // Wheel over the ruler slides it along its working edge (instead of zooming).
  useEffect(() => {
    const el = viewportRef.current
    if (!el || !active) return
    const onWheel = (ev: WheelEvent) => {
      if (ev.ctrlKey || !under(ev.target, 'data-ruler-body')) return
      const rs = useRulerStore.getState()
      const p = rs.poses[rs.rulerId]
      if (!p) return
      ev.preventDefault()
      ev.stopPropagation()
      const r = getRuler(rs.rulerId)
      const at = screenToWorld(useEditorStore.getState().view, localPoint(el, ev))
      const hit = nearestRulerEdge(r, p, at)
      const k = ev.deltaMode === 1 ? 16 : 1
      rs.setPose(r.id, slidePose(r, hit.edgeId, p, hit.s, ev.deltaY * k * WHEEL_MM_PER_PX).pose)
    }
    // Capture phase: runs before (and stops) the viewport's zoom listener.
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', onWheel, { capture: true })
  }, [viewportRef, active])

  const onPointerDownCapture = (ev: PointerEvent<HTMLDivElement>): boolean => {
    if (!active || !pose || ev.button !== 0 || !onCanvas(ev.target)) return false
    const start = worldAt(ev)
    if (!start) return false
    const rs = useRulerStore.getState()
    const stop = () => {
      ev.preventDefault()
      ev.stopPropagation()
    }
    if (mode === 'align') {
      stop()
      const at = snapAt(start)?.at ?? start
      rs.setPose(ruler.id, alignPose(ruler, pose, at).pose)
      rs.setMode('place')
      return true
    }
    if (mode === 'trace') {
      stop()
      const hit = snapAt(start)
      rs.addTracePoint({ at: hit?.at ?? start, snap: hit })
      return true
    }
    const handle = under(ev.target, 'data-ruler-handle')
    const body = under(ev.target, 'data-ruler-body')
    if (!handle && !body) return false
    stop()
    ev.currentTarget.setPointerCapture(ev.pointerId)
    if (handle) setDrag({ kind: 'rotate', pointerId: ev.pointerId, start, pose0: pose })
    else if (ev.altKey) {
      const hit = nearestRulerEdge(ruler, pose, start)
      setDrag({
        kind: 'slide',
        pointerId: ev.pointerId,
        start,
        pose0: pose,
        contact: { edgeId: hit.edgeId, s: hit.s },
      })
    } else setDrag({ kind: 'move', pointerId: ev.pointerId, start, pose0: pose })
    return true
  }

  const onPointerMove = (ev: PointerEvent<HTMLDivElement>) => {
    if (!drag || ev.pointerId !== drag.pointerId) return
    const p = worldAt(ev)
    if (!p) return
    const { pose0, start } = drag
    if (drag.kind === 'move') setLive(translatePose(pose0, sub(p, start)))
    else if (drag.kind === 'rotate') {
      const c = toWorld(pose0, ruler.centre)
      const turn = radToDeg(
        Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(start.y - c.y, start.x - c.x),
      )
      let angle = wrapDegrees(pose0.angleDeg + turn)
      if (ev.shiftKey) angle = wrapDegrees(Math.round(angle / 15) * 15)
      setLive(rotatePose(ruler, pose0, angle))
    } else if (drag.contact) {
      const e = rulerEdge(ruler, drag.contact.edgeId)
      const delta = dot(sub(p, start), worldTangent(pose0, e, drag.contact.s))
      setLive(slidePose(ruler, drag.contact.edgeId, pose0, drag.contact.s, delta).pose)
    }
  }

  const onPointerUp = (ev: PointerEvent<HTMLDivElement>): boolean => {
    if (!drag || ev.pointerId !== drag.pointerId) return false
    if (ev.currentTarget.hasPointerCapture(ev.pointerId))
      ev.currentTarget.releasePointerCapture(ev.pointerId)
    if (live) useRulerStore.getState().setPose(ruler.id, live)
    setLive(null)
    setDrag(null)
    return true
  }

  const shown = active && pose
  const layer = shown ? (
    <RulerLayer
      ruler={ruler}
      pose={pose}
      scale={view.scale}
      interactive={mode === 'place'}
      preview={trace ? trace.beziers : null}
      points={tracePoints.map((p) => p.at)}
      warn={!!trace?.warn}
    />
  ) : null
  const panel = shown ? (
    <RulerPanel
      ruler={ruler}
      pose={pose}
      mode={mode}
      pointCount={tracePoints.length}
      trace={trace}
      message={message}
      autoFit={autoFit}
      onApply={applyTrace}
      onAutoAlign={autoAlign}
    />
  ) : null
  const cursorClass = !active
    ? ''
    : drag
      ? 'ruler-dragging'
      : mode === 'place'
        ? 'ruler-place'
        : 'tool-crosshair'
  return { onPointerDownCapture, onPointerMove, onPointerUp, layer, panel, cursorClass }
}
