import { describe, expect, it } from 'vitest'
import {
  bezierTangent,
  cross,
  dot,
  isContinuous,
  normalize,
  pathSelfIntersections,
  piecePath,
  sub,
  type CubicBezier,
  type Draft,
  type Vec,
} from '../core'
import { getMeasurements, getTable, type WomenSize } from '../data'
import { WOMEN_SKIRT_DEFAULTS, draftWomenSkirt, measureWomenSkirt } from './womenSkirt'

const SIZES = getTable('co-women-industrial').sizes.map((s) => s.id) as WomenSize[]
const m10 = getMeasurements('co-women-industrial', '10')
const d10 = draftWomenSkirt(m10)
const r10 = measureWomenSkirt(d10)
const E = WOMEN_SKIRT_DEFAULTS

const cubicSeg = (d: Draft, id: string): CubicBezier => {
  const s = d.segments[id]
  if (!s || s.kind !== 'cubic') throw new Error(`${id} is not a cubic`)
  return s
}
const sinAngle = (a: Vec, b: Vec) => Math.abs(cross(normalize(a), normalize(b)))

describe('draftWomenSkirt — size 10 key points (docs/blocks/women-skirt.md §5)', () => {
  const expected: Record<string, [number, number]> = {
    A: [0, 0],
    A1: [0, 590],
    A2: [0, 200],
    A3: [495, 200],
    A4: [495, 590],
    A5: [247.5, 200],
    A6: [495, 0],
    A7: [247.5, 590],
    A8: [247.5, 0],
    A9: [283.75, 0],
    A10: [211.25, 0],
    A11: [247.5, 180],
    A12: [247.5, -10],
    A13: [283.75, -10],
    A14: [211.25, -10],
    A15: [265.63, 90],
    A16: [229.38, 90],
    A17: [255.82, 88.03],
    A18: [239.18, 88.03],
    A19: [108.75, 200],
    A20: [108.75, 0],
    A21: [127.6, 0],
    A22: [89.9, 0],
    A23: [108.75, 160],
    A24: [0, 10],
    A25: [410.5, 0],
    A26: [410.5, 200],
    A27: [392.04, 0],
    A28: [428.96, 0],
    A29: [410.5, 120],
  }
  for (const [name, [x, y]] of Object.entries(expected))
    it(`${name} = (${x}, ${y}) mm`, () => {
      const p = d10.points[name]
      expect(p, name).toBeDefined()
      expect(p.x).toBeCloseTo(x, 1)
      expect(p.y).toBeCloseTo(y, 1)
    })

  it('dart widths and seam lengths', () => {
    expect(r10.darts.back).toBeCloseTo(37.71, 1)
    expect(r10.darts.front).toBeCloseTo(36.93, 1)
    expect(r10.sideSeam.back).toBeCloseTo(604.47, 1)
    expect(r10.waist.back).toBeCloseTo(175, 6)
    expect(r10.waist.front).toBeCloseTo(175, 6)
    expect(r10.hip.back).toBe(247.5)
    expect(r10.hip.front).toBe(247.5)
  })
})

