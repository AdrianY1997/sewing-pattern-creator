import { useEditorStore, type LeftTab } from '../store/editorStore'
import { DesignTab } from './DesignTab'
import { MeasurementsTab } from './MeasurementsTab'
import { SettingsTab } from './SettingsTab'
import './panels.css'

const TABS: readonly { readonly id: LeftTab; readonly label: string }[] = [
  { id: 'design', label: 'Diseño' },
  { id: 'measurements', label: 'Medidas' },
  { id: 'settings', label: 'Ajustes' },
]

/** Configuration panel with the Diseño / Medidas / Ajustes tabs. */
export function LeftPanel() {
  const tab = useEditorStore((s) => s.leftTab)
  const setTab = useEditorStore((s) => s.setLeftTab)
  const drawer = useEditorStore((s) => s.drawer)
  return (
    <aside
      className="left-panel drawer drawer-left"
      aria-label="Configuración del patrón"
      data-open={drawer === 'left' || undefined}
    >
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        className="tab-body"
        role="tabpanel"
        id={`tabpanel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'design' && <DesignTab />}
        {tab === 'measurements' && <MeasurementsTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </aside>
  )
}
