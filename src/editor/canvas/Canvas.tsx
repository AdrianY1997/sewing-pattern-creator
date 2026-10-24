import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useEditorStore } from '../store/editorStore'
import { cachedDraft, useAllSizeDrafts, useCurrentBlock, useCurrentDraft } from '../store/useDraft'
import { CanvasToolbar } from './CanvasToolbar'
import { CursorReadout } from './CursorReadout'
import { DraftLayers } from './DraftLayers'
import { Grid } from './Grid'
import { LayersPanel } from './LayersPanel'
import { useViewportControls } from './useViewportControls'
import { ZOOM_STEP, fitBBox, type Size, type ViewTransform } from './viewTransform'
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

/** Read-only drawing canvas (SVG, mm world) with pan, zoom, grid, layers and selection. */
export function Canvas() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(viewportRef)
  const block = useCurrentBlock()
  const { render } = useCurrentDraft()
  const view = useEditorStore((s) => s.view)
  const layers = useEditorStore((s) => s.layers)
  const showGrid = useEditorStore((s) => s.showGrid)
  const selectedPieceId = useEditorStore((s) => s.selectedPieceId)
  const tool = useEditorStore((s) => s.tool)
  const selectPiece = useEditorStore((s) => s.selectPiece)
  const sizes = useAllSizeDrafts(layers.sizes)
  const { cursor, panning, spaceDown, handlers } = useViewportControls(viewportRef)

  // Fit the draft once the viewport is measured and when the block changes. While the view is
  // still the fitted one (the user has not zoomed or panned), resizes fit again.
  const fittedView = useRef<ViewTransform | null>(null)
  const fittedBlock = useRef<string | null>(null)
  const fitTo = useCallback((viewport: Size) => {
    const s = useEditorStore.getState()
    const bbox = cachedDraft(s.blockId, s.size, s.blockOptions).render.bbox
    fittedView.current = fitBBox(bbox, viewport, 48)
    s.setView(fittedView.current)
  }, [])

  useLayoutEffect(() => {
    if (size.width <= 0 || size.height <= 0) return
    const untouched = useEditorStore.getState().view === fittedView.current
    if (untouched || fittedBlock.current !== block.id) {
      fittedBlock.current = block.id
      fitTo(size)
    }
  }, [block.id, size, fitTo])

  const fit = () => size.width > 0 && fitTo(size)

  const zoomCentre = (factor: number) =>
    useEditorStore.getState().zoomAt({ x: size.width / 2, y: size.height / 2 }, factor)

  const panMode = panning ? 'is-panning' : spaceDown || tool === 'pan' ? 'can-pan' : ''

  return (
    <section className="card canvas-card" aria-label="Lienzo">
      <CanvasToolbar />
      <div
        ref={viewportRef}
        className={`viewport ${panMode}`}
        data-testid="canvas-viewport"
        {...handlers}
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
              scale={view.scale}
              selectable={tool === 'select' && !spaceDown}
              onSelectPiece={selectPiece}
            />
          </g>
        </svg>
        <LayersPanel />
        <ZoomControl
          onZoomIn={() => zoomCentre(ZOOM_STEP)}
          onZoomOut={() => zoomCentre(1 / ZOOM_STEP)}
          onFit={fit}
        />
        <CursorReadout cursor={cursor} />
      </div>
    </section>
  )
}
