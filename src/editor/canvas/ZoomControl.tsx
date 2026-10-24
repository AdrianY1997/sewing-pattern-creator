import { Maximize, Minus, Plus, ZoomIn } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { zoomPercent } from './viewTransform'

export interface ZoomControlProps {
  readonly onZoomIn: () => void
  readonly onZoomOut: () => void
  readonly onFit: () => void
}

/** Bottom-left zoom control: −, percentage of real size, +, fit to screen. */
export function ZoomControl({ onZoomIn, onZoomOut, onFit }: ZoomControlProps) {
  const percent = useEditorStore((s) => zoomPercent(s.view))
  return (
    <div className="float-panel zoom-control" role="group" aria-label="Zoom">
      <ZoomIn size={16} className="muted" aria-hidden />
      <button type="button" className="icon-btn" aria-label="Alejar" onClick={onZoomOut}>
        <Minus size={16} />
      </button>
      <output className="zoom-percent" data-testid="zoom-percent" aria-live="polite">
        {percent}%
      </output>
      <button type="button" className="icon-btn" aria-label="Acercar" onClick={onZoomIn}>
        <Plus size={16} />
      </button>
      <button type="button" className="icon-btn" aria-label="Ajustar a pantalla" onClick={onFit}>
        <Maximize size={16} />
      </button>
    </div>
  )
}
