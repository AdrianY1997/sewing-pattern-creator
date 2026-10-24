import { describe, expect, it } from 'vitest'
import { isContinuous, pathSelfIntersections, piecePath } from '../core'
import {
  getFullMeasurement,
  getMeasurementKind,
  getMeasurements,
  getTable,
  type MenSize,
} from '../data'
import { MEN_TROUSERS_DEFAULTS, draftMenTrousers, measureMenTrousers } from './menTrousers'
import { draftBlock, getBlock, pieceCut } from './registry'

const SIZES = getTable('es-men-easd').sizes.map((s) => s.id) as MenSize[]
const m48 = getMeasurements('es-men-easd', '48')
const d48 = draftMenTrousers(m48)
const r48 = measureMenTrousers(d48)
const E = MEN_TROUSERS_DEFAULTS

describe('draftMenTrousers — size 48 key points (docs/blocks/men-trousers.md §5)', () => {
  const expected: Record<string, [number, number]> = {
    A0: [0, 0],
    A1: [95, 0],
    A2: [95, 160],
    A3: [95, 215],
    A6: [-145, 160],
    A7: [85, 0],
    A8: [-115, 0],
    A9: [-145, 215],
    A10: [145, 215],
    A11: [120, 187.5],
    A12: [111.67, 196.67],
    A13: [0, 215],
    A14: [0, 500],
    A15: [0, 1060],
    A16: [-130, 1060],
    A17: [130, 1060],
    A18: [-135, 500],
    A19: [135, 500],
    A20: [95, 160],
    A21: [45, 0],
    A22: [33.07, -38.18],
    A23: [-183.9, -1.76],
    A24: [-185, 160],
    A25: [-155, 500],
    A26: [-150, 1060],
    A27: [210, 215],
    A28: [155, 500],
    A29: [150, 1060],
    A30: [207.98, 225.49],
    A31: [104.94, 204.07],
    A32: [-75.41, -19.97],
    A33: [-62.17, 58.93],
  }
  for (const [name, [x, y]] of Object.entries(expected))
    it(`${name} = (${x}, ${y}) mm`, () => {
      const p = d48.points[name]
      expect(p, name).toBeDefined()
      expect(p.x).toBeCloseTo(x, 1)
      expect(p.y).toBeCloseTo(y, 1)
    })

  it('seam lengths and widths', () => {
    expect(r48.front.inseam).toBeCloseTo(845.21, 1)
    expect(r48.back.inseam).toBeCloseTo(840.21, 1)
    expect(r48.front.outseam).toBeCloseTo(1063.35, 1)
    expect(r48.front.waist).toBe(200)
    expect(r48.back.waist).toBeCloseTo(200, 9)
    expect(r48.back.darts).toBeCloseTo(20, 9)
    expect(r48.front.hip).toBe(240)
    expect(r48.back.hip).toBe(280)
    expect(r48.front.knee).toBe(270)
    expect(r48.back.knee).toBe(310)
    expect(r48.front.hem).toBe(260)
    expect(r48.back.hem).toBe(300)
  })
})

describe('draftMenTrousers — construction', () => {
  const p = d48.points
  it('reads the EASD hip and waist as half measurements', () => {
    expect(getMeasurementKind('es-men-easd', 'hip')).toBe('half')
    expect(getMeasurementKind('es-men-easd', 'waist')).toBe('half')
    const hip = getFullMeasurement('es-men-easd', '48', 'hip')
    const waist = getFullMeasurement('es-men-easd', '48', 'waist')
    expect(hip).toBe(1000)
    expect(r48.front.hip + r48.back.hip).toBeCloseTo(hip / 2 + E.hipEase / 2, 9)
    expect(r48.front.waist + r48.back.waist).toBeCloseTo(waist / 2 + E.waistEase / 2, 9)
  })

  it('the back centre line passes through 21 and is raised to 22', () => {
    const cross =
      (p.A21.x - p.A20.x) * (p.A22.y - p.A20.y) - (p.A21.y - p.A20.y) * (p.A22.x - p.A20.x)
    expect(Math.abs(cross)).toBeLessThan(1e-6)
    expect(Math.hypot(p.A22.x - p.A21.x, p.A22.y - p.A21.y)).toBeCloseTo(40, 9)
  })

  it('the back crotch point lies on the line 28→27', () => {
    const c = (p.A27.x - p.A28.x) * (p.A30.y - p.A28.y) - (p.A27.y - p.A28.y) * (p.A30.x - p.A28.x)
    expect(Math.abs(c)).toBeLessThan(1e-6)
  })

  it('the grainline is the crease line on both pieces', () => {
    for (const pc of d48.pieces) {
      expect(pc.marks.find((mk) => mk.kind === 'grainline')?.data?.segment).toBe(`${pc.id}.grain`)
      const g = d48.segments[`${pc.id}.grain`]
      expect(g.kind === 'line' && g.p0.x === 0 && g.p1.x === 0).toBe(true)
    }
  })

  it('segment naming: crotch curves, inseams and outseams', () => {
    for (const pc of d48.pieces) {
      const ids = pc.outline.map((r) => r.segment)
      const crotch = ids.filter((id) => id.includes('crotch'))
      expect(crotch.length).toBe(2)
      for (const id of crotch) expect(d48.segments[id].kind).toBe('cubic')
      expect(ids.filter((id) => id.includes('inseam')).length).toBe(2)
      expect(ids.filter((id) => id.includes('outseam')).length).toBe(3)
    }
  })

  it('one back dart (2 cm × 8 cm) at the middle of the back waist, no front dart', () => {
    const len = (a: string, b: string) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y)
    expect(len('A34', 'A33')).toBeCloseTo(len('A35', 'A33'), 9)
    expect(len('A32', 'A33')).toBeCloseTo(80, 9)
    expect(len('A22', 'A32')).toBeCloseTo(len('A32', 'A23'), 9)
    expect(r48.front.darts).toBe(0)
    expect(d48.pieces.find((pc) => pc.id === 'front')?.internalLines).toEqual(['front.grain'])
  })
})