describe('draftWomenSkirt — construction', () => {
  const p = d10.points
  it('waist leaves the side seam at a right angle and meets CB / CF at a right angle', () => {
    const fs = cubicSeg(d10, 'front.sideHip.0')
    const bs = cubicSeg(d10, 'back.sideHip.0')
    const fw = cubicSeg(d10, 'front.waist.0')
    const bw = cubicSeg(d10, 'back.waist.0')
    expect(Math.abs(dot(bezierTangent(fw, 0), bezierTangent(fs, 0)))).toBeLessThan(1e-9)
    expect(Math.abs(dot(bezierTangent(bw, 0), bezierTangent(bs, 0)))).toBeLessThan(1e-9)
    expect(sinAngle(bezierTangent(cubicSeg(d10, 'back.waist.1'), 1), { x: 1, y: 0 })).toBeLessThan(
      1e-9,
    )
    const fw1 = d10.segments['front.waist.1']
    expect(fw1.kind).toBe('line')
    expect(fw1.p0.y).toBe(fw1.kind === 'line' ? fw1.p1.y : NaN)
  })

  it('hip curve passes through A17 / A18 and is vertical where it meets the straight side', () => {
    expect(cubicSeg(d10, 'front.sideHip.0').p3).toEqual(p.A17)
    expect(cubicSeg(d10, 'back.sideHip.0').p3).toEqual(p.A18)
    for (const id of ['front.sideHip.1', 'back.sideHip.1'])
      expect(sinAngle(bezierTangent(cubicSeg(d10, id), 1), { x: 0, y: 1 })).toBeLessThan(1e-9)
  })

  it('dart legs are equal and the apexes are on the dart axes', () => {
    const len = (a: Vec, b: Vec) => Math.hypot(...Object.values(sub(a, b)))
    expect(len(p.A21, p.A23)).toBeCloseTo(len(p.A22, p.A23), 9)
    expect(len(p.A27, p.A29)).toBeCloseTo(len(p.A28, p.A29), 9)
    expect(p.A23.x).toBe(p.A20.x)
    expect(p.A29.x).toBe(p.A25.x)
  })

  it('defines Delantero and Espalda with darts, grainline and a hip notch', () => {
    expect(d10.pieces.map((pc) => pc.name).sort()).toEqual(['Delantero', 'Espalda'])
    for (const pc of d10.pieces) {
      expect(pc.internalLines).toEqual(
        expect.arrayContaining([`${pc.id}.dart.left`, `${pc.id}.dart.right`, `${pc.id}.grain`]),
      )
      expect(pc.marks.some((mk) => mk.kind === 'grainline')).toBe(true)
      expect(pc.marks.find((mk) => mk.kind === 'notch')?.at).toEqual(p.A5)
    }
  })

  it('the side seam shift option moves the side towards the front', () => {
    const d = draftWomenSkirt(m10, { sideSeamShift: 10 })
    const r = measureWomenSkirt(d)
    expect(r.hip.back).toBe(257.5)
    expect(r.hip.front).toBe(237.5)
    expect(r.waist.back).toBeCloseTo(175, 6)
    expect(r.waist.front).toBeCloseTo(175, 6)
    expect(r.sideSeam.front).toBeCloseTo(r.sideSeam.back, 9)
  })
})

describe.each(SIZES)('size %s', (size) => {
  const m = getMeasurements('co-women-industrial', size)
  const d = draftWomenSkirt(m)
  const r = measureWomenSkirt(d)

  it('front and back side seams are equal', () => {
    expect(Math.abs(r.sideSeam.front - r.sideSeam.back)).toBeLessThan(1e-6)
  })

  it('waist after darts = waist/4 + ease/4 per quarter', () => {
    const q = m.waist / 4 + E.waistEase / 4
    expect(r.waist.front).toBeCloseTo(q, 6)
    expect(r.waist.back).toBeCloseTo(q, 6)
    expect(r.darts.front).toBeGreaterThan(0)
    expect(r.darts.back).toBeGreaterThan(0)
  })

  it('hip = hip/4 + ease/4 per quarter, length from the table', () => {
    const q = m.hip / 4 + E.hipEase / 4
    expect(r.hip.front).toBeCloseTo(q, 9)
    expect(r.hip.back).toBeCloseTo(q, 9)
    expect(d.points.A2.y).toBe(m.hipDepth)
    expect(d.points.A1.y).toBe(m.skirtLength)
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

  it('keeps the same point names and segment ids as size 10', () => {
    expect(Object.keys(d.points).sort()).toEqual(Object.keys(d10.points).sort())
    expect(Object.keys(d.segments).sort()).toEqual(Object.keys(d10.segments).sort())
  })
})
