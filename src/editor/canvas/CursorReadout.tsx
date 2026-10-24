import { Grid3x3, Magnet } from 'lucide-react'
import { mmToCm, type Vec } from '../../core'
import { useEditorStore } from '../store/editorStore'

const cm = (mm: number | undefined) => (mm === undefined ? '–' : mmToCm(mm).toFixed(1))

export interface CursorReadoutProps {
  /** Cursor position (mm), already snapped when `snapped`. */
  readonly cursor: Vec | null
  readonly snapped?: boolean
}

/** Bottom-right cursor position in cm, the snap toggle and the grid toggle. */
export function CursorReadout({ cursor, snapped = false }: CursorReadoutProps) {
  const showGrid = useEditorStore((s) => s.showGrid)
  const toggleGrid = useEditorStore((s) => s.toggleGrid)
  const snapEnabled = useEditorStore((s) => s.snapEnabled)
  const toggleSnap = useEditorStore((s) => s.toggleSnap)
  return (
    <div
      className="float-panel cursor-readout"
      data-testid="cursor-readout"
      data-snapped={snapped || undefined}
    >
      <span>X: {cm(cursor?.x)}</span>
      <span>Y: {cm(cursor?.y)}</span>
      <span className="muted">cm</span>
      <button
        type="button"
        className="icon-btn"
        aria-label="Ajuste a puntos (snap)"
        title="Ajuste a puntos (snap)"
        aria-pressed={snapEnabled}
        onClick={toggleSnap}
      >
        <Magnet size={16} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Mostrar rejilla"
        title="Mostrar rejilla"
        aria-pressed={showGrid}
        onClick={toggleGrid}
      >
        <Grid3x3 size={16} />
      </button>
    </div>
  )
}
