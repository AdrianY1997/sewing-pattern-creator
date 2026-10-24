/** "Guardar": the current project settings in IndexedDB (SPEC §10; project list comes later). */
import { get, set } from 'idb-keyval'
import type { ProjectSnapshot } from './editorStore'

const KEY = 'spc:project:current'
const SCHEMA = 1

interface StoredProject extends ProjectSnapshot {
  readonly schema: number
  readonly savedAt: string
}

export const saveProject = async (snapshot: ProjectSnapshot): Promise<void> => {
  const stored: StoredProject = { ...snapshot, schema: SCHEMA, savedAt: new Date().toISOString() }
  await set(KEY, stored)
}

/** The saved project, or null when there is none or it has another schema. */
export const loadProject = async (): Promise<Partial<ProjectSnapshot> | null> => {
  const v: unknown = await get(KEY)
  if (!v || typeof v !== 'object' || (v as StoredProject).schema !== SCHEMA) return null
  return v as Partial<ProjectSnapshot>
}
