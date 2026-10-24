import { describe, expect, it } from 'vitest'
import { isContinuous, pathSelfIntersections, piecePath, type Draft } from '../core'
import { getMeasurements, getTable, type WomenSize } from '../data'
import { WOMEN_TROUSERS_DEFAULTS, draftWomenTrousers, measureWomenTrousers } from './womenTrousers'
import { defaultBlockOptions, draftBlock, getBlock, pieceCut } from './registry'

const SIZES = getTable('co-women-industrial').sizes.map((s) => s.id) as WomenSize[]
const m10 = getMeasurements('co-women-industrial', '10')
const d10 = draftWomenTrousers(m10)
const r10 = measureWomenTrousers(d10)
const E = WOMEN_TROUSERS_DEFAULTS

describe('draftWomenTrousers — size 10 key points (docs/blocks/women-trousers.md §5)', () => {
  const expected: Record<string, [number, number]> = {
    A: [0, 0],
    A1: [0, 297],
    A2: [0, 200],
    A3: [0, 590],
    A4: [0, 1050],
    A5: [-155, 297],
    A6: [155, 297],
    A7: [90, 297],
    A8: [-155, 200],
    A9: [90, 200],
    A11: [80, 0],
    A12: [112.98, 274.02],
    A13: [-112.5, 0],
    A14: [-10, 0],
    A15: [10, 0],
    A16: [0, 100],
    A17: [-125, 590],
    A18: [125, 590],
    A19: [-107.5, 1050],
    A20: [107.5, 1050],
    A21: [67.5, 297],
    A22: [67.5, 200],
    A23: [47.5, -20],
    A24: [-187.5, 200],
    A25: [187.5, 297],
    A26: [187.5, 300.5],
    A27: [99.32, 265.18],
    A28: [-164.13, -0.77],
    A29: [-23.04, -13.59],
    A32: [-12.18, 105.92],
    A33: [-93.59, -7.18],
    A36: [-84.54, 92.41],
    A37: [-135, 590],
    A38: [135, 590],
    A39: [-117.5, 1050],
    A40: [117.5, 1050],
  }
  for (const [name, [x, y]] of Object.entries(expected))
    it(`${name} = (${x}, ${y}) mm`, () => {
      const p = d10.points[name]
      expect(p, name).toBeDefined()
      expect(p.x).toBeCloseTo(x, 1)
      expect(p.y).toBeCloseTo(y, 1)
    })

  it('seam lengths and widths', () => {
    expect(r10.front.inseam).toBeCloseTo(754.94, 1)
    expect(r10.front.outseam).toBeCloseTo(1056.7, 1)
    expect(r10.front.waist).toBe(172.5)
    expect(r10.front.darts).toBe(20)
    expect(r10.back.darts).toBeCloseTo(40, 9)
    expect(r10.front.hip).toBe(245)
    expect(r10.back.hip).toBe(255)
    expect(r10.front.knee).toBe(250)
    expect(r10.back.knee).toBe(270)
    expect(r10.front.hem).toBe(215)
    expect(r10.back.hem).toBe(235)
  })
})

describe('draftWomenTrousers — construction', () => {
  const p = d10.points
  it('front and back share the frame: crease x = 0 and the same horizontal lines', () => {
    for (const id of ['c.crease', 'c.waist', 'c.hip', 'c.crotch', 'c.knee', 'c.hem'])
      expect(d10.segments[id], id).toBeDefined()
    for (const [f, k] of [
      ['A17', 'A37'],
      ['A18', 'A38'],
      ['A19', 'A39'],
      ['A20', 'A40'],
    ])
      expect(p[f].y).toBe(p[k].y)
    // Knee and hem are centred on the crease.
    expect(p.A17.x + p.A18.x).toBeCloseTo(0, 9)
    expect(p.A39.x + p.A40.x).toBeCloseTo(0, 9)
  })

  it('the grainline is the crease line on both pieces', () => {
    for (const pc of d10.pieces) {
      const mark = pc.marks.find((mk) => mk.kind === 'grainline')
      expect(mark?.data?.segment).toBe(`${pc.id}.grain`)
      const g = d10.segments[`${pc.id}.grain`]
      expect(g.kind).toBe('line')
      if (g.kind === 'line') {
        expect(g.p0.x).toBe(0)
        expect(g.p1.x).toBe(0)
      }
      expect(pc.internalLines).toContain(`${pc.id}.grain`)
    }
  })

  it('segment naming: crotch curves, inseams and outseams', () => {
    for (const pc of d10.pieces) {
      const ids = pc.outline.map((r) => r.segment)
      const crotch = ids.filter((id) => id.includes('crotch'))
      expect(crotch.length).toBe(2)
      for (const id of crotch) expect(d10.segments[id].kind).toBe('cubic')
      expect(ids.filter((id) => id.includes('inseam')).length).toBe(2)
      expect(ids.filter((id) => id.includes('outseam')).length).toBe(3)
    }
  })

  it('darts: one on the front crease, two on the back waist with equal legs', () => {
    const len = (a: string, b: string) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y)
    expect(p.A16.x).toBe(0)
    expect(len('A14', 'A16')).toBeCloseTo(len('A15', 'A16'), 9)
    expect(len('A30', 'A32')).toBeCloseTo(len('A31', 'A32'), 9)
    expect(len('A34', 'A36')).toBeCloseTo(len('A35', 'A36'), 9)
    expect(len('A29', 'A32')).toBeCloseTo(120, 9)
    expect(len('A33', 'A36')).toBeCloseTo(100, 9)
    const back = d10.pieces.find((pc) => pc.id === 'back')
    expect(back?.internalLines.filter((l) => l.includes('dart')).length).toBe(4)
  })

  it('defines Delantero and Espalda with hip and knee notches', () => {
    expect(d10.pieces.map((pc) => pc.name).sort()).toEqual(['Delantero', 'Espalda'])
    for (const pc of d10.pieces) expect(pc.marks.filter((mk) => mk.kind === 'notch').length).toBe(3)
  })

  it('the jeans option narrows the hem to the jeans bottom width', () => {
    const r = measureWomenTrousers(draftWomenTrousers(m10, { bottom: 'jeans' }))
    expect(r.front.hem).toBe(m10.halfJeansBottomWidth - 10)
    expect(r.back.hem).toBe(m10.halfJeansBottomWidth + 10)
    expect(Math.abs(r.front.inseam - r.back.inseam)).toBeLessThan(1e-6)
    expect(Math.abs(r.front.outseam - r.back.outseam)).toBeLessThan(1e-6)
  })
})

