import { Spline, X } from 'lucide-react'
import { segmentLength, stripMeta } from '../../core'
import { pieceMetrics } from '../canvas/draftGeometry'
import { useEditorStore } from '../store/editorStore'
import { useDisplay } from '../store/useDraft'

const cm = (mm: number) => `${(mm / 10).toFixed(1)} cm`
const cm2 = (mm2: number) => `${(mm2 / 100).toFixed(1)} cm²`

/** Small inspector of the current selection: segment length, piece perimeter/area/armhole. */
export function SelectionInspector() {
  const { draft, render } = useDisplay()
  const pieceId = useEditorStore((s) => s.selectedPieceId)
  const segmentId = useEditorStore((s) => s.selectedSegmentId)
  const selectPiece = useEditorStore((s) => s.selectPiece)
  const seg = segmentId ? draft.segments[segmentId] : undefined
  const piece = render.pieces.find((p) => p.id === pieceId)
  if (!seg && !piece) return null
  const metrics = piece ? pieceMetrics(draft, piece.id) : null

  return (
    <section className="inspector" data-testid="inspector" aria-label="Selección">
      <div className="inspector-head">
        <Spline size={16} aria-hidden />
        <h3 className="section-title">Selección</h3>
        <button
          type="button"
          className="icon-btn"
          aria-label="Quitar selección"
          onClick={() => selectPiece(null)}
        >
          <X size={14} />
        </button>
      </div>
      {seg && (
        <dl className="inspector-grid" data-testid="segment-info">
          <dt>Segmento</dt>
          <dd className="mono">{seg.id}</dd>
          <dt>Tipo</dt>
          <dd>
            {seg.kind === 'line' ? 'Recta' : 'Curva'}
            {seg.from && seg.to ? ` (${seg.from} → ${seg.to})` : ''}
          </dd>
          <dt>Longitud</dt>
          <dd data-testid="segment-length">{cm(segmentLength(stripMeta(seg)))}</dd>
        </dl>
      )}
      {piece && metrics && (
        <dl className="inspector-grid" data-testid="piece-info">
          <dt>Pieza</dt>
          <dd>{piece.name}</dd>
          <dt>Perímetro</dt>
          <dd data-testid="piece-perimeter">{cm(metrics.perimeter)}</dd>
          <dt>Área</dt>
          <dd data-testid="piece-area">{cm2(metrics.area)}</dd>
          {metrics.armhole !== null && (
            <>
              <dt>Sisa</dt>
              <dd data-testid="piece-armhole">{cm(metrics.armhole)}</dd>
            </>
          )}
        </dl>
      )}
    </section>
  )
}
