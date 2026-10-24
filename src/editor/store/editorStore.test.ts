import { beforeEach, describe, expect, it } from 'vitest'
import { PX_PER_MM, screenToWorld } from '../canvas/viewTransform'
import { DEFAULT_ADVANCED, selectSnapshot, useEditorStore } from './editorStore'
import { DEFAULT_LAYERS, LAYERS } from './layers'

const st = () => useEditorStore.getState()

describe('editor store', () => {
  beforeEach(() => st().reset())

  it('starts on the default block with its system, size and options', () => {
    expect(st().blockId).toBe('women-bodice')
    expect(st().system).toBe('co-women-industrial')
    expect(st().size).toBe('10')
    expect(st().blockOptions).toEqual({ length: 'hip' })
    expect(st().layers).toEqual(DEFAULT_LAYERS)
    expect(st().selectedPieceId).toBeNull()
  })

  it('title follows the block label until the user edits it', () => {
    st().setBlock('women-sleeve')
    expect(st().title).toBe('Manga base mujer')
    st().setTitle('Mi patrón')
    st().setBlock('women-bodice')
    expect(st().title).toBe('Mi patrón')
  })

  it('accepts only sizes of the current system', () => {
    st().setSize('16')
    expect(st().size).toBe('16')
    st().setSize('48')
    expect(st().size).toBe('16')
  })

  it('validates block options against the schema', () => {
    st().setBlockOption('length', 'waist')
    expect(st().blockOptions).toEqual({ length: 'waist' })
    st().setBlockOption('length', 'ankle')
    expect(st().blockOptions).toEqual({ length: 'hip' })
  })

  it('switching block resets options and selection', () => {
    st().setBlockOption('length', 'waist')
    st().selectPiece('front')
    st().setBlock('women-bodice')
    expect(st().blockOptions).toEqual({ length: 'hip' })
    expect(st().selectedPieceId).toBeNull()
    expect(() => st().setBlock('unknown')).toThrow()
  })

  it('toggles layers and the grid', () => {
    for (const l of LAYERS) {
      const before = st().layers[l.id]
      st().toggleLayer(l.id)
      expect(st().layers[l.id]).toBe(!before)
    }
    st().setLayer('notes', true)
    expect(st().layers.notes).toBe(true)
    st().toggleGrid()
    expect(st().showGrid).toBe(false)
  })

  it('zooms at a point and pans', () => {
    st().setView({ x: 10, y: 20, scale: PX_PER_MM })
    const cursor = { x: 200, y: 150 }
    const before = screenToWorld(st().view, cursor)
    st().zoomAt(cursor, 2)
    expect(st().view.scale).toBeCloseTo(PX_PER_MM * 2, 12)
    const after = screenToWorld(st().view, cursor)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
    const { x, y } = st().view
    st().panBy(15, -5)
    expect(st().view.x).toBe(x + 15)
    expect(st().view.y).toBe(y - 5)
  })

  it('stores advanced options, title and selection', () => {
    st().setAdvanced({ hemMm: 30, bias: true })
    expect(st().advanced).toEqual({ ...DEFAULT_ADVANCED, hemMm: 30, bias: true })
    st().setTitle('Blusa')
    st().selectPiece('back')
    expect(st().title).toBe('Blusa')
    expect(st().selectedPieceId).toBe('back')
  })

  it('round-trips a snapshot and sanitises bad saves', () => {
    st().setTitle('Mi cuerpo')
    st().setSize('14')
    st().setBlockOption('length', 'waist')
    st().setNotes('probar en tela')
    const snap = selectSnapshot(st())
    st().reset()
    st().loadSnapshot(snap)
    expect(selectSnapshot(st())).toEqual(snap)

    st().loadSnapshot({ blockId: 'gone', size: '99', blockOptions: { length: 'x' } })
    expect(st().blockId).toBe('women-bodice')
    expect(st().size).toBe('10')
    expect(st().blockOptions).toEqual({ length: 'hip' })
  })

  it('selects segments together with their piece', () => {
    st().selectSegment('front.shoulder', 'front')
    expect(st().selectedSegmentId).toBe('front.shoulder')
    expect(st().selectedPieceId).toBe('front')
    st().selectPiece('back')
    expect(st().selectedSegmentId).toBeNull()
    st().selectSegment('c.chest')
    expect(st().selectedPieceId).toBeNull()
    st().selectSegment('front.shoulder', 'front')
    st().setBlock('women-bodice')
    expect(st().selectedSegmentId).toBeNull()
  })

  it('toggles snap and stores the screen calibration', () => {
    expect(st().snapEnabled).toBe(true)
    st().toggleSnap()
    expect(st().snapEnabled).toBe(false)
    expect(st().pxPerMm).toBeCloseTo(PX_PER_MM, 12)
    expect(st().calibrated).toBe(false)
    st().setPxPerMm(5)
    expect(st().pxPerMm).toBe(5)
    expect(st().calibrated).toBe(true)
    expect(localStorage.getItem('spc:calibration:pxPerMm')).toBe('5')
    st().setPxPerMm(-1) // invalid: ignored
    expect(st().pxPerMm).toBe(5)
    st().reset() // reloads the stored calibration
    expect(st().pxPerMm).toBe(5)
    st().setPxPerMm(null)
    expect(st().pxPerMm).toBeCloseTo(PX_PER_MM, 12)
    expect(localStorage.getItem('spc:calibration:pxPerMm')).toBeNull()
  })

  it('opens one drawer at a time', () => {
    st().setDrawer('left')
    expect(st().drawer).toBe('left')
    st().setDrawer('right')
    expect(st().drawer).toBe('right')
    st().setDrawer(null)
    expect(st().drawer).toBeNull()
  })
})