const allFinite = (d: Draft) => {
  for (const [n, v] of Object.entries(d.points)) expect(Number.isFinite(v.x + v.y), n).toBe(true)
  for (const s of Object.values(d.segments)) {
    const pts = s.kind === 'line' ? [s.p0, s.p1] : [s.p0, s.p1, s.p2, s.p3]
    for (const v of pts) expect(Number.isFinite(v.x + v.y), s.id).toBe(true)
  }
}

describe.each(SIZES)('size %s', (size) => {
  const m = getMeasurements('co-women-industrial', size)
  const d = draftWomenTrousers(m)
  const r = measureWomenTrousers(d)

  it('front and back inseams are equal, and so are the outseams (±1 mm)', () => {
    expect(Math.abs(r.front.inseam - r.back.inseam)).toBeLessThan(1)
    expect(Math.abs(r.front.outseam - r.back.outseam)).toBeLessThan(1)
  })

  it('waist after darts = waist/4 + ease/4 per quarter', () => {
    const q = m.waist / 4 + E.waistEase / 4
    expect(r.front.waist).toBeCloseTo(q, 6)
    expect(r.back.waist).toBeCloseTo(q, 6)
  })

  it('hip = hip/4 + ease per quarter (front +0.5 cm, back +1.5 cm)', () => {
    expect(r.front.hip).toBeCloseTo(m.hip / 4 + E.frontHipEase, 9)
    expect(r.back.hip).toBeCloseTo(m.hip / 4 + E.backHipEase, 9)
  })

  it('knee and hem widths follow the method (back = front + 2 cm)', () => {
    expect(r.front.knee).toBeCloseTo((m.knee + E.kneeEase) / 2 - 10, 9)
    expect(r.back.knee).toBeCloseTo(r.front.knee + 20, 9)
    expect(r.front.hem).toBeCloseTo(m.halfTrouserBottomWidth - 10, 9)
    expect(r.back.hem).toBeCloseTo(r.front.hem + 20, 9)
  })

  it('lines from the table: crotch = body rise + 1 cm, knee, hem; leg wider than the thigh', () => {
    expect(d.points.A1.y).toBe(m.bodyRise + 10)
    expect(d.points.A2.y).toBe(m.hipDepth)
    expect(d.points.A3.y).toBe(m.waistToKnee)
    expect(d.points.A4.y).toBe(m.trouserLength)
    expect(r.front.crotchLineWidth + r.back.crotchLineWidth - m.thigh).toBeGreaterThan(50)
    expect(d.points.A26.y - d.points.A25.y).toBeGreaterThan(0)
  })

  it('has finite points and closed, non self-intersecting outlines', () => {
    allFinite(d)
    for (const pc of d.pieces) {
      const p = piecePath(d, pc.id)
      expect(p.closed).toBe(true)
      expect(isContinuous(p, 1e-6), pc.id).toBe(true)
      expect(pathSelfIntersections(p, 0.01), pc.id).toEqual([])
    }
  })

  it('keeps the same point names and segment ids as size 10', () => {
    expect(Object.keys(d.points).sort()).toEqual(Object.keys(d10.points).sort())
    expect(Object.keys(d.segments).sort()).toEqual(Object.keys(d10.segments).sort())
  })
})

describe('registry entry', () => {
  it('drafts "women-trousers" with its bottom option and cuts each leg twice', () => {
    const block = getBlock('women-trousers')
    expect(block.label).toBe('Pantalón base mujer')
    expect(defaultBlockOptions(block)).toEqual({ bottom: 'straight' })
    expect(pieceCut(block, 'front')).toEqual({ count: 2, material: 'Tela' })
    expect(pieceCut(block, 'back')).toEqual({ count: 2, material: 'Tela' })
    const jeans = measureWomenTrousers(draftBlock(block, '10', { bottom: 'jeans' }))
    expect(jeans.front.hem).toBe(180)
    expect(measureWomenTrousers(draftBlock(block, '10')).front.hem).toBe(215)
  })
})
