import { CreditCard, Ruler, X } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  CARD_MM,
  RULER_LINE_MM,
  cardSizePx,
  isValidPxPerMm,
  pxPerMmFromCard,
  pxPerMmFromRuler,
} from '../canvas/calibration'
import { useEditorStore } from '../store/editorStore'

type Mode = 'card' | 'ruler'

const MIN_CARD_PX = 120
const MAX_CARD_PX = 1000

const clampCard = (w: number) => Math.min(MAX_CARD_PX, Math.max(MIN_CARD_PX, w))
const dpi = (pxPerMm: number) => Math.round(pxPerMm * 25.4)

/** Card mode: a resizable on-screen rectangle the user matches to a real ID/credit card. */
function CardCalibration({ width, onWidth }: { width: number; onWidth: (w: number) => void }) {
  const drag = useRef<{ x: number; w: number } | null>(null)
  const height = (width * CARD_MM.height) / CARD_MM.width
  const onDown = (ev: PointerEvent<HTMLDivElement>) => {
    ev.currentTarget.setPointerCapture(ev.pointerId)
    drag.current = { x: ev.clientX, w: width }
  }
  const onMove = (ev: PointerEvent<HTMLDivElement>) => {
    if (drag.current) onWidth(clampCard(drag.current.w + ev.clientX - drag.current.x))
  }
  const onUp = () => {
    drag.current = null
  }
  return (
    <>
      <p className="muted small">
        Apoya una tarjeta (DNI, cédula o tarjeta bancaria, {CARD_MM.width} × {CARD_MM.height} mm)
        sobre la pantalla y ajusta el rectángulo hasta que coincida con sus bordes.
      </p>
      <div className="calib-stage">
        <div
          className="calib-card"
          data-testid="calib-card"
          style={{ width, height }}
          aria-label={`Rectángulo de ${Math.round(width)} × ${Math.round(height)} px`}
        >
          <CreditCard size={28} aria-hidden />
          <div
            className="calib-handle"
            role="presentation"
            title="Arrastra para redimensionar"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        </div>
      </div>
      <div className="calib-controls">
        <button
          type="button"
          className="icon-btn"
          aria-label="Reducir"
          onClick={() => onWidth(clampCard(width - 1))}
        >
          −
        </button>
        <input
          type="range"
          aria-label="Ancho del rectángulo (px)"
          min={MIN_CARD_PX}
          max={MAX_CARD_PX}
          step={0.5}
          value={width}
          onChange={(ev) => onWidth(clampCard(Number(ev.target.value)))}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label="Ampliar"
          onClick={() => onWidth(clampCard(width + 1))}
        >
          +
        </button>
      </div>
    </>
  )
}

/** Ruler mode: a 10 cm line drawn with the current factor, measured with a physical ruler. */
function RulerCalibration({
  pxPerMm,
  measured,
  onMeasured,
}: {
  pxPerMm: number
  measured: string
  onMeasured: (v: string) => void
}) {
  const len = RULER_LINE_MM * pxPerMm
  const ticks = Array.from({ length: RULER_LINE_MM / 10 + 1 }, (_, i) => i * 10 * pxPerMm)
  return (
    <>
      <p className="muted small">
        Mide con una regla física la línea de abajo (debería medir {RULER_LINE_MM / 10} cm) y
        escribe lo que mide en tu pantalla.
      </p>
      <div className="calib-stage calib-ruler-stage">
        <svg width={len + 2} height={28} data-testid="calib-ruler" aria-hidden>
          <path
            d={
              `M1 14H${len + 1}` +
              ticks
                .map((x) => `M${x + 1} ${x === 0 || x === ticks[ticks.length - 1] ? 2 : 8}V20`)
                .join('')
            }
          />
        </svg>
      </div>
      <label className="calib-measure">
        <span>Medida con la regla (mm)</span>
        <input
          type="number"
          inputMode="decimal"
          min={10}
          max={1000}
          step={0.5}
          value={measured}
          onChange={(ev) => onMeasured(ev.target.value)}
        />
      </label>
    </>
  )
}

/** Configuración → Calibrar pantalla (SPEC §6): stores the px/mm used by the 1:1 view. */
export function CalibrationDialog() {
  const pxPerMm = useEditorStore((s) => s.pxPerMm)
  const calibrated = useEditorStore((s) => s.calibrated)
  const { setPxPerMm, setCalibrationOpen } = useEditorStore.getState()
  const [mode, setMode] = useState<Mode>('card')
  const [cardWidth, setCardWidth] = useState(() => clampCard(cardSizePx(pxPerMm).width))
  const [measured, setMeasured] = useState(String(RULER_LINE_MM))
  const dialogRef = useRef<HTMLDivElement>(null)

  const close = () => setCalibrationOpen(false)
  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && setCalibrationOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCalibrationOpen])

  const measuredMm = Number(measured)
  const result =
    mode === 'card'
      ? pxPerMmFromCard(cardWidth)
      : measuredMm > 0
        ? pxPerMmFromRuler(pxPerMm, measuredMm)
        : NaN
  const valid = isValidPxPerMm(result)

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(ev) => ev.target === ev.currentTarget && close()}
    >
      <div
        ref={dialogRef}
        className="modal calib-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calib-title"
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id="calib-title">Calibrar pantalla</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
            <X size={16} />
          </button>
        </header>

        <div className="segmented-light" role="tablist" aria-label="Método">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'card'}
            onClick={() => setMode('card')}
          >
            <CreditCard size={16} aria-hidden /> Tarjeta
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'ruler'}
            onClick={() => setMode('ruler')}
          >
            <Ruler size={16} aria-hidden /> Regla
          </button>
        </div>

        {mode === 'card' ? (
          <CardCalibration width={cardWidth} onWidth={setCardWidth} />
        ) : (
          <RulerCalibration pxPerMm={pxPerMm} measured={measured} onMeasured={setMeasured} />
        )}

        <p className="calib-result" data-testid="calib-result">
          {valid ? `${result.toFixed(3)} px/mm (≈ ${dpi(result)} ppp)` : 'Valor fuera de rango'}
          <span className="muted">
            {' '}
            · actual {pxPerMm.toFixed(3)} px/mm{calibrated ? '' : ' (96 ppp, sin calibrar)'}
          </span>
        </p>

        <footer className="modal-actions">
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              setPxPerMm(null)
              close()
            }}
          >
            Restablecer (96 ppp)
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-soft" onClick={close}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => {
              setPxPerMm(result)
              close()
            }}
          >
            Guardar calibración
          </button>
        </footer>
      </div>
    </div>
  )
}
