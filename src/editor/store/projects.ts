/**
 * Project model (SPEC §10): the stored record, its schema migration, the validation of imported
 * files and the small SVG thumbnail. Pure functions, no IndexedDB here.
 */
import { getBlock, isBlockSize, sanitizeBlockOptions } from '../../blocks'
import type { MeasurementSystem } from '../../data'
import type { Operation } from '../../core'
import {
  DEFAULT_ADVANCED,
  sanitizeAdvanced,
  sanitizeLayers,
  sanitizeOperations,
  type AdvancedOptions,
  type ProjectSnapshot,
  type ViewMode,
} from './editorStore'
import type { LayerVisibility } from './layers'
import { allowanceDefaults, cachedDraft, cachedPattern } from './patternData'

/** Current schema of a stored project and of the exported `.json`. */
export const SCHEMA_VERSION = 1
export const APP_ID = 'sewing-pattern-creator'

export interface ProjectRecord {
  readonly id: string
  readonly schemaVersion: number
  readonly title: string
  readonly blockId: string
  readonly system: MeasurementSystem
  readonly size: string
  readonly blockOptions: ProjectSnapshot['blockOptions']
  readonly advanced: AdvancedOptions
  readonly operations: readonly Operation[]
  readonly notes: string
  readonly layers: LayerVisibility
  readonly viewMode: ViewMode
  readonly createdAt: string
  readonly updatedAt: string
  /** Small SVG of the pattern for the projects page (regenerated on every save). */
  readonly thumbnailSvg?: string
}

/** What the projects page lists (the index entry of a project). */
export type ProjectSummary = Pick<
  ProjectRecord,
  'id' | 'title' | 'blockId' | 'size' | 'createdAt' | 'updatedAt' | 'thumbnailSvg'
>

/** The exported `.json` file. */
export interface ProjectFile {
  readonly app: typeof APP_ID
  readonly schemaVersion: number
  readonly project: Omit<ProjectRecord, 'thumbnailSvg'>
}

/** An import problem, with a message ready for the user (Spanish). */
export class ProjectImportError extends Error {}

export const newProjectId = (): string =>
  `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Bring a stored or imported project of any known version up to SCHEMA_VERSION (the shape, not
 * yet validated). Throws ProjectImportError for an unknown or newer version.
 */
export const migrateProject = (old: unknown): Record<string, unknown> => {
  if (!isObject(old)) throw new ProjectImportError('El archivo no contiene un proyecto válido.')
  const version = old.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    throw new ProjectImportError('El proyecto no indica una versión de esquema reconocible.')
  if (version > SCHEMA_VERSION)
    throw new ProjectImportError(
      `El proyecto es de una versión más reciente (esquema ${version}) que esta aplicación (${SCHEMA_VERSION}). Actualiza la aplicación para abrirlo.`,
    )
  let cur: Record<string, unknown> = { ...old }
  // One case per version, each upgrading to the next (fall through). v1 is the first schema.
  switch (version) {
    case 1:
    // v1 -> v2 would go here
  }
  cur = { ...cur, schemaVersion: SCHEMA_VERSION }
  return cur
}

/**
 * A valid record from untrusted data (a migrated project): the existing sanitisers and operation
 * validators decide what is kept. Operations that do not validate are dropped and counted.
 */
export const sanitizeProject = (
  raw: Record<string, unknown>,
  now = new Date().toISOString(),
): { project: ProjectRecord; droppedOps: number } => {
  if (typeof raw.blockId !== 'string')
    throw new ProjectImportError('El proyecto no indica el bloque base.')
  let block
  try {
    block = getBlock(raw.blockId)
  } catch {
    throw new ProjectImportError(`El proyecto usa un bloque desconocido («${raw.blockId}»).`)
  }
  const operations = sanitizeOperations(raw.operations)
  const given = Array.isArray(raw.operations) ? raw.operations.length : 0
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d)
  const date = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : now)
  return {
    droppedOps: given - operations.length,
    project: {
      id: str(raw.id, '') || newProjectId(),
      schemaVersion: SCHEMA_VERSION,
      title: str(raw.title, block.label).slice(0, 200) || block.label,
      blockId: block.id,
      system: block.system,
      size:
        typeof raw.size === 'string' && isBlockSize(block, raw.size) ? raw.size : block.defaultSize,
      blockOptions: sanitizeBlockOptions(block, isObject(raw.blockOptions) ? raw.blockOptions : {}),
      advanced: sanitizeAdvanced(raw.advanced ?? DEFAULT_ADVANCED),
      operations,
      notes: str(raw.notes, ''),
      layers: sanitizeLayers(raw.layers),
      viewMode: raw.viewMode === 'pieces' ? 'pieces' : 'trace',
      createdAt: date(raw.createdAt),
      updatedAt: date(raw.updatedAt),
    },
  }
}

/** The `.json` text of a project. */
export const serializeProject = (p: ProjectRecord): string => {
  const project: Omit<ProjectRecord, 'thumbnailSvg'> & { thumbnailSvg?: string } = { ...p }
  delete project.thumbnailSvg
  const file: ProjectFile = { app: APP_ID, schemaVersion: SCHEMA_VERSION, project }
  return JSON.stringify(file, null, 2)
}

/**
 * Parse and validate an exported `.json`: a project with a new id (import never overwrites).
 * Throws ProjectImportError with a Spanish message.
 */
export const parseProjectFile = (
  text: string,
  now = new Date().toISOString(),
): { project: ProjectRecord; droppedOps: number } => {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new ProjectImportError('El archivo no es un JSON válido.')
  }
  if (!isObject(data) || data.app !== APP_ID || !isObject(data.project))
    throw new ProjectImportError('El archivo no es un proyecto de Sewing Pattern Creator.')
  // The envelope version decides when the project does not carry its own.
  const migrated = migrateProject({
    ...data.project,
    schemaVersion: data.project.schemaVersion ?? data.schemaVersion,
  })
  const { project, droppedOps } = sanitizeProject(migrated, now)
  return { project: { ...project, id: newProjectId(), createdAt: now, updatedAt: now }, droppedOps }
}

/** Small SVG (pieces' outlines) of the pattern, or undefined when it cannot be drawn. */
export const projectThumbnail = (
  p: Pick<
    ProjectRecord,
    'blockId' | 'size' | 'blockOptions' | 'operations' | 'advanced' | 'viewMode'
  >,
): string | undefined => {
  try {
    const render =
      p.viewMode === 'pieces' && p.operations.length > 0
        ? cachedPattern(
            p.blockId,
            p.size,
            p.blockOptions,
            p.operations,
            allowanceDefaults(p.advanced),
          ).render
        : cachedDraft(p.blockId, p.size, p.blockOptions).render
    if (render.pieces.length === 0) return undefined
    const bb = render.bbox
    const w = bb.maxX - bb.minX
    const h = bb.maxY - bb.minY
    const pad = Math.max(w, h) * 0.05
    const vb = [bb.minX - pad, bb.minY - pad, w + 2 * pad, h + 2 * pad]
      .map((n) => Math.round(n))
      .join(' ')
    const stroke = Math.round(Math.max(w, h) / 170)
    const paths = render.pieces.map((q) => `<path d="${q.d}"/>`).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="none" stroke="#3b3f6b" stroke-width="${stroke}" stroke-linejoin="round">${paths}</svg>`
  } catch {
    return undefined
  }
}

export const summaryOf = (p: ProjectRecord): ProjectSummary => ({
  id: p.id,
  title: p.title,
  blockId: p.blockId,
  size: p.size,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  thumbnailSvg: p.thumbnailSvg,
})
