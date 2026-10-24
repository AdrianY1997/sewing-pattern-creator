import { useEditorStore, type Tool } from '../store/editorStore'

const HINTS: Partial<Record<Tool, string>> = {
  addPoint: 'Añadir punto: clic sobre el contorno de una pieza',
  removePoint: 'Eliminar punto: clic sobre un vértice del contorno',
  curve: 'Curva: arrastra para trazar una línea curva; clic en una curva para editar sus asas',
  line: 'Recta: arrastra dentro de una pieza para trazar una línea',
  text: 'Texto: clic dentro de una pieza para colocarlo',
  button: 'Botón: clic dentro de una pieza para colocarlo',
}

/** Instructions (and settings) of the active edit tool, floating over the canvas (Piezas view). */
export function CanvasHint() {
  const tool = useEditorStore((s) => s.tool)
  const transfer = useEditorStore((s) => s.dartTransfer)
  const markText = useEditorStore((s) => s.markText)
  const setMarkText = useEditorStore((s) => s.setMarkText)
  const buttonMm = useEditorStore((s) => s.buttonMm)
  const setButtonMm = useEditorStore((s) => s.setButtonMm)
  const setTransfer = useEditorStore((s) => s.setDartTransfer)
  if (transfer)
    return (
      <div className="canvas-hint" role="status" data-testid="canvas-hint">
        <span>Trasladar pinza: clic en el borde de destino</span>
        <button type="button" className="btn btn-small" onClick={() => setTransfer(null)}>
          Cancelar
        </button>
      </div>
    )
  const hint = HINTS[tool]
  if (!hint) return null
  return (
    <div className="canvas-hint" role="status" data-testid="canvas-hint">
      <span>{hint}</span>
      {tool === 'text' && (
        <input
          className="text-input"
          type="text"
          value={markText}
          aria-label="Texto a colocar"
          onChange={(ev) => setMarkText(ev.target.value)}
        />
      )}
      {tool === 'button' && (
        <label className="small">
          ⌀{' '}
          <input
            className="mm-input"
            type="number"
            min={1}
            max={100}
            value={buttonMm}
            aria-label="Diámetro del botón (mm)"
            onChange={(ev) => setButtonMm(Number(ev.target.value))}
          />{' '}
          mm
        </label>
      )}
    </div>
  )
}