describe.each(SIZES)('size %s', (size) => {
  const m = getMeasurements('es-men-easd', size)
  const d = draftMenTrousers(m)
  const r = measureMenTrousers(d)
  const hipFull = getFullMeasurement('es-men-easd', size, 'hip')
  const waistFull = getFullMeasurement('es-men-easd', size, 'waist')

  it('back inseam = front inseam − 0.5 cm (method), outseams equal', () => {
    expect(r.front.inseam - r.back.inseam).toBeCloseTo(E.backInseamEase, 6)
    expect(Math.abs(r.front.outseam - r.back.outseam)).toBeLessThan(1)
  })

  it('waist after darts = full waist/4 + ease/4 per quarter', () => {
    expect(r.front.waist).toBeCloseTo(waistFull / 4 + E.waistEase / 4, 6)
    expect(r.back.waist).toBeCloseTo(waistFull / 4 + E.waistEase / 4, 6)
  })

  it('hip = full hip/4 + ease/4, with 2 cm moved from the front to the back', () => {
    expect(r.front.hip).toBeCloseTo(hipFull / 4 + E.hipEase / 4 - E.hipShift, 9)
    expect(r.back.hip).toBeCloseTo(hipFull / 4 + E.hipEase / 4 + E.hipShift, 9)
  })

  it('knee and hem: half widths each side of the crease, back 2 cm wider each side', () => {
    expect(r.front.knee).toBeCloseTo(2 * m.halfKneeWidth - 20, 9)
    expect(r.back.knee).toBeCloseTo(2 * m.halfKneeWidth + 20, 9)
    expect(r.front.hem).toBeCloseTo(2 * m.halfTrouserBottomWidth - 20, 9)
    expect(r.back.hem).toBeCloseTo(2 * m.halfTrouserBottomWidth + 20, 9)
  })

  it('lines from the table and a leg wider than the thigh', () => {
    expect(d.points.A2.y).toBe(m.hipDepth)
    expect(d.points.A3.y).toBe(m.crotchDepth)
    expect(d.points.A14.y).toBe(m.kneeLength)
    expect(d.points.A15.y).toBe(m.trouserLength)
    expect(r.front.crotchLineWidth + r.back.crotchLineWidth).toBeGreaterThan(m.thigh)
  })

  it('has finite points and closed, non self-intersecting outlines', () => {
    for (const [n, v] of Object.entries(d.points)) expect(Number.isFinite(v.x + v.y), n).toBe(true)
    for (const s of Object.values(d.segments)) {
      const pts = s.kind === 'line' ? [s.p0, s.p1] : [s.p0, s.p1, s.p2, s.p3]
      for (const v of pts) expect(Number.isFinite(v.x + v.y), s.id).toBe(true)
    }
    for (const pc of d.pieces) {
      const p = piecePath(d, pc.id)
      expect(p.closed).toBe(true)
      expect(isContinuous(p, 1e-6), pc.id).toBe(true)
      expect(pathSelfIntersections(p, 0.01), pc.id).toEqual([])
    }
  })

  it('keeps the same point names and segment ids as size 48', () => {
    expect(Object.keys(d.points).sort()).toEqual(Object.keys(d48.points).sort())
    expect(Object.keys(d.segments).sort()).toEqual(Object.keys(d48.segments).sort())
  })
})

describe('registry entry', () => {
  it('drafts "men-trousers" for EASD sizes and cuts each leg twice', () => {
    const block = getBlock('men-trousers')
    expect(block.label).toBe('Pantalón base hombre')
    expect(block.defaultSize).toBe('48')
    expect(pieceCut(block, 'back')).toEqual({ count: 2, material: 'Tela' })
    expect(draftBlock(block, '48').points.A30.x).toBeCloseTo(207.98, 1)
    expect(() => draftBlock(block, '10')).toThrow(/not in "es-men-easd"/)
  })
})
