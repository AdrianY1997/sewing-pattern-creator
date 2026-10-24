import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import {
  applyOperations,
  distance,
  midpoint,
  radToDeg,
  segmentBBox,
  splitPieceKey,
  stripMeta,
  sub,
  type BBox,
  type LineAnchor,
  type Operation,
  type OperationInput,
  type Vec,
} from '../../core'
import { useMeasureTool } from '../measure/useMeasureTool'
import { useRulerTool } from '../rulers/useRulerTool'
import { useEditorStore, type Tool } from '../store/editorStore'
import {
  allowanceDefaults,
  buildPatternData,
  cachedDraft,
  replayOptionsFor,
  statePattern,
  useCurrentBlock,
  useCurrentPattern,
  useDisplay,
  useSizeOutlines,
  type DisplayData,
} from '../store/useDraft'
import { CanvasHint } from './CanvasHint'
import { CanvasToolbar } from './CanvasToolbar'
import { HoverRing, PointTooltip, SnapMarker } from './CanvasOverlay'
import { CursorReadout } from './CursorReadout'
import type { VertexRef } from './draftGeometry'
import { DraftLayers } from './DraftLayers'
import { lineAnchorAt, markAnchorAt, pieceAtPoint, vertexAt } from './editTools'
import { Grid } from './Grid'
import { LayersPanel } from './LayersPanel'
import { grainMoveOp, grainRotateOp, notchCandidate, toLocalVector } from './markTools'
import { PieceContextMenu, type ContextMenuState } from './PieceContextMenu'
import { pieceActions } from './pieceActions'
import { SNAP_TOLERANCE_PX, buildSnapIndex, pointsAt, snap, type SnapResult } from './snap'
import { useViewportControls } from './useViewportControls'
import {
  ZOOM_STEP,
  centreOn,
  fitBBox,
  screenToWorld,
  type Size,
  type ViewTransform,
} from './viewTransform'
import { ZoomControl } from './ZoomControl'
import './canvas.css'

/** Measure an element: synchronously before the first paint, then with a ResizeObserver. */
function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

/** Bounding box of what the canvas shows (the pieces, or the draft when there are none). */
const displayBBox = (): BBox => {
  const s = useEditorStore.getState()
  if (s.viewMode === 'pieces') {
    const p = statePattern(s)
    if (p.result.pattern.pieces.length > 0) return p.render.bbox
  }
  return cachedDraft(s.blockId, s.size, s.blockOptions).render.bbox
}

/**
 * A drag in the Piezas view: a piece with the Mover or Rotar tool, the grainline of the selected
 * piece by its handles (grainMove: centre handle; grainRotate: end handles), a vertex of the
 * selected piece (Seleccionar), a control point of the selected curve (Curva), or a new internal
 * line (Recta / Curva). Every drag commits one operation on release.
 */
interface Drag {
  readonly kind: 'move' | 'rotate' | 'grainMove' | 'grainRotate' | 'vertex' | 'handle' | 'draw'
  readonly pieceId: string
  readonly pointerId: number
  /** World position where the drag started. */
  readonly start: Vec
  /** Point of the piece that follows the cursor and snaps (Mover, vertex). */
  readonly anchor: Vec
  /** Rotation centre: the bbox centre of the piece (Rotar) or the grainline midpoint. */
  readonly centre: Vec
  /** Grainline handle being dragged: +1 its end, −1 its start. */
  readonly end?: 1 | -1
  /** Vertex being dragged (local reference). */
  readonly vertex?: VertexRef
  /** Curve control point being dragged. */
  readonly handle?: { readonly segmentId: string; readonly which: 'c1' | 'c2' }
  /** Line being drawn. */
  readonly draw?: {
    readonly kind: 'line' | 'curve'
    readonly from: LineAnchor
    /** Segment under the pointer when pressed (a click without moving selects it). */
    readonly clickSegment: string | null
    readonly moved: boolean
  }
  /** Operation the drag would commit now (previewed; committed once on pointer up). */
  readonly op: OperationInput | null
  readonly snap: SnapResult | null
}

