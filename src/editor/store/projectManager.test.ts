import 'fake-indexeddb/auto'
import { set } from 'idb-keyval'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { selectSnapshot, useEditorStore } from './editorStore'
import { useNotices } from './notices'
import { createProject, deleteProject, getProject, listProjects, putProject } from './projectDb'
import {
  importProjectFile,
  initProjects,
  openProject,
  removeProject,
  saveNow,
} from './projectManager'
import { SCHEMA_VERSION } from './projects'

const st = () => useEditorStore.getState()

beforeAll(async () => {
  await initProjects()
})

describe('removeProject', () => {
  it('an in-flight save does not bring the deleted project back', async () => {
    const id = st().projectId!
    st().setNotes('cambio')
    const saving = saveNow().catch(() => undefined) // queued, not yet written
    await removeProject(id)
    await saving
    expect(await getProject(id)).toBeNull()
    expect((await listProjects()).some((p) => p.id === id)).toBe(false)
    expect(st().projectId).not.toBe(id)
  })

  it('the db drops a write for a deleted id', async () => {
    const p = await createProject(selectSnapshot(st()))
    await deleteProject(p.id)
    await putProject(p)
    expect(await getProject(p.id)).toBeNull()
  })
})

describe('invalid stored operations', () => {
  it('are kept in storage, warned about, and survive an autosave', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const good = { id: 'a', type: 'extractAll' }
    const bad = { id: 'b', type: 'noSuchOperation' }
    const base = await createProject(selectSnapshot(st()))
    await set(`spc:project:${base.id}`, { ...base, operations: [good, bad] })

    const loaded = await getProject(base.id)
    expect(loaded?.operations).toHaveLength(1)
    expect(loaded?.quarantinedOps).toEqual([bad])

    expect(await openProject(base.id)).toBe(true)
    expect(st().operations).toHaveLength(1)
    expect(useNotices.getState().notices.some((n) => /1 operación no válida/.test(n.text))).toBe(
      true,
    )
    st().setNotes('otra cosa')
    await saveNow()
    warn.mockRestore()
    const after = await getProject(base.id)
    expect(after?.quarantinedOps).toEqual([bad])
    expect(after?.schemaVersion).toBe(SCHEMA_VERSION)
    expect(after?.notes).toBe('otra cosa')
  })
})

describe('import', () => {
  it('still reports the dropped count', async () => {
    const r = await importProjectFile(
      JSON.stringify({
        app: 'sewing-pattern-creator',
        schemaVersion: 1,
        project: { schemaVersion: 1, blockId: 'women-bodice', operations: [{ type: 'nope' }] },
      }),
    ).catch(() => null)
    expect(r?.droppedOps).toBe(1)
  })
})
