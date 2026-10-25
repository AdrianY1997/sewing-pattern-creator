import { describe, expect, it } from 'vitest'
import {
  bezierTangent,
  cross,
  isContinuous,
  normalize,
  pathSelfIntersections,
  piecePath,
  type CubicBezier,
  type Draft,
  type Vec,
} from '../core'
import { getMeasurements, getTable, type WomenSize } from '../data'
import {
  WOMEN_SLEEVE_DEFAULTS,
  WOMEN_SLEEVE_SEAMS,
  draftWomenSleeve,
  measureWomenSleeve,
  womenBodiceArmhole,
} from './womenSleeve'

const SIZES = getTable('co-women-industrial').sizes.map((s) => s.id) as WomenSize[]
const m10 = getMeasurements('co-women-industrial', '10')
const d10 = draftWomenSleeve(m10)
const r10 = measureWomenSleeve(d10)
const arm10 = womenBodiceArmhole(m10)

const cubicSeg = (d: Draft, id: string): CubicBezier => {
  const s = d.segments[id]
  if (!s || s.kind !== 'cubic') throw new Error(`${id} is not a cubic`)
  return s
}
/** |sin| of the angle between two directions (0 = parallel). */
const sinAngle = (a: Vec, b: Vec) => Math.abs(cross(normalize(a), normalize(b)))

describe('draftWomenSleeve — size 10 key points (docs/blocks/women-sleeve.md §5)', () => {
  it('uses the bodice armholes of the same size', () => {
    expect(arm10.back).toBeCloseTo(203.42, 1)
    expect(arm10.front).toBeCloseTo(224.84, 1)
    expect(arm10.backBelowNotch).toBeCloseTo(103.78, 1)
    expect(arm10.frontBelowNotch).toBeCloseTo(99.93, 1)
  })

  const expected: Record<string, [number, number]> = {
    B: [0, 0],
    B1: [0, 610],
    B2: [0, 123.31],
    B3: [170, 123.31],
    B4: [-170, 123.31],
    B5: [120, 610],
    B6: [-120, 610],
    B7: [-113.33, 82.21],
    B8: [-56.67, 41.1],
    B9: [-141.67, 102.76],
    B10: [101.19, 73.4],
    B11: [50.59, 36.7],
    B12: [135.59, 98.35],
    B13: [-68.41, 24.91],
    B14: [62.34, 20.51],
    B15: [-138.73, 106.8],
    B16: [126.79, 110.49],
    B17: [95.68, 62.74],
    B18: [-15.38, 1.15],
    B20: [-91.92, 53.68],
    B21: [-7.93, 0.31],
  }
  for (const [name, [x, y]] of Object.entries(expected))
    it(`${name} = (${x}, ${y}) mm`, () => {
      const p = d10.points[name]
      expect(p, name).toBeDefined()
      expect(p.x).toBeCloseTo(x, 1)
      expect(p.y).toBeCloseTo(y, 1)
    })

  it('cap = armholes + 1.5 cm embebido, split evenly at the shoulder notch', () => {
    expect(r10.cap.total).toBeCloseTo(203.42 + 224.84 + 15, 1)
    expect(r10.cap.back).toBeCloseTo(218.86, 1)
    expect(r10.cap.front).toBeCloseTo(224.4, 1)
    expect(r10.notches.shoulder).toBeCloseTo(arm10.back + 7.5, 1)
    expect(r10.cap.total - r10.notches.shoulder).toBeCloseTo(arm10.front + 7.5, 1)
  })

  it('control notches sit at the armhole below A20 / A29 + 0.35 cm', () => {
    expect(r10.notches.back).toBeCloseTo(arm10.backBelowNotch + 3.5, 1)
    expect(r10.notches.front).toBeCloseTo(arm10.frontBelowNotch + 3.5, 1)
  })

  it('bicep, wrist and cap height', () => {
    expect(r10.bicepWidth).toBe(340)
    expect(r10.wristWidth).toBe(240)
    expect(r10.capHeight).toBeCloseTo(123.31, 1)
  })
})