const localPoint = (el: HTMLElement, ev: { clientX: number; clientY: number }): Vec => {
  const r = el.getBoundingClientRect()
  return { x: ev.clientX - r.left, y: ev.clientY - r.top }
}

const attrUnder = (target: EventTarget | null, attr: string): string | null =>
  target instanceof Element ? (target.closest(`[${attr}]`)?.getAttribute(attr) ?? null) : null

const grainHandleUnder = (target: EventTarget | null) => attrUnder(target, 'data-grain-handle')
const pieceUnder = (target: EventTarget | null) => attrUnder(target, 'data-piece')

/** Signed angle in degrees normalised to (−180, 180]. */
const wrapDeg = (d: number) => {
  const r = ((((d + 180) % 360) + 360) % 360) - 180
  return r === -180 ? 180 : r
}

/** Tools that place or edit points on the outline (crosshair cursor). */
const CROSSHAIR_TOOLS: readonly Tool[] = [
  'notch',
  'addPoint',
  'removePoint',
  'line',
  'curve',
  'text',
  'button',
]

/** True when the drag's operation changes something (worth an undo step). */
const effective = (op: OperationInput | null): boolean => {
  if (!op) return false
  switch (op.type) {
    case 'transformPiece':
      return (
        (!!op.translate && Math.hypot(op.translate.x, op.translate.y) > 1e-6) ||
        (op.rotateDeg !== undefined && Math.abs(op.rotateDeg) > 1e-6)
      )
    case 'movePoint':
      return Math.hypot(op.deltaMm.x, op.deltaMm.y) > 1e-6
    default:
      return true
  }
}

