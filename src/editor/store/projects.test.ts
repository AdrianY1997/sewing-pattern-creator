import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTOSAVE_DELAY_MS, createAutosaver } from './autosave'
import { selectSnapshot, useEditorStore } from './editorStore'
import {
  createProject,
  deleteProject,
  duplicateProject,
  getProject,
  listProjects,
  migrateLegacySave,
  renameProject,
} from './projectDb'
import { snapshotChanged } from './projectManager'
import {
  ProjectImportError,
  SCHEMA_VERSION,
  migrateProject,
  parseProjectFile,
  serializeProject,
} from './projects'
import { set } from 'idb-keyval'

const st = () => useEditorStore.getState()

describe('migrateProject', () => {
  const v1 = { schemaVersion: 1, blockId: 'women-bodice', title: 'x' }

  it('keeps a current project and stamps the current version', () => {
    expect(migrateProject(v1)).toEqual({ ...v1, schemaVersion: SCHEMA_VERSION })
  })

  it('rejects unknown, newer and missing versions with a Spanish message', () => {
    expect(() => migrateProject({ ...v1, schemaVersion: SCHEMA_VERSION + 1 })).toThrow(
      /versión más reciente/,
    )
    expect(() => migrateProject({ ...v1, schemaVersion: 0 })).toThrow(ProjectImportError)
    expect(() => migrateProject({ ...v1, schemaVersion: 'x' })).toThrow(/versión de esquema/)
    expect(() => migrateProject({ blockId: 'women-bodice' })).toThrow(ProjectImportError)
    expect(() => migrateProject(null)).toThrow(/proyecto válido/)
  })
})

describe('project persistence', () => {
  beforeEach(() => st().reset())

  it('creates, lists, renames, duplicates and deletes projects', async () => {
    st().setTitle('Falda')
    const a = await createProject(selectSnapshot(st()))
    expect(a.id).toMatch(/^p-/)
    expect(a.thumbnailSvg).toMatch(/^<svg/)
    const b = await duplicateProject(a.id)
    expect(b?.title).toBe('Falda (copia)')
    expect(b?.id).not.toBe(a.id)

    await renameProject(a.id, 'Falda lápiz')
    const list = await listProjects()
    expect(list.map((p) => p.title).sort()).toEqual(['Falda (copia)', 'Falda lápiz'])
    expect((await getProject(a.id))?.title).toBe('Falda lápiz')

    await deleteProject(a.id)
    expect(await getProject(a.id)).toBeNull()
    expect((await listProjects()).map((p) => p.id)).toEqual([b?.id])
  })

  it('stores every persisted field', async () => {
    st().setBlock('women-sleeve')
    st().setNotes('nota')
    st().setLayer('notes', true)
    st().applyOps({ type: 'extractAll' })
    st().setViewMode('pieces')
    const p = await createProject(selectSnapshot(st()))
    const back = await getProject(p.id)
    expect(back).toMatchObject({
      blockId: 'women-sleeve',
      notes: 'nota',
      viewMode: 'pieces',
      schemaVersion: SCHEMA_VERSION,
    })
    expect(back?.layers.notes).toBe(true)
    expect(back?.operations).toHaveLength(1)
  })

  it('migrates the old single-snapshot save once', async () => {
    await set('spc:project:current', {
      ...selectSnapshot(st()),
      title: 'Antiguo',
      schema: 1,
      savedAt: '2024-01-02T00:00:00.000Z',
    })
    for (const p of await listProjects()) await deleteProject(p.id)
    const before = 0
    const p = await migrateLegacySave()
    expect(p?.title).toBe('Antiguo')
    expect((await listProjects()).length).toBe(before + 1)
    expect(await migrateLegacySave()).toBeNull()
  })
})

