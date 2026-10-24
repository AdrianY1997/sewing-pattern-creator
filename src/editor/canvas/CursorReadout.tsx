import { Grid3x3 } from 'lucide-react'
import { mmToCm, type Vec } from '../../core'
import { useEditorStore } from '../store/editorStore'

const cm = (mm: number | undefined) => (mm === undefined ? '–' : mmToCm(mm).toFixed(1))

/** Bottom-right cursor position in cm and the grid toggle. */
export function CursorReadout({ cursor }: { readonly cursor: Vec | null }) {
  const showGrid = useEditorStore((s) => s.showGrid)
  const toggleGrid = useEditorStore((s) => s.toggleGrid)
  return (
    <div className="float-panel cursor-readout" data-testid="cursor-readout">
      <span>X: {cm(cursor?.x)}</span>
      <span>Y: {cm(cursor?.y)}</span>
      <span className="muted">cm</span>
      <button
        type="button"
        className="icon-btn"
        aria-label="Mostrar rejilla"
        aria-pressed={showGrid}
        onClick={toggleGrid}
      >
        <Grid3x3 size={16} />
      </button>
    </div>
  )
}