describe('draftWomenSleeve — construction', () => {
  it('the cap is horizontal at the underarm points and at the top', () => {
    const [b0, , , b3] = WOMEN_SLEEVE_SEAMS.capBack.map((id) => cubicSeg(d10, id))
    const [f0, , , f3] = WOMEN_SLEEVE_SEAMS.capFront.map((id) => cubicSeg(d10, id))
    for (const [c, t] of [
      [b0, 0],
      [b3, 1],
      [f0, 0],
      [f3, 1],
    ] as const)
      expect(sinAngle(bezierTangent(c, t), { x: 1, y: 0 })).toBeLessThan(1e-9)
  })

  it('the cap passes through the method control points', () => {
    const p = d10.points
    expect(cubicSeg(d10, 'sleeve.capBack.0').p3).toEqual(p.B15)
    expect(cubicSeg(d10, 'sleeve.capBack.1').p3).toEqual(p.B7)
    expect(cubicSeg(d10, 'sleeve.capBack.2').p3).toEqual(p.B13)
    expect(cubicSeg(d10, 'sleeve.capFront.0').p3).toEqual(p.B14)
    expect(cubicSeg(d10, 'sleeve.capFront.1').p3).toEqual(p.B10)
    expect(cubicSeg(d10, 'sleeve.capFront.2').p3).toEqual(p.B16)
  })

  it('has one piece "Manga" with grainline and front/back/shoulder notches', () => {
    expect(d10.pieces.map((pc) => pc.name)).toEqual(['Manga'])
    const [pc] = d10.pieces
    expect(pc.internalLines).toContain('sleeve.grain')
    expect(pc.marks.find((mk) => mk.kind === 'grainline')?.data?.segment).toBe('sleeve.grain')
    const notch = (id: string) => pc.marks.find((mk) => mk.id === id)
    expect(notch('sleeve.notch.front')?.data?.count).toBe(1)
    expect(notch('sleeve.notch.back')?.data?.count).toBe(2)
    expect(notch('sleeve.notch.shoulder')?.at).toEqual(d10.points.B21)
    expect(notch('sleeve.notch.front')?.at).toEqual(d10.points.B17)
    expect(notch('sleeve.notch.back')?.at).toEqual(d10.points.B20)
  })

  it('options change the draft (embebido, bicep ease, explicit armhole)', () => {
    const r30 = measureWomenSleeve(draftWomenSleeve(m10, { capEase: 30 }))
    expect(r30.cap.total).toBeCloseTo(arm10.back + arm10.front + 30, 2)
    expect(r30.capHeight).toBeGreaterThan(r10.capHeight)
    expect(measureWomenSleeve(draftWomenSleeve(m10, { bicepEase: 60 })).bicepWidth).toBe(360)
    const armhole = { back: 200, front: 220, backBelowNotch: 100, frontBelowNotch: 100 }
    expect(measureWomenSleeve(draftWomenSleeve(m10, { armhole })).cap.total).toBeCloseTo(435, 2)
  })
})

describe.each(SIZES)('size %s', (size) => {
  const m = getMeasurements('co-women-industrial', size)
  const arm = womenBodiceArmhole(m)
  describe.each([15, 30, 42])('embebido %i mm', (capEase) => {
    const d = draftWomenSleeve(m, { capEase })
    const r = measureWomenSleeve(d)

    it('cap length = back + front armhole + embebido (±3 mm)', () => {
      expect(Math.abs(r.cap.total - (arm.back + arm.front + capEase))).toBeLessThanOrEqual(3)
    })

    it('underarm seams are equal; bicep and wrist have their ease', () => {
      expect(r.underarm.front).toBeCloseTo(r.underarm.back, 9)
      expect(r.bicepWidth).toBeGreaterThanOrEqual(m.upperArm + WOMEN_SLEEVE_DEFAULTS.bicepEase)
      // Wrist: the method's opening (bicep − 10 cm) is at least the wrist + 2 cm (lesson example).
      expect(r.wristWidth).toBeGreaterThanOrEqual(m.wrist + 20)
    })

    it('notches: back < shoulder, ease split evenly front/back', () => {
      expect(r.notches.back).toBeLessThan(r.notches.shoulder)
      expect(r.notches.shoulder - arm.back).toBeCloseTo(capEase / 2, 1)
      expect(r.notches.front).toBeLessThan(r.cap.total - r.notches.shoulder)
    })

    it('has finite points and a closed, non self-intersecting outline', () => {
      for (const [n, v] of Object.entries(d.points))
        expect(Number.isFinite(v.x + v.y), n).toBe(true)
      for (const s of Object.values(d.segments)) {
        const pts = s.kind === 'line' ? [s.p0, s.p1] : [s.p0, s.p1, s.p2, s.p3]
        for (const v of pts) expect(Number.isFinite(v.x + v.y), s.id).toBe(true)
      }
      const p = piecePath(d, 'sleeve')
      expect(p.closed).toBe(true)
      expect(isContinuous(p, 1e-6)).toBe(true)
      expect(pathSelfIntersections(p, 0.01)).toEqual([])
    })

    it('keeps the same point names and segment ids as size 10', () => {
      expect(Object.keys(d.points).sort()).toEqual(Object.keys(d10.points).sort())
      expect(Object.keys(d.segments).sort()).toEqual(Object.keys(d10.segments).sort())
    })
  })
})