/** Drawing canvas (SVG, mm world): pan, zoom, grid, layers, selection and piece editing. */
export function Canvas() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(viewportRef)
  const block = useCurrentBlock()
  const display = useDisplay()
  const pattern = useCurrentPattern()
  const view = useEditorStore((s) => s.view)
  const layers = useEditorStore((s) => s.layers)
  const showGrid = useEditorStore((s) => s.showGrid)
  const selectedPieceId = useEditorStore((s) => s.selectedPieceId)
  const tool = useEditorStore((s) => s.tool)
  const selectPiece = useEditorStore((s) => s.selectPiece)
  const selectedSegmentId = useEditorStore((s) => s.selectedSegmentId)
  const selectSegment = useEditorStore((s) => s.selectSegment)
  const snapEnabled = useEditorStore((s) => s.snapEnabled)
  const advanced = useEditorStore((s) => s.advanced)
  const dartTransfer = useEditorStore((s) => s.dartTransfer)
  const mode = display.mode
  const sizes = useSizeOutlines(layers.sizes)
  const { cursor, panning, spaceDown, handlers } = useViewportControls(viewportRef)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

  // Fit once the viewport is measured, and when the block or the view mode changes. While the
  // view is still the fitted one (the user has not zoomed or panned), resizes fit again.
  const fittedView = useRef<ViewTransform | null>(null)
  const fittedFor = useRef<string | null>(null)
  const fitTo = useCallback((viewport: Size) => {
    fittedView.current = fitBBox(displayBBox(), viewport, 48)
    useEditorStore.getState().setView(fittedView.current)
  }, [])

  useLayoutEffect(() => {
    if (size.width <= 0 || size.height <= 0) return
    const untouched = useEditorStore.getState().view === fittedView.current
    const key = `${block.id}:${mode}`
    if (untouched || fittedFor.current !== key) {
      fittedFor.current = key
      fitTo(size)
    }
  }, [block.id, mode, size, fitTo])

  const fit = () => size.width > 0 && fitTo(size)

  // While dragging, preview the pending operation on top of the replayed pattern.
  const pendingOp = drag?.op ?? null
  const shown: DisplayData = useMemo(() => {
    if (!pendingOp || mode !== 'pieces') return display
    const op = { ...pendingOp, id: 'preview' } as Operation
    const options = replayOptionsFor(block, allowanceDefaults(advanced))
    const data = buildPatternData(applyOperations(pattern.result.pattern, [op], options))
    return { mode, draft: data.world, render: data.render, seams: data.seams }
  }, [pendingOp, mode, display, pattern, block, advanced])
  const { draft, render, seams } = shown
  const pieces = pattern.result.pattern.pieces
  const pieceById = (id: string | null | undefined) =>
    id ? (pieces.find((p) => p.id === id) ?? null) : null

  /** Real size (1:1 with the calibration), centred on the selection or the whole drawing. */
  const realSize = () => {
    if (size.width <= 0) return
    const s = useEditorStore.getState()
    const seg = s.selectedSegmentId ? draft.segments[s.selectedSegmentId] : undefined
    const piece = render.pieces.find((p) => p.id === s.selectedPieceId)
    const box: BBox = seg ? segmentBBox(stripMeta(seg)) : (piece?.bbox ?? displayBBox())
    const centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
    s.setView(centreOn(centre, size, s.pxPerMm))
  }

  // Snap targets: named points plus the segments of the visible layers. Built once per display and
  // layers; the piece being moved is left out at query time (`exclude`), so it snaps to the others
  // without rebuilding the intersections.
  const excluded = drag?.kind === 'move' ? drag.pieceId : null
  const snapIndex = useMemo(() => {
    const r = display.render
    const visible = r.segments.filter((sg) => layers[sg.layer])
    return buildSnapIndex(
      r.points.map((p) => {
        const i = p.name.indexOf('/')
        return i > 0 ? { ...p, owner: p.name.slice(0, i) } : p
      }),
      visible.map((sg) => stripMeta(display.draft.segments[sg.id])),
      new Map(visible.flatMap((sg) => (sg.pieceId ? [[sg.id, sg.pieceId] as const] : []))),
    )
  }, [display, layers])

  const pieceMode = mode === 'pieces' && !spaceDown
  const tracking = cursor !== null && !panning
  // Tools that pick a place on the outline do not snap to the grid.
  const outlineTool = pieceMode && (tool === 'notch' || tool === 'addPoint' || !!dartTransfer)
  const snapped = drag
    ? drag.snap
    : tracking && snapEnabled
      ? snap(snapIndex, cursor, {
          scale: view.scale,
          grid: showGrid && !outlineTool,
          exclude: excluded,
        })
      : null
  const tolMm = SNAP_TOLERANCE_PX / view.scale
  const aim = snapped?.at ?? cursor
  // "Añadir piquete" / "Añadir punto" / dart target: the outline point under the cursor.
  const outlineAt =
    outlineTool && tracking && !drag && aim
      ? notchCandidate(draft, render, aim, 1.5 * tolMm, dartTransfer?.pieceId)
      : null
  // "Eliminar punto": the vertex under the cursor; Seleccionar: a vertex of the selected piece.
  const vertexHover =
    pieceMode && tracking && !drag && cursor
      ? tool === 'removePoint'
        ? vertexAt(render, cursor, tolMm)
        : tool === 'select' && selectedPieceId
          ? vertexAt(render, cursor, tolMm, selectedPieceId)
          : null
      : null

  // Grainline handles of the selected extracted piece.
  const grainline =
    mode === 'pieces' && tool === 'select' && layers.outline && !spaceDown
      ? render.grainlines.find((g) => g.pieceId === selectedPieceId)
      : undefined
  // Control points of the selected curve (Curva tool).
  const curveSeg =
    mode === 'pieces' && tool === 'curve' && selectedSegmentId
      ? draft.segments[selectedSegmentId]
      : undefined
  const curve = curveSeg?.kind === 'cubic' ? curveSeg : null
  // Pending dart transfer: the apex, to draw the cut to the target.
  const transferApex = (() => {
    if (!dartTransfer || mode !== 'pieces') return null
    const p = pieceById(dartTransfer.pieceId)
    const d = p?.darts.find((x) => x.id === dartTransfer.dartId)
    return d ? (draft.points[`${p!.id}/${d.apex}`] ?? null) : null
  })()
  const hovered =
    tracking && !drag && tool === 'select' && !spaceDown && !vertexHover
      ? pointsAt(render.points, cursor, view.scale)
      : []

  const zoomCentre = (factor: number) =>
    useEditorStore.getState().zoomAt({ x: size.width / 2, y: size.height / 2 }, factor)

  // ---------- pointer handling ----------
  const worldAt = (ev: { clientX: number; clientY: number }): Vec | null => {
    const el = viewportRef.current
    return el ? screenToWorld(useEditorStore.getState().view, localPoint(el, ev)) : null
  }

  const snapAt = (p: Vec, grid = true): SnapResult | null => {
    const s = useEditorStore.getState()
    return s.snapEnabled
      ? snap(snapIndex, p, { scale: s.view.scale, grid: grid && s.showGrid })
      : null
  }

  // Reglas (real-size rulers) and Medir work in both views.
  const rulerTool = useRulerTool({
    active: tool === 'ruler' && !spaceDown,
    viewportRef,
    view,
    size,
    snapAt,
  })
  const measureTool = useMeasureTool({
    active: tool === 'measure' && !spaceDown,
    draft: display.draft,
    render: display.render,
    view,
    size,
    snapAt,
  })

  const beginDrag = (ev: PointerEvent<HTMLDivElement>, d: Drag) => {
    ev.preventDefault()
    ev.stopPropagation()
    ev.currentTarget.setPointerCapture(ev.pointerId)
    setDrag(d)
  }

  /**
   * Capture phase: edits that must win over the selection handlers of the pieces (pending dart
   * transfer, curve handles, vertex drags, drawing lines that start on an edge).
   */
  const onPointerDownCapture = (ev: PointerEvent<HTMLDivElement>) => {
    if (rulerTool.onPointerDownCapture(ev)) return
    if (measureTool.onPointerDownCapture(ev, worldAt(ev))) return
    if (ev.button !== 0 || mode !== 'pieces' || spaceDown) return
    const start = worldAt(ev)
    if (!start) return
    const s = useEditorStore.getState()
    const tol = SNAP_TOLERANCE_PX / s.view.scale
    const base = {
      pointerId: ev.pointerId,
      start,
      anchor: start,
      centre: start,
      op: null,
      snap: null,
    }
    if (s.dartTransfer) {
      ev.preventDefault()
      ev.stopPropagation()
      const at = snapAt(start, false)?.at ?? start
      const c = notchCandidate(draft, render, at, 1.5 * tol, s.dartTransfer.pieceId)
      if (c) pieceActions.transferDart(c.pieceId, s.dartTransfer.dartId, c.segmentId, c.ratio)
      return
    }
    const handle = attrUnder(ev.target, 'data-curve-handle')
    if (tool === 'curve' && curve && (handle === 'c1' || handle === 'c2')) {
      const key = splitPieceKey(curve.id)
      if (key)
        beginDrag(ev, {
          ...base,
          kind: 'handle',
          pieceId: key.pieceId,
          handle: { segmentId: key.localId, which: handle },
        })
      return
    }
    if (tool === 'select' && s.selectedPieceId) {
      const v = vertexAt(render, start, tol, s.selectedPieceId)
      if (v) {
        beginDrag(ev, { ...base, kind: 'vertex', pieceId: v.pieceId, anchor: v.at, vertex: v.ref })
        return
      }
    }
    if (tool === 'line' || tool === 'curve') {
      const piece = pieceById(pieceUnder(ev.target)) ?? pieceAtPoint(pieces, start)
      if (!piece) return
      const hit = snapAt(start)
      beginDrag(ev, {
        ...base,
        kind: 'draw',
        pieceId: piece.id,
        start: hit?.at ?? start,
        snap: hit,
        draw: {
          kind: tool,
          from: lineAnchorAt(piece, start, hit),
          clickSegment: attrUnder(ev.target, 'data-segment'),
          moved: false,
        },
      })
    }
  }

  const onPointerDown = (ev: PointerEvent<HTMLDivElement>) => {
    const pieceId = pieceUnder(ev.target)
    const piece = render.pieces.find((p) => p.id === pieceId)
    const start = worldAt(ev)
    const handle = grainHandleUnder(ev.target)
    if (ev.button === 0 && handle && grainline && start) {
      ev.preventDefault()
      ev.currentTarget.setPointerCapture(ev.pointerId)
      setDrag({
        kind: handle === 'move' ? 'grainMove' : 'grainRotate',
        pieceId: grainline.pieceId,
        pointerId: ev.pointerId,
        start,
        anchor: start,
        centre: midpoint(grainline.from, grainline.to),
        end: handle === 'start' ? -1 : 1,
        op: null,
        snap: null,
      })
      return
    }
    if (ev.button === 0 && pieceMode && start) {
      const s = useEditorStore.getState()
      const tol = SNAP_TOLERANCE_PX / s.view.scale
      if (tool === 'notch' || tool === 'addPoint') {
        const at = snapAt(start, false)?.at ?? start
        const c = notchCandidate(draft, render, at, 1.5 * tol)
        if (c) {
          ev.preventDefault()
          if (tool === 'notch') pieceActions.addNotch(c.pieceId, c.segmentId, { atRatio: c.ratio })
          else pieceActions.addPoint(c.pieceId, c.segmentId, c.ratio)
          return
        }
      }
      if (tool === 'removePoint') {
        const v = vertexAt(render, start, tol)
        if (v) {
          ev.preventDefault()
          pieceActions.removePoint(v.pieceId, v.ref)
          return
        }
      }
      if (tool === 'text' || tool === 'button') {
        const target = pieceAtPoint(pieces, start)
        const anchor = target && markAnchorAt(target, start)
        if (target && anchor) {
          ev.preventDefault()
          if (tool === 'text') pieceActions.addText(target.id, s.markText.trim() || 'Texto', anchor)
          else pieceActions.addButton(target.id, anchor, s.buttonMm)
          return
        }
      }
    }
    if (
      ev.button === 0 &&
      mode === 'pieces' &&
      (tool === 'move' || tool === 'rotate') &&
      !spaceDown &&
      piece &&
      start
    ) {
      ev.preventDefault()
      ev.currentTarget.setPointerCapture(ev.pointerId)
      selectPiece(piece.id)
      // Grab the nearest vertex when it is close, so it snaps onto the other pieces.
      const tol = SNAP_TOLERANCE_PX / view.scale
      const vertex = piece.vertices.reduce<Vec | null>(
        (best, v) =>
          distance(v, start) <= tol && (!best || distance(v, start) < distance(best, start))
            ? v
            : best,
        null,
      )
      const b = piece.bbox
      setDrag({
        kind: tool,
        pieceId: piece.id,
        pointerId: ev.pointerId,
        start,
        anchor: vertex ?? start,
        centre: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
        op: null,
        snap: null,
      })
      return
    }
    handlers.onPointerDown(ev)
  }

  const onPointerMove = (ev: PointerEvent<HTMLDivElement>) => {
    handlers.onPointerMove(ev)
    rulerTool.onPointerMove(ev)
    if (!drag || ev.pointerId !== drag.pointerId) return
    const p = worldAt(ev)
    if (!p) return
    const s = useEditorStore.getState()
    const piece = pieceById(drag.pieceId)
    if (drag.kind === 'grainMove' || drag.kind === 'grainRotate') {
      if (!piece) return
      const op =
        drag.kind === 'grainMove'
          ? grainMoveOp(piece, { x: p.x - drag.start.x, y: p.y - drag.start.y })
          : grainRotateOp(piece, drag.centre, p, drag.end ?? 1, ev.shiftKey)
      setDrag({ ...drag, op })
      return
    }
    if (drag.kind === 'vertex' && drag.vertex && piece) {
      const target = {
        x: drag.anchor.x + p.x - drag.start.x,
        y: drag.anchor.y + p.y - drag.start.y,
      }
      const hit = snapAt(target)
      // Do not snap the vertex onto its own old position.
      const own = hit && distance(hit.at, drag.anchor) < 1e-6 ? null : hit
      const at = own?.at ?? target
      const deltaMm = toLocalVector(piece.transform, sub(at, drag.anchor))
      setDrag({
        ...drag,
        snap: own,
        op: { type: 'movePoint', pieceId: piece.id, point: drag.vertex, deltaMm },
      })
      return
    }
    if (drag.kind === 'handle' && drag.handle && piece && curve) {
      const hit = snapAt(p)
      const at = hit?.at ?? p
      const c = toLocalVector(
        piece.transform,
        sub(at, drag.handle.which === 'c1' ? curve.p0 : curve.p3),
      )
      setDrag({
        ...drag,
        snap: hit,
        op: {
          type: 'setCurveHandles',
          pieceId: piece.id,
          segmentId: drag.handle.segmentId,
          [drag.handle.which]: c,
        },
      })
      return
    }
    if (drag.kind === 'draw' && drag.draw && piece) {
      const moved = drag.draw.moved || distance(p, drag.start) * s.view.scale > 4
      if (!moved) return
      const hit = snapAt(p)
      const end = hit?.at ?? p
      const to = lineAnchorAt(piece, p, hit)
      let handles: { c1: Vec; c2: Vec } | undefined
      if (drag.draw.kind === 'curve') {
        // A gentle arc: handles at a third of the chord, lifted to one side.
        const d = toLocalVector(piece.transform, sub(end, drag.start))
        const lift = { x: -d.y * 0.2, y: d.x * 0.2 }
        handles = {
          c1: { x: d.x / 3 + lift.x, y: d.y / 3 + lift.y },
          c2: { x: -d.x / 3 + lift.x, y: -d.y / 3 + lift.y },
        }
      }
      setDrag({
        ...drag,
        snap: hit,
        draw: { ...drag.draw, moved: true },
        op:
          distance(end, drag.start) < 1
            ? null
            : {
                type: 'addInternalLine',
                pieceId: piece.id,
                from: drag.draw.from,
                to,
                kind: drag.draw.kind,
                ...(handles && { handles }),
              },
      })
      return
    }
    if (drag.kind === 'move') {
      const target = {
        x: drag.anchor.x + p.x - drag.start.x,
        y: drag.anchor.y + p.y - drag.start.y,
      }
      const hit = s.snapEnabled
        ? snap(snapIndex, target, {
            scale: s.view.scale,
            grid: s.showGrid,
            exclude: excluded,
          })
        : null
      const at = hit?.at ?? target
      const translate = { x: at.x - drag.anchor.x, y: at.y - drag.anchor.y }
      setDrag({
        ...drag,
        snap: hit,
        op: { type: 'transformPiece', pieceId: drag.pieceId, translate },
      })
    } else if (drag.kind === 'rotate') {
      const c = drag.centre
      const a0 = Math.atan2(drag.start.y - c.y, drag.start.x - c.x)
      const a1 = Math.atan2(p.y - c.y, p.x - c.x)
      let deg = wrapDeg(radToDeg(a1 - a0))
      if (ev.shiftKey) deg = wrapDeg(Math.round(deg / 15) * 15)
      setDrag({
        ...drag,
        op: { type: 'transformPiece', pieceId: drag.pieceId, rotateDeg: deg, pivot: 'center' },
      })
    }
  }

  const onPointerUp = (ev: PointerEvent<HTMLDivElement>) => {
    if (rulerTool.onPointerUp(ev)) return
    if (!drag) return handlers.onPointerUp(ev)
    if (ev.currentTarget.hasPointerCapture(ev.pointerId))
      ev.currentTarget.releasePointerCapture(ev.pointerId)
    const op = drag.op
    // One operation per drag, committed on release.
    if (op && effective(op)) useEditorStore.getState().applyOps(op)
    else if (drag.kind === 'draw' && drag.draw && !drag.draw.moved) {
      // A click with Curva/Recta selects the segment under it (Curva then shows its handles).
      if (drag.draw.clickSegment) selectSegment(drag.draw.clickSegment, drag.pieceId)
      else selectPiece(drag.pieceId)
    }
    setDrag(null)
  }

  /** Abort the drag (pointercancel, lost capture, Escape): nothing is committed, the preview goes. */
  const cancelDrag = useCallback((pointerId?: number) => {
    setDrag((d) => {
      if (!d || (pointerId !== undefined && d.pointerId !== pointerId)) return d
      const el = viewportRef.current
      if (el?.hasPointerCapture(d.pointerId)) el.releasePointerCapture(d.pointerId)
      return null
    })
  }, [])

  const dragging = drag !== null
  useEffect(() => {
    if (!dragging && !dartTransfer) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      cancelDrag()
      useEditorStore.getState().setDartTransfer(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dragging, dartTransfer, cancelDrag])

  const onContextMenu = (ev: MouseEvent<HTMLDivElement>) => {
    ev.preventDefault()
    const el = viewportRef.current
    const pieceId = pieceUnder(ev.target)
    if (!el || !pieceId || !render.pieces.some((p) => p.id === pieceId)) return setMenu(null)
    const seg = attrUnder(ev.target, 'data-segment')
    if (seg) selectSegment(seg, pieceId)
    else if (useEditorStore.getState().selectedPieceId !== pieceId) selectPiece(pieceId)
    const at = localPoint(el, ev)
    setMenu({ x: at.x, y: at.y, pieceId })
  }

  const panMode = panning ? 'is-panning' : spaceDown || tool === 'pan' ? 'can-pan' : ''
  const toolClass =
    mode === 'pieces' && (tool === 'move' || tool === 'rotate')
      ? `tool-${tool}`
      : mode === 'pieces' && (CROSSHAIR_TOOLS.includes(tool) || dartTransfer)
        ? 'tool-crosshair'
        : tool === 'measure' && !spaceDown
          ? 'tool-crosshair'
          : rulerTool.cursorClass
  const px = 1 / view.scale
  const empty = mode === 'pieces' && pieces.length === 0

  return (
    <section className="card canvas-card" aria-label="Lienzo">
      <CanvasToolbar />
      <div
        ref={viewportRef}
        className={`viewport ${panMode} ${toolClass} ${drag ? 'is-dragging' : ''} ${vertexHover && tool === 'select' ? 'over-vertex' : ''}`}
        data-testid="canvas-viewport"
        data-view={mode}
        onPointerDownCapture={onPointerDownCapture}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(ev) => cancelDrag(ev.pointerId)}
        onLostPointerCapture={(ev) => cancelDrag(ev.pointerId)}
        onPointerLeave={handlers.onPointerLeave}
        onContextMenu={onContextMenu}
      >
        <svg
          className="canvas-svg"
          data-testid="canvas-svg"
          width={size.width}
          height={size.height}
        >
          {showGrid && size.width > 0 && <Grid view={view} size={size} />}
          <g
            className="world"
            data-testid="world"
            transform={`matrix(${view.scale} 0 0 ${view.scale} ${view.x} ${view.y})`}
          >
            <DraftLayers
              render={render}
              seams={seams}
              block={block}
              sizes={sizes}
              layers={layers}
              selectedPieceId={selectedPieceId}
              selectedSegmentId={selectedSegmentId}
              scale={view.scale}
              selectable={(tool === 'select' || tool === 'curve') && !spaceDown}
              onSelectPiece={selectPiece}
              onSelectSegment={selectSegment}
            />
            {outlineAt && tool === 'notch' && !dartTransfer && (
              <line
                className="notch-preview"
                data-testid="notch-preview"
                x1={outlineAt.at.x - outlineAt.tangent.y * 7 * px}
                y1={outlineAt.at.y + outlineAt.tangent.x * 7 * px}
                x2={outlineAt.at.x + outlineAt.tangent.y * 7 * px}
                y2={outlineAt.at.y - outlineAt.tangent.x * 7 * px}
              />
            )}
            {outlineAt && (tool === 'addPoint' || dartTransfer) && (
              <g className="point-preview" data-testid="point-preview">
                {transferApex && dartTransfer && (
                  <line
                    className="transfer-cut"
                    x1={transferApex.x}
                    y1={transferApex.y}
                    x2={outlineAt.at.x}
                    y2={outlineAt.at.y}
                  />
                )}
                <circle cx={outlineAt.at.x} cy={outlineAt.at.y} r={5 * px} />
              </g>
            )}
            {vertexHover && (
              <circle
                className={tool === 'removePoint' ? 'vertex-preview is-remove' : 'vertex-preview'}
                data-testid="vertex-preview"
                cx={vertexHover.at.x}
                cy={vertexHover.at.y}
                r={7 * px}
              />
            )}
            {curve && (
              <g className="curve-handles" data-testid="curve-handles">
                <line x1={curve.p0.x} y1={curve.p0.y} x2={curve.p1.x} y2={curve.p1.y} />
                <line x1={curve.p3.x} y1={curve.p3.y} x2={curve.p2.x} y2={curve.p2.y} />
                {(['c1', 'c2'] as const).map((k) => {
                  const at = k === 'c1' ? curve.p1 : curve.p2
                  return (
                    <circle
                      key={k}
                      className="curve-handle"
                      data-curve-handle={k}
                      data-testid="curve-handle"
                      cx={at.x}
                      cy={at.y}
                      r={5 * px}
                    >
                      <title>Arrastrar para cambiar la curva</title>
                    </circle>
                  )
                })}
              </g>
            )}
            {grainline && (
              <g className="grain-handles" data-testid="grain-handles">
                <circle
                  className="grain-handle is-move"
                  data-grain-handle="move"
                  data-testid="grain-handle-move"
                  cx={(grainline.from.x + grainline.to.x) / 2}
                  cy={(grainline.from.y + grainline.to.y) / 2}
                  r={6 * px}
                >
                  <title>Mover el hilo</title>
                </circle>
                {(['start', 'end'] as const).map((k) => {
                  const at = k === 'start' ? grainline.from : grainline.to
                  return (
                    <circle
                      key={k}
                      className="grain-handle is-rotate"
                      data-grain-handle={k}
                      data-testid="grain-handle-rotate"
                      cx={at.x}
                      cy={at.y}
                      r={5 * px}
                    >
                      <title>Girar el hilo (Mayús: 0°/45°/90°)</title>
                    </circle>
                  )
                })}
              </g>
            )}
            {measureTool.layer}
            {rulerTool.layer}
          </g>
          <g className="overlay" aria-hidden>
            {hovered.length > 0 && <HoverRing at={hovered[0].at} view={view} />}
            {snapped && <SnapMarker result={snapped} view={view} />}
          </g>
        </svg>
        {hovered.length > 0 && <PointTooltip points={hovered} view={view} />}
        {empty && (
          <div className="pieces-empty" data-testid="pieces-empty">
            <p>Aún no hay piezas separadas. Separa las piezas del trazo para editarlas.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => pieceActions.separateAll()}
            >
              Separar todas
            </button>
          </div>
        )}
        {mode === 'pieces' && !empty && <CanvasHint />}
        {rulerTool.panel}
        {measureTool.chip}
        <LayersPanel />
        <ZoomControl
          onZoomIn={() => zoomCentre(ZOOM_STEP)}
          onZoomOut={() => zoomCentre(1 / ZOOM_STEP)}
          onFit={fit}
          onRealSize={realSize}
        />
        <CursorReadout cursor={snapped?.at ?? cursor} snapped={snapped !== null} />
        {menu && <PieceContextMenu menu={menu} onClose={closeMenu} />}
      </div>
    </section>
  )
}
