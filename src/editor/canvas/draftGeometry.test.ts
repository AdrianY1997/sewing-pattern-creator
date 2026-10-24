import { describe, expect, it } from 'vitest'
import { draftBlock, getBlock } from '../../blocks'
import { buildDraftRender, classifyInternal, polygonCentroid } from './draftGeometry'

describe('draft render data', () => {
  const draft = draftBlock(getBlock('women-bodice'), '10')
  const r = buildDraftRender(draft)

  it('splits a draft into pieces, darts, grainlines and guides', () => {
    expect(r.pieces.map((p) => p.name)).toEqual(['Espalda', 'Delantero'])
    expect(r.grainlines.map((g) => g.id).sort()).toEqual(['back.grain', 'front.grain'])
    expect(r.darts.every((d) => /dart/i.test(d.id))).toBe(true)
    expect(r.darts.length).toBeGreaterThan(4)
    expect(r.guides.some((g) => g.id === 'c.chest')).toBe(true)
    expect(r.guides.some((g) => g.id === 'back.waist')).toBe(true)
    expect(r.dartMarks.map((m) => m.id)).toEqual(['front.bustPoint'])
    expect(r.points.length).toBe(Object.keys(draft.points).length)
  })

  it('places each label inside its piece box', () => {
    for (const p of r.pieces) {
      expect(p.d.startsWith('M ')).toBe(true)
      expect(p.vertices.length).toBe(draft.pieces.find((x) => x.id === p.id)?.outline.length)
      expect(p.centroid.x).toBeGreaterThan(p.bbox.minX)
      expect(p.centroid.x).toBeLessThan(p.bbox.maxX)
      expect(p.centroid.y).toBeGreaterThan(p.bbox.minY)
      expect(p.centroid.y).toBeLessThan(p.bbox.maxY)
    }
  })

  it('classifies internal lines', () => {
    const front = draft.pieces.find((p) => p.id === 'front')!
    expect(classifyInternal(front, 'front.grain')).toBe('grain')
    expect(classifyInternal(front, 'front.bustDart.upper')).toBe('dart')
    expect(classifyInternal(front, 'front.waist')).toBe('guide')
  })

  it('computes polygon centroids', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
    ]
    expect(polygonCentroid(sq)).toEqual({ x: 2, y: 1 })
    expect(polygonCentroid([...sq].reverse())).toEqual({ x: 2, y: 1 })
  })
})
