import { describe, expect, it } from 'vitest'
import { WOMEN_BODICE_BLOCK, draftBlock, getBlock } from '../../blocks'
import { flattenPath, pathBBox, piecePath, segmentLength } from '../../core'
import { measureWomenBodice } from '../../blocks/womenBodice'
import {
  buildDraftRender,
  classifyInternal,
  labelPositions,
  notchTicks,
  pieceMetrics,
  pointInPolygon,
  polygonCentroid,
} from './draftGeometry'

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

  it('lists every selectable segment with its layer and piece', () => {
    const front = draft.pieces.find((p) => p.id === 'front')!
    const outline = r.segments.filter((s) => s.pieceId === 'front' && s.layer === 'outline')
    expect(outline.map((s) => s.id)).toEqual(front.outline.map((o) => o.segment))
    expect(r.segments.some((s) => s.layer === 'darts' && /dart/i.test(s.id))).toBe(true)
    expect(r.segments.some((s) => s.layer === 'guides' && s.id === 'c.chest')).toBe(true)
    expect(r.segments.some((s) => /grain/.test(s.id))).toBe(false)
  })

  it('measures perimeter, area and armhole of a piece', () => {
    const m = pieceMetrics(draft, 'front')
    const front = draft.pieces.find((p) => p.id === 'front')!
    const sum = front.outline.reduce((acc, o) => acc + segmentLength(draft.segments[o.segment]), 0)
    expect(m.perimeter).toBeCloseTo(sum, 9)
    const box = pathBBox(piecePath(draft, 'front'))
    const boxArea = (box.maxX - box.minX) * (box.maxY - box.minY)
    expect(m.area).toBeGreaterThan(boxArea * 0.6)
    expect(m.area).toBeLessThan(boxArea)
    const bodice = measureWomenBodice(draft)
    expect(m.armhole).toBeCloseTo(bodice.armhole.front, 6)
    expect(pieceMetrics(draft, 'back').armhole).toBeCloseTo(bodice.armhole.back, 6)
    expect(() => pieceMetrics(draft, 'nope')).toThrow()
  })
})

describe('notchTicks', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]
  it('single notch: 5 mm tick perpendicular to the outline, crossing it', () => {
    const [t] = notchTicks(square, { x: 50, y: 0 })
    expect(t).toEqual([
      { x: 50, y: -2.5 },
      { x: 50, y: 2.5 },
    ])
  })
  it('double notch: two ticks 3 mm apart along the outline', () => {
    const ts = notchTicks(square, { x: 100, y: 50 }, 2)
    expect(ts).toHaveLength(2)
    expect(Math.abs(ts[1][0].y - ts[0][0].y)).toBeCloseTo(3)
    for (const [a, b] of ts) expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(5)
  })
  it('the sleeve render has 3 notches, 4 ticks', () => {
    const r2 = buildDraftRender(draftBlock(getBlock('women-sleeve'), '10'))
    expect(r2.notches).toHaveLength(3)
    expect(r2.notches.flatMap((n) => n.ticks)).toHaveLength(4)
  })
})

describe('label positions', () => {
  it('moves the labels of overlapping pieces off the shared area', () => {
    const draft = draftBlock(WOMEN_BODICE_BLOCK, '10')
    const polys = draft.pieces.map((p) => flattenPath(piecePath(draft, p.id), 0.5))
    const r = buildDraftRender(draft)
    r.pieces.forEach((p, i) => {
      expect(pointInPolygon(p.labelAt, polys[i])).toBe(true)
      polys.forEach((q, j) => j !== i && expect(pointInPolygon(p.labelAt, q)).toBe(false))
    })
  })

  it('keeps the centroid of a piece that overlaps nothing', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    const far = sq.map((p) => ({ x: p.x + 100, y: p.y }))
    const [a] = labelPositions([sq, far])
    expect(a.x).toBeCloseTo(5)
    expect(a.y).toBeCloseTo(5)
  })
})
