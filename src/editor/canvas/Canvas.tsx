import {
  useCallback,
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
  radToDeg,
  segmentBBox,
  stripMeta,
  type BBox,
  type Operation,
  type OperationInput,
  type Vec,
} from '../../core'
import { useEditorStore } from '../store/editorStore'
import {
  buildPatternData,
  cachedDraft,
  cachedPattern,
  replayOptionsFor,
  useCurrentBlock,
  useCurrentPattern,
  useDisplay,
  useSizeOutlines,
  type DisplayData,
} from '../store/useDraft'
import { CanvasToolbar } from './CanvasToolbar'
import { HoverRing, PointTooltip, SnapMarker } from './CanvasOverlay'
import { CursorReadout } from './CursorReadout'
import { DraftLayers } from './DraftLayers'
import { Grid } from './Grid'
import { LayersPanel } from './LayersPanel'
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
    const p = cachedPattern(s.blockId, s.size, s.blockOptions, s.operations)
    if (p.result.pattern.pieces.length > 0) return p.render.bbox
  }
  return cachedDraft(s.blockId, s.size, s.blockOptions).render.bbox
}

/** A piece being dragged with the Mover or Rotar tool (Piezas view). */
interface Drag {
  readonly kind: 'move' | 'rotate'
  readonly pieceId: string
  readonly pointerId: number
  /** World position where the drag started. */
  readonly start: Vec
  /** Point of the piece that follows the cursor and snaps (Mover). */
  readonly anchor: Vec
  /** Rotation centre: the bbox centre of the piece (Rotar). */
  readonly centre: Vec
  /** Operation the drag would commit now (previewed; committed once on pointer up). */
  readonly op: OperationInput | null
  readonly snap: SnapResult | null
}

const localPoint = (el: HTMLElement, ev: { clientX: number; clientY: number }): Vec => {
  const r = el.getBoundingClientRect()
  return { x: ev.clientX - r.left, y: ev.clientY - r.top }
}

const pieceUnder = (target: EventTarget | null): string | null =>
  target instanceof Element
    ? (target.closest('[data-piece]')?.getAttribute('data-piece') ?? null)
    : null

/** Signed angle in degrees normalised to (−180, 180]. */
const wrapDeg = (d: number) => {
  const r = ((((d + 180) % 360) + 360) % 360) - 180
  return r === -180 ? 180 : r
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
    const data = buildPatternData(
      applyOperations(pattern.result.pattern, [op], replayOptionsFor(block)),
    )
    return { mode, draft: data.world, render: data.render }
  }, [pendingOp, mode, display, pattern, block])
  const { draft, render } = shown

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

  // Snap targets: named points plus the segments of the visible layers (without the piece being
  // moved, so it snaps to the others).
  const excluded = drag?.kind === 'move' ? drag.pieceId : null
  const snapIndex = useMemo(() => {
    const r = display.render
    const prefix = excluded ? `${excluded}/` : null
    return buildSnapIndex(
      prefix ? r.points.filter((p) => !p.name.startsWith(prefix)) : r.points,
      r.segments
        .filter((sg) => layers[sg.layer] && (excluded === null || sg.pieceId !== excluded))
        .map((sg) => stripMeta(display.draft.segments[sg.id])),
    )
  }, [display, layers, excluded])

  const tracking = cursor !== null && !panning
  const snapped = drag
    ? drag.snap
    : tracking && snapEnabled
      ? snap(snapIndex, cursor, { scale: view.scale, grid: showGrid })
      : null
  const hovered =
    tracking && !drag && tool === 'select' && !spaceDown
      ? pointsAt(render.points, cursor, view.scale)
      : []

  const zoomCentre = (factor: number) =>
    useEditorStore.getState().zoomAt({ x: size.width / 2, y: size.height / 2 }, factor)

  // ---------- piece dragging (Mover / Rotar in the Piezas view) ----------
  const worldAt = (ev: { clientX: number; clientY: number }): Vec | null => {
    const el = viewportRef.current
    return el ? screenToWorld(useEditorStore.getState().view, localPoint(el, ev)) : null
  }

  const onPointerDown = (ev: PointerEvent<HTMLDivElement>) => {
    const pieceId = pieceUnder(ev.target)
    const piece = render.pieces.find((p) => p.id === pieceId)
    const start = worldAt(ev)
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
    if (!drag || ev.pointerId !== drag.pointerId) return
    const p = worldAt(ev)
    if (!p) return
    if (drag.kind === 'move') {
      const target = {
        x: drag.anchor.x + p.x - drag.start.x,
        y: drag.anchor.y + p.y - drag.start.y,
      }
      const s = useEditorStore.getState()
      const hit = s.snapEnabled
        ? snap(snapIndex, target, { scale: s.view.scale, grid: s.showGrid })
        : null
      const at = hit?.at ?? target
      const translate = { x: at.x - drag.anchor.x, y: at.y - drag.anchor.y }
      setDrag({
        ...drag,
        snap: hit,
        op: { type: 'transformPiece', pieceId: drag.pieceId, translate },
      })
    } else {
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
    if (!drag) return handlers.onPointerUp(ev)
    if (ev.currentTarget.hasPointerCapture(ev.pointerId))
      ev.currentTarget.releasePointerCapture(ev.pointerId)
    const op = drag.op
    const moved =
      op?.type === 'transformPiece' &&
      ((op.translate && Math.hypot(op.translate.x, op.translate.y) > 1e-6) ||
        (op.rotateDeg !== undefined && Math.abs(op.rotateDeg) > 1e-6))
    // One operation per drag, committed on release.
    if (op && moved) useEditorStore.getState().applyOps(op)
    setDrag(null)
  }

  const onContextMenu = (ev: MouseEvent<HTMLDivElement>) => {
    ev.preventDefault()
    const el = viewportRef.current
    const pieceId = pieceUnder(ev.target)
    if (!el || !pieceId || !render.pieces.some((p) => p.id === pieceId)) return setMenu(null)
    const seg =
      ev.target instanceof Element
        ? ev.target.closest('[data-segment]')?.getAttribute('data-segment')
        : null
    if (seg) selectSegment(seg, pieceId)
    else if (useEditorStore.getState().selectedPieceId !== pieceId) selectPiece(pieceId)
    const at = localPoint(el, ev)
    setMenu({ x: at.x, y: at.y, pieceId })
  }

  const panMode = panning ? 'is-panning' : spaceDown || tool === 'pan' ? 'can-pan' : ''
  const toolClass =
    mode === 'pieces' && (tool === 'move' || tool === 'rotate') ? `tool-${tool}` : ''
  const empty = mode === 'pieces' && pattern.result.pattern.pieces.length === 0

  return (
    <section className="card canvas-card" aria-label="Lienzo">
      <CanvasToolbar />
      <div
        ref={viewportRef}
        className={`viewport ${panMode} ${toolClass} ${drag ? 'is-dragging' : ''}`}
        data-testid="canvas-viewport"
        data-view={mode}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
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
              block={block}
              sizes={sizes}
              layers={layers}
              selectedPieceId={selectedPieceId}
              selectedSegmentId={selectedSegmentId}
              scale={view.scale}
              selectable={tool === 'select' && !spaceDown}
              onSelectPiece={selectPiece}
              onSelectSegment={selectSegment}
            />
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
