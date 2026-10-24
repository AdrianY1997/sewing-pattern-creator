import { getTable } from '../../data'
import { COMING_SOON, Switch } from '../layout/controls'
import { useEditorStore } from '../store/editorStore'

/** Ajustes: view preferences of the canvas. */
export function SettingsTab() {
  const showGrid = useEditorStore((s) => s.showGrid)
  const notes = useEditorStore((s) => s.layers.notes)
  const system = useEditorStore((s) => s.system)
  const { toggleGrid, setLayer } = useEditorStore.getState()

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
      <div className="adv-row is-placeholder" title={COMING_SOON}>
        <Switch label="Vista a tamaño real" checked={false} disabled />
        <span>Vista a tamaño real (calibración)</span>
      </div>
      <dl className="settings-info">
        <dt>Unidades</dt>
        <dd>cm (modelo interno en mm)</dd>
        <dt>Tabla de medidas</dt>
        <dd>{getTable(system).name}</dd>
      </dl>
    </div>
  )
}
