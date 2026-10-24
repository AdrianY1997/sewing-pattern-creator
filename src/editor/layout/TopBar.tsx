import {
  ChevronRight,
  CircleUser,
  Download,
  PanelLeft,
  PanelRight,
  Pencil,
  Redo2,
  Save,
  Scissors,
  Shirt,
  Undo2,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useCurrentBlock } from '../store/useDraft'
import { selectSnapshot, useEditorStore } from '../store/editorStore'
import { saveProject } from '../store/projectStorage'
import { COMING_SOON, OUT_OF_V1 } from './controls'

const SEX_LABEL = { female: 'Mujer', male: 'Hombre' } as const

type SaveState = 'idle' | 'saved' | 'error'

export function TopBar() {
  const title = useEditorStore((s) => s.title)
  const setTitle = useEditorStore((s) => s.setTitle)
  const block = useCurrentBlock()
  const titleRef = useRef<HTMLInputElement>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const drawer = useEditorStore((s) => s.drawer)
  const setDrawer = useEditorStore((s) => s.setDrawer)
  const toggleDrawer = (d: 'left' | 'right') => setDrawer(drawer === d ? null : d)

  const save = () => {
    const done = (state: SaveState) => {
      setSaveState(state)
      window.setTimeout(() => setSaveState('idle'), 2000)
    }
    saveProject(selectSnapshot(useEditorStore.getState())).then(
      () => done('saved'),
      () => done('error'),
    )
  }

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn nav-icon-btn drawer-toggle"
        aria-label="Panel de configuración"
        aria-expanded={drawer === 'left'}
        onClick={() => toggleDrawer('left')}
      >
        <PanelLeft size={20} />
      </button>
      <div className="brand">
        <Scissors size={28} strokeWidth={1.75} aria-hidden />
        <div>
          <div className="brand-name">Sewing Pattern Creator</div>
          <div className="brand-tagline">Crea · Ajusta · Cose</div>
        </div>
      </div>

      <div className="doc-title">
        <Shirt size={30} strokeWidth={1.5} aria-hidden className="doc-icon" />
        <div>
          <div className="doc-title-row">
            <input
              ref={titleRef}
              className="title-input"
              aria-label="Título del patrón"
              value={title}
              size={Math.max(8, title.length)}
              onChange={(ev) => setTitle(ev.target.value)}
            />
            <button
              type="button"
              className="icon-btn nav-icon-btn"
              aria-label="Editar título"
              onClick={() => titleRef.current?.select()}
            >
              <Pencil size={14} />
            </button>
          </div>
          <nav className="crumbs" aria-label="Categoría">
            {[SEX_LABEL[block.sex], ...block.category].map((c, i) => (
              <span key={c}>
                {i > 0 && <ChevronRight size={12} aria-hidden />}
                {c}
              </span>
            ))}
          </nav>
        </div>
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className="icon-btn nav-icon-btn"
          aria-label="Deshacer"
          title={COMING_SOON}
          disabled
        >
          <Undo2 size={20} />
        </button>
        <button
          type="button"
          className="icon-btn nav-icon-btn"
          aria-label="Rehacer"
          title={COMING_SOON}
          disabled
        >
          <Redo2 size={20} />
        </button>

        <div className="segmented" role="group" aria-label="Vista">
          <button type="button" aria-pressed="true">
            Vista 2D
          </button>
          <button type="button" aria-pressed="false" disabled title={COMING_SOON}>
            Vista 3D
          </button>
        </div>

        <button type="button" className="btn btn-outline-dark" onClick={save}>
          <Save size={18} />
          {saveState === 'saved' ? 'Guardado' : saveState === 'error' ? 'Error' : 'Guardar'}
        </button>
        <button type="button" className="btn btn-primary" disabled title={COMING_SOON}>
          <Download size={18} />
          Exportar
        </button>
        <span className="avatar is-placeholder" title={OUT_OF_V1} aria-hidden>
          <CircleUser size={30} strokeWidth={1.25} />
        </span>
        <button
          type="button"
          className="icon-btn nav-icon-btn drawer-toggle"
          aria-label="Panel de detalles"
          aria-expanded={drawer === 'right'}
          onClick={() => toggleDrawer('right')}
        >
          <PanelRight size={20} />
        </button>
      </div>
    </header>
  )
}
