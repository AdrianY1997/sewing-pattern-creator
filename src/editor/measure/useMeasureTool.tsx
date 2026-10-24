/**
 * "Medir" tool: click two points for the straight distance (and, when both lie on one piece outline,
 * the length along it); click a segment, or Shift + click contiguous ones, for the length along the
 * path. The readout is a floating chip in cm.
 */
import { useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { path, segEnd, stripMeta, toSvgPathData, type Draft, type Vec } from '../../core'
import type { DraftRender } from '../canvas/draftGeometry'
import { SNAP_TOLERANCE_PX, type SnapResult } from '../canvas/snap'
import { worldToScreen, type Size, type ViewTransform } from '../canvas/viewTransform'
import { useEditorStore } from '../store/editorStore'
import '../rulers/rulers.css'
import { continuesChain, measureChain, measurePoints, segmentNear } from './measureGeometry'

const cm = (mm: number) => `${(mm / 10).toFixed(1)} cm`

const POINT_KINDS = new Set(['point', 'endpoint', 'intersection'])

export interface MeasureTool {
  onPointerDownCapture(ev: PointerEvent<HTMLDivElement>, world: Vec | null): boolean
  readonly layer: ReactNode
  readonly chip: ReactNode
}

export function useMeasureTool(opts: {
  readonly active: boolean
  readonly draft: Draft
  readonly render: DraftRender
  readonly view: ViewTransform
  readonly size: Size
  readonly snapAt: (p: Vec, grid?: boolean) => SnapResult | null
}): MeasureTool {
  const { active, draft, render, view, size, snapAt } = opts
  // The measure belongs to one drawing: another one (view, size, edits) starts afresh.
  const [state, setState] = useState<{
    readonly draft: Draft | null
    readonly points: readonly Vec[]
    readonly chain: readonly string[]
  }>({ draft: null, points: [], chain: [] })
  const current = state.draft === draft
  const points = current ? state.points : []
  const chain = current ? state.chain : []

  const onPointerDownCapture = (ev: PointerEvent<HTMLDivElement>, world: Vec | null): boolean => {
    // Floating panels (chip, Capas, zoom) live in the viewport but are not canvas.
    const onCanvas = ev.target instanceof Element && ev.target.closest('.canvas-svg') !== null
    if (!active || ev.button !== 0 || !world || !onCanvas) return false
    ev.preventDefault()
    ev.stopPropagation()
    const hit = snapAt(world)
    if (!hit || !POINT_KINDS.has(hit.kind)) {
      const layers = useEditorStore.getState().layers
      const seg = segmentNear(
        draft,
        render,
        hit?.kind === 'midpoint' || hit?.kind === 'curve' ? hit.at : world,
        SNAP_TOLERANCE_PX / view.scale,
        (layer) => layers[layer as keyof typeof layers] !== false,
      )
      if (seg) {
        const next = ev.shiftKey && continuesChain(draft, chain, seg) ? [...chain, seg] : [seg]
        setState({ draft, points: [], chain: next })
        return true
      }
    }
    const at = hit?.at ?? world
    setState({ draft, points: points.length >= 2 ? [at] : [...points, at], chain: [] })
    return true
  }

  if (!active) return { onPointerDownCapture, layer: null, chip: null }

  // ---------- readout ----------
  let text: string
  let anchor: Vec | null = null
  if (chain.length) {
    const m = measureChain(draft, chain)
    text = `Largo: ${cm(m.length)}${m.count > 1 ? ` (${m.count} tramos)` : ''}`
    const last = draft.segments[chain[chain.length - 1]]
    anchor = last ? segEnd(stripMeta(last)) : null
  } else if (points.length === 2) {
    const m = measurePoints(draft, points[0], points[1])
    text = `Distancia: ${cm(m.straight)}`
    if (m.outline) text += ` · por el contorno: ${cm(m.outline.short)} (o ${cm(m.outline.long)})`
    anchor = points[1]
  } else if (points.length === 1) {
    text = 'Medir: clic en el segundo punto'
    anchor = points[0]
  } else text = 'Medir: clic en dos puntos, o en un segmento (Mayús + clic: tramos contiguos)'

  const px = 1 / view.scale
  const layer = (
    <g className="measure" data-testid="measure-layer">
      {chain.map((id) => {
        const s = draft.segments[id]
        return s ? (
          <path key={id} className="measure-chain" d={toSvgPathData(path([stripMeta(s)]))} />
        ) : null
      })}
      {points.length === 2 && (
        <line
          className="measure-line"
          x1={points[0].x}
          y1={points[0].y}
          x2={points[1].x}
          y2={points[1].y}
        />
      )}
      {points.map((p, i) => (
        <circle key={i} className="measure-point" cx={p.x} cy={p.y} r={4 * px} />
      ))}
    </g>
  )
  let style: CSSProperties | undefined
  if (anchor) {
    const s = worldToScreen(view, anchor)
    style = {
      left: Math.max(8, Math.min(size.width - 240, s.x + 14)),
      top: Math.max(8, Math.min(size.height - 40, s.y - 40)),
    }
  }
  const chip = (
    <div
      className={anchor ? 'measure-chip is-floating' : 'canvas-hint measure-chip'}
      role="status"
      data-testid="measure-chip"
      style={style}
    >
      {text}
    </div>
  )
  return { onPointerDownCapture, layer, chip }
}
