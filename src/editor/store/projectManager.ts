/**
 * Glue between the editor store and the stored projects: opening on start, autosave, switching,
 * creating, importing and exporting (SPEC §10).
 */
import { create } from 'zustand'
import { createAutosaver, type Autosaver, type SaveStatus } from './autosave'
import {
  createProject,
  deleteProject,
  getLastProjectId,
  getProject,
  isDeletedProject,
  listProjects,
  migrateLegacySave,
  putProject,
  setLastProjectId,
} from './projectDb'
import {
  SCHEMA_VERSION,
  newProjectId,
  parseProjectFile,
  serializeProject,
  type ProjectRecord,
} from './projects'
import { dismissNotice, pushNotice } from './notices'
import { selectSnapshot, useEditorStore, type ProjectSnapshot } from './editorStore'

export const useSaveStatus = create<{ status: SaveStatus }>(() => ({ status: 'idle' }))
const setStatus = (status: SaveStatus) => useSaveStatus.setState({ status })

const store = () => useEditorStore.getState()

/** True when any persisted field changed (fields are immutable: compare by reference). */
export const snapshotChanged = (a: ProjectSnapshot, b: ProjectSnapshot): boolean =>
  (Object.keys(a) as (keyof ProjectSnapshot)[]).some((k) => a[k] !== b[k])

let autosaver: Autosaver | null = null
let createdAt = new Date().toISOString()
/** Stored operations of the open project that did not validate: kept, not replayed. */
let quarantined: readonly unknown[] = []
let quarantineNotice: number | null = null

/** Remember the invalid operations of the project being opened and warn about them. */
const setQuarantine = (ops: readonly unknown[] | undefined): void => {
  if (quarantineNotice !== null) dismissNotice(quarantineNotice)
  quarantineNotice = null
  quarantined = ops ?? []
  if (quarantined.length > 0)
    quarantineNotice = pushNotice(
      'warn',
      `${quarantined.length} ${quarantined.length === 1 ? 'operación no válida se ignoró' : 'operaciones no válidas se ignoraron'}. Siguen guardadas en el proyecto, pero no se aplican.`,
      0,
    )
}

/** Write the editor state the autosaver captured (`snap`) to the open project. */
const saveCurrent = async (snap: ProjectSnapshot): Promise<void> => {
  const id = store().projectId
  if (id === null || isDeletedProject(id)) return
  const saved = await putProject({
    ...snap,
    id,
    schemaVersion: SCHEMA_VERSION,
    system: store().system,
    createdAt,
    updatedAt: new Date().toISOString(),
    ...(quarantined.length > 0 && { quarantinedOps: quarantined }),
  })
  if (!isDeletedProject(saved.id)) await setLastProjectId(saved.id)
}

/** Put a stored project in the editor (autosave paused so that loading is not a change). */
const load = (p: ProjectRecord): void => {
  autosaver?.pause()
  store().loadSnapshot(p)
  store().setProjectId(p.id)
  createdAt = p.createdAt
  setQuarantine(p.quarantinedOps)
  autosaver?.resume()
  setStatus('saved')
  void setLastProjectId(p.id).catch(() => undefined)
}

/**
 * Start the project machinery: migrate the old save once, reopen the last project (or the most
 * recent one), or create the first one; then autosave. Idempotent (runs once per page).
 */
let starting: Promise<void> | null = null
export const initProjects = (): Promise<void> => (starting ??= start())

const start = async (): Promise<void> => {
  const initial = selectSnapshot(store())
  let adopted: ProjectSnapshot | null = null
  try {
    await migrateLegacySave()
    const lastId = await getLastProjectId()
    let project = lastId ? await getProject(lastId) : null
    if (!project) {
      const first = (await listProjects())[0]
      project = first ? await getProject(first.id) : null
    }
    // The user edited before the stored project was read: keep those edits, as a new project.
    const edited = snapshotChanged(initial, selectSnapshot(store()))
    if (!project || edited) {
      adopted = selectSnapshot(store())
      project = await createProject(adopted)
      store().setProjectId(project.id)
      createdAt = project.createdAt
      setQuarantine(undefined)
      void setLastProjectId(project.id).catch(() => undefined)
      setStatus('saved')
    } else load(project)
  } catch {
    setStatus('error') // no IndexedDB (private mode…): edit without saving
    return
  }
  const a = createAutosaver({
    subscribe: (l) => useEditorStore.subscribe(l),
    read: () => selectSnapshot(store()),
    changed: snapshotChanged,
    save: saveCurrent,
    onStatus: setStatus,
  })
  autosaver = a
  if (adopted && snapshotChanged(adopted, selectSnapshot(store()))) void a.flush(true)
  const onHide = () => {
    if (document.visibilityState === 'hidden') void a.flush()
  }
  document.addEventListener('visibilitychange', onHide)
}

/** "Guardar": save now. */
export const saveNow = async (): Promise<void> => {
  if (!autosaver) throw new Error('Los proyectos no están disponibles')
  await autosaver.flush(true)
  if (useSaveStatus.getState().status === 'error') throw new Error('No se pudo guardar')
}

/** Save the pending changes of the open project (before leaving it). */
const flushPending = async (): Promise<void> => {
  await autosaver?.flush()
}

export const openProject = async (id: string): Promise<boolean> => {
  if (id === store().projectId) return true
  await flushPending()
  const p = await getProject(id)
  if (!p) return false
  load(p)
  return true
}

/** A fresh project from the default block (the current one is saved first). */
export const newProject = async (): Promise<void> => {
  await flushPending()
  autosaver?.pause()
  const leftTab = store().leftTab
  store().reset()
  store().setLeftTab(leftTab)
  // The editor switches at once (edits made while the record is written are autosaved to it).
  const id = newProjectId()
  const now = new Date().toISOString()
  store().setProjectId(id)
  createdAt = now
  setQuarantine(undefined)
  autosaver?.resume()
  await putProject({
    ...selectSnapshot(store()),
    id,
    schemaVersion: SCHEMA_VERSION,
    system: store().system,
    createdAt: now,
    updatedAt: now,
  })
  await setLastProjectId(id)
  if (!autosaver?.isDirty()) setStatus('saved')
}

export const removeProject = async (id: string): Promise<void> => {
  const isCurrent = id === store().projectId
  if (isCurrent) {
    autosaver?.pause() // do not resurrect it
    store().setProjectId(null) // a save still in flight finds no project (and the db drops it)
  }
  await deleteProject(id)
  if (!isCurrent) return
  const next = (await listProjects())[0]
  const p = next ? await getProject(next.id) : null
  if (p) load(p)
  else await newProject()
}

/** The `.json` text and file name of a project (the open one is saved first). */
export const exportProjectFile = async (
  id: string,
): Promise<{ name: string; text: string } | null> => {
  if (id === store().projectId) await flushPending()
  const p = await getProject(id)
  if (!p) return null
  const slug = p.title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return { name: `${slug || 'proyecto'}.json`, text: serializeProject(p) }
}

/** Import a `.json` as a new project (never overwrites). Throws ProjectImportError. */
export const importProjectFile = async (
  text: string,
): Promise<{ project: ProjectRecord; droppedOps: number }> => {
  const parsed = parseProjectFile(text)
  const project = await putProject(parsed.project)
  return { project, droppedOps: parsed.droppedOps }
}

/** Save pending changes (e.g. before listing the projects). */
export const flushProjects = (): Promise<void> => flushPending()
