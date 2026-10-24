import { MonitorCog } from 'lucide-react'
import { getTable } from '../../data'
import { Switch } from '../layout/controls'
import { useEditorStore } from '../store/editorStore'

/** Ajustes: view preferences of the canvas. */
export function SettingsTab() {
  const showGrid = useEditorStore((s) => s.showGrid)
  const notes = useEditorStore((s) => s.layers.notes)
  const system = useEditorStore((s) => s.system)
  const snapEnabled = useEditorStore((s) => s.snapEnabled)
  const pxPerMm = useEditorStore((s) => s.pxPerMm)
  const calibrated = useEditorStore((s) => s.calibrated)
  const { toggleGrid, setLayer, toggleSnap, setCalibrationOpen } = useEditorStore.getState()

  return (
    <div className="stack">
      <div className="adv-row">
        <Switch label="Mostrar rejilla" checked={showGrid} onChange={toggleGrid} />
        <span>Mostrar rejilla</span>
      </div>
      <div className="adv-row">
        <Switch label="Nombres de puntos" checked={notes} onChange={(v) => setLayer('notes', v)} />
        <span>Nombres de puntos (capa Notas)</span>
      </div>
      <div className="adv-row">
        <Switch label="Ajuste a puntos" checked={snapEnabled} onChange={toggleSnap} />
        <span>Ajuste a puntos (snap)</span>
      </div>
      <button type="button" className="btn btn-soft" onClick={() => setCalibrationOpen(true)}>
        <MonitorCog size={16} aria-hidden />
        Calibrar pantalla
      </button>
      <dl className="settings-info">
        <dt>Unidades</dt>
        <dd>cm (modelo interno en mm)</dd>
        <dt>Tabla de medidas</dt>
        <dd>{getTable(system).name}</dd>
        <dt>Calibración de pantalla</dt>
        <dd data-testid="calibration-info">
          {pxPerMm.toFixed(3)} px/mm{calibrated ? '' : ' (96 ppp, sin calibrar)'}
        </dd>
      </dl>
    </div>
  )
}
