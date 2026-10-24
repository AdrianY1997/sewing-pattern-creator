import {
  ChevronDown,
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
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ExportDialog } from '../export/ExportDialog'
import { useCurrentBlock } from '../store/useDraft'
import { useEditorStore } from '../store/editorStore'
import { openProject, saveNow, useSaveStatus } from '../store/projectManager'
import { downloadProjectJson, importProjectFromFile } from '../panels/ProjectsDialog'
import '../panels/projects.css'
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
  const canUndo = useEditorStore((s) => s.undoStack.length > 0)
  const canRedo = useEditorStore((s) => s.redoStack.length > 0)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const [exportOpen, setExportOpen] = useState(false)
  const closeExport = useCallback(() => setExportOpen(false), [])
  const status = useSaveStatus((s) => s.status)
  const projectId = useEditorStore((s) => s.projectId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuNotice, setMenuNotice] = useState<{ text: string; error: boolean } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (ev: PointerEvent) => {
      if (!(ev.target instanceof Element) || !ev.target.closest('.save-menu-wrap'))
        setMenuOpen(false)
    }
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const save = () => {
    const done = (state: SaveState) => {
      setSaveState(state)
      window.setTimeout(() => setSaveState('idle'), 2000)
    }
    saveNow().then(
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
          title="Deshacer (Ctrl+Z)"
          disabled={!canUndo}
          onClick={undo}
        >
          <Undo2 size={20} />
        </button>
        <button
          type="button"
          className="icon-btn nav-icon-btn"
          aria-label="Rehacer"
          title="Rehacer (Ctrl+Mayús+Z / Ctrl+Y)"
          disabled={!canRedo}
          onClick={redo}
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

        <span
          className={status === 'error' ? 'save-status is-error' : 'save-status'}
          role="status"
          data-testid="save-status"
          data-status={status}
        >
          {status === 'pending' || status === 'saving'
            ? 'Guardando…'
            : status === 'saved'
              ? 'Guardado'
              : status === 'error'
                ? 'Sin guardar'
                : ''}
        </span>
        <div className="save-menu-wrap">
          <button type="button" className="btn btn-outline-dark" onClick={save}>
            <Save size={18} />
            {saveState === 'saved' ? 'Guardado' : saveState === 'error' ? 'Error' : 'Guardar'}
          </button>
          <button
            type="button"
            className="icon-btn nav-icon-btn"
            aria-label="Más opciones de guardado"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <ChevronDown size={16} />
          </button>
          {menuOpen && (
            <div className="save-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                disabled={!projectId}
                onClick={() => {
                  setMenuOpen(false)
                  if (projectId) void downloadProjectJson(projectId)
                }}
              >
                <Download size={14} aria-hidden /> Exportar proyecto (.json)
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuNotice(null)
                  importRef.current?.click()
                }}
              >
                <Upload size={14} aria-hidden /> Importar proyecto
              </button>
              {menuNotice && (
                <p
                  className={
                    menuNotice.error
                      ? 'save-menu-notice project-notice is-error'
                      : 'save-menu-notice project-notice'
                  }
                  role="status"
                >
                  {menuNotice.text}
                </p>
              )}
            </div>
          )}
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="topbar-import-input"
            onChange={(ev) => {
              const file = ev.target.files?.[0]
              ev.target.value = ''
              if (!file) return
              void importProjectFromFile(file).then(async (r) => {
                setMenuOpen(true)
                if (r.id) await openProject(r.id)
                setMenuNotice({ text: r.message, error: r.id === null })
              })
            }}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          aria-haspopup="dialog"
          onClick={() => setExportOpen(true)}
        >
          <Download size={18} />
          Exportar
        </button>
        {exportOpen && <ExportDialog onClose={closeExport} />}
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