describe('import / export .json', () => {
  beforeEach(() => st().reset())

  it('round-trips a project into a new one', async () => {
    st().setTitle('Mi cuerpo')
    st().setSize('14')
    st().applyOps({ type: 'extractAll' })
    const p = await createProject(selectSnapshot(st()))
    const text = serializeProject((await getProject(p.id))!)
    const file = JSON.parse(text) as Record<string, unknown>
    expect(file).toMatchObject({ app: 'sewing-pattern-creator', schemaVersion: SCHEMA_VERSION })
    expect(text).not.toContain('thumbnailSvg')

    const { project, droppedOps } = parseProjectFile(text)
    expect(droppedOps).toBe(0)
    expect(project.id).not.toBe(p.id)
    expect(project).toMatchObject({ title: 'Mi cuerpo', size: '14', blockId: 'women-bodice' })
    expect(project.operations).toEqual((await getProject(p.id))?.operations)
  })

  it('rejects malformed input with clear messages', () => {
    expect(() => parseProjectFile('no json')).toThrow(/JSON válido/)
    expect(() => parseProjectFile('[]')).toThrow(/no es un proyecto/)
    expect(() => parseProjectFile(JSON.stringify({ app: 'otra', project: {} }))).toThrow(
      /no es un proyecto/,
    )
    const bad = (project: object, schemaVersion = 1) =>
      JSON.stringify({ app: 'sewing-pattern-creator', schemaVersion, project })
    expect(() => parseProjectFile(bad({ blockId: 'nope' }))).toThrow(/bloque desconocido/)
    expect(() => parseProjectFile(bad({ blockId: 'women-bodice' }, 99))).toThrow(
      /versión más reciente/,
    )
  })

  it('drops invalid operations and sanitises the rest', () => {
    const text = JSON.stringify({
      app: 'sewing-pattern-creator',
      schemaVersion: 1,
      project: {
        schemaVersion: 1,
        blockId: 'women-bodice',
        size: '999',
        advanced: { seamAllowanceMm: 'x' },
        operations: [{ id: 'a', type: 'extractAll' }, { type: 'nope' }, 5],
      },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { project, droppedOps } = parseProjectFile(text)
    warn.mockRestore()
    expect(droppedOps).toBe(2)
    expect(project.operations).toHaveLength(1)
    expect(project.size).toBe('10')
    expect(project.advanced.seamAllowanceMm).toBe(10)
  })
})

describe('autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    return () => vi.useRealTimers()
  })

  const make = () => {
    let value = 0
    const listeners = new Set<() => void>()
    const save = vi.fn(() => Promise.resolve())
    const statuses: string[] = []
    const saver = createAutosaver({
      subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
      read: () => value,
      changed: (a, b) => a !== b,
      save,
      onStatus: (s) => statuses.push(s),
    })
    const change = (v: number) => {
      value = v
      listeners.forEach((l) => l())
    }
    return { saver, save, change, statuses }
  }

  it('saves once, 1.5 s after the last change', async () => {
    const { save, change, statuses } = make()
    change(1)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100)
    change(2)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(2)
    expect(statuses).toEqual(['pending', 'pending', 'saving', 'saved'])
  })

  it('ignores changes while paused, and flush(force) saves now', async () => {
    const { saver, save, change } = make()
    saver.pause()
    change(5)
    saver.resume()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(save).not.toHaveBeenCalled()
    await saver.flush()
    expect(save).not.toHaveBeenCalled()
    await saver.flush(true)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('reports a failed save', async () => {
    const { save, change, statuses } = make()
    save.mockRejectedValueOnce(new Error('x'))
    change(1)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(statuses.at(-1)).toBe('error')
  })

  it('an undo back to the baseline during an in-flight save is saved afterwards', async () => {
    let value = 0
    const listeners = new Set<() => void>()
    let db = 0
    const releases: (() => void)[] = []
    const saver = createAutosaver({
      subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
      read: () => value,
      changed: (a, b) => a !== b,
      save: (v) =>
        new Promise<void>((resolve) => {
          releases.push(() => {
            db = v // the value passed in, as the manager now saves it
            resolve()
          })
        }),
    })
    const change = (v: number) => {
      value = v
      listeners.forEach((l) => l())
    }
    change(1)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS) // save(1) starts and stays in flight
    expect(releases).toHaveLength(1)
    change(0) // undo back to the baseline while it is in flight
    releases[0]()
    await vi.advanceTimersByTimeAsync(0)
    expect(db).toBe(1)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    expect(releases).toHaveLength(2)
    releases[1]()
    await vi.advanceTimersByTimeAsync(0)
    expect(db).toBe(0)
    expect(saver.isDirty()).toBe(false)
  })

  it('watches the persisted fields of the editor store', () => {
    st().reset()
    const base = selectSnapshot(st())
    st().setNotes('a')
    expect(snapshotChanged(base, selectSnapshot(st()))).toBe(true)
    st().setTool('pan')
    expect(snapshotChanged(selectSnapshot(st()), selectSnapshot(st()))).toBe(false)
  })
})
