/** Projects in IndexedDB (SPEC §10): one record per project plus an index for the list. */
import { del, get, set } from 'idb-keyval'
import { getBlock } from '../../blocks'
import type { ProjectSnapshot } from './editorStore'
import {
  SCHEMA_VERSION,
  migrateProject,
  newProjectId,
  projectThumbnail,
  sanitizeProject,
  summaryOf,
  type ProjectRecord,
  type ProjectSummary,
} from './projects'

const INDEX_KEY = 'spc:projects:index'
const LAST_KEY = 'spc:projects:last'
const recordKey = (id: string) => `spc:project:${id}`
/** The single-snapshot save of before the project list. */
const LEGACY_KEY = 'spc:project:current'

// Index updates are read-modify-write: run them one after another.
let queue: Promise<unknown> = Promise.resolve()
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

const readIndex = async (): Promise<ProjectSummary[]> => {
  const v: unknown = await get(INDEX_KEY)
  return Array.isArray(v) ? (v as ProjectSummary[]) : []
}

/** Projects, most recently updated first. */
export const listProjects = async (): Promise<ProjectSummary[]> =>
  (await readIndex()).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

/** A stored project, or null when missing or unreadable. */
export const getProject = async (id: string): Promise<ProjectRecord | null> => {
  const v: unknown = await get(recordKey(id))
  if (!v) return null
  try {
    return sanitizeProject(migrateProject(v)).project
  } catch {
    return null
  }
}

/** Write a project (a new one or an update); refreshes its thumbnail and the index. */
export const putProject = (p: ProjectRecord): Promise<ProjectRecord> =>
  serial(async () => {
    if (deleted.has(p.id)) return p
    const record: ProjectRecord = {
      ...p,
      schemaVersion: SCHEMA_VERSION,
      thumbnailSvg: projectThumbnail(p),
    }
    await set(recordKey(record.id), record)
    const index = (await readIndex()).filter((s) => s.id !== record.id)
    await set(INDEX_KEY, [...index, summaryOf(record)])
    return record
  })

/** A new project from a snapshot, stored with a fresh id and dates. */
export const createProject = (
  snapshot: ProjectSnapshot,
  now = new Date().toISOString(),
): Promise<ProjectRecord> =>
  putProject({
    ...snapshot,
    id: newProjectId(),
    schemaVersion: SCHEMA_VERSION,
    system: getBlock(snapshot.blockId).system,
    createdAt: now,
    updatedAt: now,
  })

/** Ids deleted in this session: a save still in flight must not bring them back. */
const deleted = new Set<string>()
export const isDeletedProject = (id: string): boolean => deleted.has(id)

export const deleteProject = (id: string): Promise<void> => {
  deleted.add(id)
  return serial(async () => {
    await del(recordKey(id))
    await set(
      INDEX_KEY,
      (await readIndex()).filter((s) => s.id !== id),
    )
    if ((await get(LAST_KEY)) === id) await del(LAST_KEY)
  })
}

export const renameProject = async (id: string, title: string): Promise<void> => {
  const p = await getProject(id)
  if (p) await putProject({ ...p, title, updatedAt: new Date().toISOString() })
}

/** A copy with a new id, titled «<title> (copia)». */
export const duplicateProject = async (id: string): Promise<ProjectRecord | null> => {
  const p = await getProject(id)
  if (!p) return null
  const now = new Date().toISOString()
  return putProject({
    ...p,
    id: newProjectId(),
    title: `${p.title} (copia)`,
    createdAt: now,
    updatedAt: now,
  })
}

export const getLastProjectId = async (): Promise<string | null> => {
  const v: unknown = await get(LAST_KEY)
  return typeof v === 'string' ? v : null
}
export const setLastProjectId = (id: string): Promise<void> => set(LAST_KEY, id)

/**
 * The old single-snapshot save as a project, once: nothing is done when there are projects or no
 * legacy save. The legacy key is removed after migrating. Returns the new project, if any.
 */
export const migrateLegacySave = async (): Promise<ProjectRecord | null> => {
  if ((await readIndex()).length > 0) return null
  const v: unknown = await get(LEGACY_KEY)
  if (!v || typeof v !== 'object') return null
  const old = v as Record<string, unknown>
  try {
    const savedAt = typeof old.savedAt === 'string' ? old.savedAt : new Date().toISOString()
    const { project } = sanitizeProject({ ...old, id: '' }, savedAt)
    const saved = await putProject({ ...project, createdAt: savedAt, updatedAt: savedAt })
    await del(LEGACY_KEY)
    return saved
  } catch {
    return null
  }
}
