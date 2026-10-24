import { FlipHorizontal2, Magnet, Spline, WandSparkles } from 'lucide-react'
import {
  RULER_IDS,
  TRACE_DEVIATION_WARN_MM,
  flipPose,
  getRuler,
  type Ruler,
  type RulerId,
  type RulerPose,
  type RulerTrace,
} from '../../core'
import { useRulerStore, type RulerMode } from './rulerStore'

const cm = (mm: number) => (mm / 10).toFixed(1)

export interface RulerPanelProps {
  readonly ruler: Ruler
  readonly pose: RulerPose
  readonly mode: RulerMode
  readonly pointCount: number
  readonly trace: RulerTrace | null
  readonly message: string | null
  /** Result of "Ajuste automático" (see RulerState.autoFit). */
  readonly autoFit: { readonly deviation: number | null } | null
  readonly onApply: () => void
  readonly onAutoAlign: () => void
}

const HINT: Record<RulerMode, (n: number) => string> = {
  place: () => 'Arrastra la regla; asa: girar (Mayús 15°); Alt + arrastrar o rueda: deslizar',
  align: () => 'Alinear: clic en un punto, la regla pasa por él',
  trace: (n) => (n === 0 ? 'Trazar: clic en el primer punto' : 'Trazar: clic en el segundo punto'),
}

/** Floating bar of the Reglas tool: ruler choice, flip / align / trace and the trace readout. */
export function RulerPanel({
  ruler,
  pose,
  mode,
  pointCount,
  trace,
  message,
  autoFit,
  onApply,
  onAutoAlign,
}: RulerPanelProps) {
  const setRuler = useRulerStore((s) => s.setRuler)
  const setMode = useRulerStore((s) => s.setMode)
  const setPose = useRulerStore((s) => s.setPose)
  const clearTrace = useRulerStore((s) => s.clearTrace)
  const toggle = (m: RulerMode) => setMode(mode === m ? 'place' : m)
  return (
    <div
      className="canvas-hint ruler-panel"
      role="status"
      data-testid="ruler-panel"
      title={HINT.place(0)}
    >
      <select
        className="ruler-select"
        aria-label="Regla"
        value={ruler.id}
        onChange={(ev) => setRuler(ev.target.value as RulerId)}
      >
        {RULER_IDS.map((id) => (
          <option key={id} value={id}>
            {getRuler(id).name}
          </option>
        ))}
      </select>
      <span className="ruler-angle" data-testid="ruler-angle">
        {pose.angleDeg.toFixed(1)}°
      </span>
      <button
        type="button"
        className="btn btn-small"
        title="Voltear la regla (espejo)"
        onClick={() => setPose(ruler.id, flipPose(ruler, pose))}
      >
        <FlipHorizontal2 size={14} aria-hidden /> Voltear
      </button>
      <button
        type="button"
        className="btn btn-small"
        aria-pressed={mode === 'align'}
        title="Alinear: clic en un punto y el borde más cercano de la regla pasa por él"
        onClick={() => toggle('align')}
      >
        <Magnet size={14} aria-hidden /> Alinear
      </button>
      <button
        type="button"
        className="btn btn-small"
        aria-pressed={mode === 'trace'}
        title="Trazar: clic en dos puntos y trazar la curva de la regla entre ellos"
        onClick={() => toggle('trace')}
      >
        <Spline size={14} aria-hidden /> Trazar
      </button>
      {mode === 'trace' && pointCount === 2 && (
        <button
          type="button"
          className="btn btn-small"
          data-testid="ruler-auto-align"
          title="Ajuste automático: coloca la regla (posición, giro, volteo) donde sigue mejor la curva actual entre los dos puntos"
          onClick={onAutoAlign}
        >
          <WandSparkles size={14} aria-hidden /> Ajuste automático
        </button>
      )}
      {autoFit && (
        <span className="ruler-fit-info" data-testid="ruler-fit-info">
          {autoFit.deviation === null
            ? 'Ajuste: la regla pasa por los dos puntos'
            : 'Ajuste: ' + autoFit.deviation.toFixed(1) + ' mm máx. de la curva actual'}
        </span>
      )}
      {trace ? (
        <span
          className={trace.warn ? 'ruler-trace-info is-warn' : 'ruler-trace-info'}
          data-testid="ruler-trace-info"
        >
          {cm(trace.lengthMm)} cm · desviación {trace.deviation.toFixed(1)} mm
          {trace.warn && ` (> ${TRACE_DEVIATION_WARN_MM} mm: acerca la regla o usa Alinear)`}
          <button
            type="button"
            className={trace.warn ? 'btn btn-small' : 'btn btn-small btn-primary'}
            onClick={onApply}
          >
            {trace.warn ? 'Aplicar igualmente' : 'Aplicar'}
          </button>
          <button type="button" className="btn btn-small" onClick={clearTrace}>
            Cancelar
          </button>
        </span>
      ) : mode !== 'place' || pointCount === 2 ? (
        <span className="ruler-hint">
          {pointCount === 2 ? 'Los puntos no caen sobre la regla' : HINT[mode](pointCount)}
        </span>
      ) : null}
      {message && (
        <span className="ruler-message" role="alert">
          {message}
        </span>
      )}
    </div>
  )
}
