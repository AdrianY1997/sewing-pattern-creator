import { Maximize, Minus, Plus, Ruler, ZoomIn } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { isRealSize, zoomPercent } from './viewTransform'

export interface ZoomControlProps {
  readonly onZoomIn: () => void
  readonly onZoomOut: () => void
  readonly onFit: () => void
  readonly onRealSize: () => void
}

/**
 * Bottom-left zoom control: −, zoom (percentage of real size with the screen calibration, "1:1"
 * when exact), +, fit to screen and real size.
 */
export function ZoomControl({ onZoomIn, onZoomOut, onFit, onRealSize }: ZoomControlProps) {
  const label = useEditorStore((s) =>
    isRealSize(s.view, s.pxPerMm) ? '1:1' : `${zoomPercent(s.view, s.pxPerMm)}%`,
  )
  return (
    <div className="float-panel zoom-control" role="group" aria-label="Zoom">
      <ZoomIn size={16} className="muted" aria-hidden />
      <button type="button" className="icon-btn" aria-label="Alejar" onClick={onZoomOut}>
        <Minus size={16} />
      </button>
      <output className="zoom-percent" data-testid="zoom-percent" aria-live="polite">
        {label}
      </output>
      <button type="button" className="icon-btn" aria-label="Acercar" onClick={onZoomIn}>
        <Plus size={16} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Ajustar a pantalla"
        title="Ajustar a pantalla"
        onClick={onFit}
      >
        <Maximize size={16} />
      </button>
      <button
        type="button"
        className="btn-chip"
        aria-label="Tamaño real"
        title="Tamaño real (1:1, centrado en la selección)"
        onClick={onRealSize}
      >
        <Ruler size={14} aria-hidden />
        Tamaño real
      </button>
    </div>
  )
}
