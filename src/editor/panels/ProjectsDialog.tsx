/** Mis patrones / Proyectos: grid of the stored projects with Abrir, Duplicar, Renombrar, Eliminar. */
import { Copy, Download, FolderOpen, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getBlock } from '../../blocks'
import { downloadFile } from '../export/exportSource'
import { useEditorStore } from '../store/editorStore'
import { duplicateProject, listProjects, renameProject } from '../store/projectDb'
import {
  exportProjectFile,
  flushProjects,
  importProjectFile,
  newProject,
  openProject,
  removeProject,
} from '../store/projectManager'
import { ProjectImportError, type ProjectSummary } from '../store/projects'
import './projects.css'

/** Export a project as a `.json` download. */
export const downloadProjectJson = async (id: string): Promise<void> => {
  const file = await exportProjectFile(id)
  if (file) downloadFile(file.text, file.name, 'application/json')
}

/**
 * Import the chosen `.json` as a new project. Resolves with a user message (Spanish) and the new
 * id; the message is an error text when `id` is null.
 */
export const importProjectFromFile = async (
  file: File,
): Promise<{ id: string | null; message: string }> => {
  try {
    const { project, droppedOps } = await importProjectFile(await file.text())
    const dropped =
      droppedOps > 0 ? ` Se descartaron ${droppedOps} operaciones no válidas del archivo.` : ''
    return { id: project.id, message: `Proyecto «${project.title}» importado.${dropped}` }
  } catch (e) {
    const message = e instanceof ProjectImportError ? e.message : 'No se pudo importar el proyecto.'
    return { id: null, message }
  }
}

const blockLabel = (id: string): string => {
  try {
    return getBlock(id).label
  } catch {
    return id
  }
}

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })

const thumbSrc = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

interface CardProps {
  readonly p: ProjectSummary
  readonly current: boolean
  readonly onOpen: () => void
  readonly onChanged: () => void
}

function ProjectCard({ p, current, onOpen, onChanged }: CardProps) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(p.title)
  const [confirming, setConfirming] = useState(false)

  const commitRename = async () => {
    setRenaming(false)
    const title = name.trim()
    if (title && title !== p.title) {
      if (current) useEditorStore.getState().setTitle(title)
      await renameProject(p.id, title)
      await flushProjects()
      onChanged()
    }
  }

  return (
    <li className={current ? 'project-card is-current' : 'project-card'} data-testid="project-card">
      <div className="project-thumb">
        {p.thumbnailSvg ? (
          <img src={thumbSrc(p.thumbnailSvg)} alt="" />
        ) : (
          <span>Sin vista previa</span>
        )}
      </div>
      <div className="project-info">
        {renaming ? (
          <input
            className="project-rename"
            aria-label="Nuevo título"
            autoFocus
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') void commitRename()
              if (ev.key === 'Escape') {
                ev.stopPropagation()
                setName(p.title)
                setRenaming(false)
              }
            }}
          />
        ) : (
          <h3 className="project-title" title={p.title}>
            {p.title}
          </h3>
        )}
        <div className="project-meta">
          {blockLabel(p.blockId)} · talla {p.size}
        </div>
        <div className="project-meta">
          {current ? 'Abierto · ' : ''}Editado {formatDate(p.updatedAt)}
        </div>
      </div>
      {confirming ? (
        <div className="project-actions" role="group" aria-label="Confirmar eliminación">
          <span className="project-confirm">¿Eliminar «{p.title}»?</span>
          <button
            type="button"
            className="btn btn-soft btn-danger"
            onClick={() => void removeProject(p.id).then(onChanged)}
          >
            Sí, eliminar
          </button>
          <button type="button" className="btn btn-soft" onClick={() => setConfirming(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="project-actions">
          <button type="button" className="btn btn-soft" onClick={onOpen} disabled={current}>
            <FolderOpen size={14} aria-hidden /> Abrir
          </button>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => void duplicateProject(p.id).then(onChanged)}
          >
            <Copy size={14} aria-hidden /> Duplicar
          </button>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              setName(p.title)
              setRenaming(true)
            }}
          >
            <Pencil size={14} aria-hidden /> Renombrar
          </button>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => void downloadProjectJson(p.id)}
          >
            <Download size={14} aria-hidden /> Exportar
          </button>
          <button type="button" className="btn btn-soft" onClick={() => setConfirming(true)}>
            <Trash2 size={14} aria-hidden /> Eliminar
          </button>
        </div>
      )}
    </li>
  )
}

export function ProjectsDialog() {
  const currentId = useEditorStore((s) => s.projectId)
  const setOpen = useEditorStore((s) => s.setProjectsOpen)
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => {
    listProjects().then(setProjects, () => setProjects([]))
  }, [])
  const close = useCallback(() => setOpen(false), [setOpen])

  useEffect(() => {
    // Save pending edits first so that the list shows the open project as it is.
    flushProjects().then(refresh, refresh)
    dialogRef.current?.focus()
  }, [refresh])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return createPortal(
    <div
      className="modal-backdrop"
      onPointerDown={(ev) => ev.target === ev.currentTarget && close()}
    >
      <div
        ref={dialogRef}
        className="modal projects-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="projects-title"
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id="projects-title">Mis patrones</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
            <X size={16} />
          </button>
        </header>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              void newProject().then(() => {
                close()
              })
            }
          >
            <Plus size={16} aria-hidden /> Nuevo
          </button>
          <button type="button" className="btn btn-soft" onClick={() => fileRef.current?.click()}>
            <Upload size={14} aria-hidden /> Importar proyecto
          </button>
          <button
            type="button"
            className="btn btn-soft"
            disabled={!currentId}
            onClick={() => currentId && void downloadProjectJson(currentId)}
          >
            <Download size={14} aria-hidden /> Exportar proyecto (.json)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="import-project-input"
            onChange={(ev) => {
              const file = ev.target.files?.[0]
              ev.target.value = ''
              if (!file) return
              void importProjectFromFile(file).then((r) => {
                setNotice({ text: r.message, error: r.id === null })
                refresh()
              })
            }}
          />
        </div>

        {notice && (
          <p className={notice.error ? 'project-notice is-error' : 'project-notice'} role="status">
            {notice.text}
          </p>
        )}

        {projects === null ? null : projects.length === 0 ? (
          <p className="project-empty">Aún no hay proyectos guardados.</p>
        ) : (
          <ul className="project-grid" aria-label="Proyectos">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                p={p}
                current={p.id === currentId}
                onOpen={() =>
                  void openProject(p.id).then((ok) => {
                    if (ok) close()
                    else {
                      setNotice({ text: 'No se pudo abrir el proyecto.', error: true })
                      refresh()
                    }
                  })
                }
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  )
}
