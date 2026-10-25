import { describe, expect, it } from 'vitest'
import {
  bezierTangent,
  cross,
  distance,
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
import {
  WOMEN_BODICE_DEFAULTS,
  draftWomenBodice,
  measureWomenBodice,
  type WomenBodiceOptionsInput,
} from './womenBodice'

const SIZES = getTable('co-women-industrial').sizes.map((s) => s.id) as WomenSize[]
const m10 = getMeasurements('co-women-industrial', '10')
const d10 = draftWomenBodice(m10)

const cubicSeg = (d: Draft, id: string): CubicBezier => {
  const s = d.segments[id]
  if (!s || s.kind !== 'cubic') throw new Error(`${id} is not a cubic`)
  return s
}
const dir = (a: Vec, b: Vec) => normalize(sub(b, a))
/** |sin| of the angle between two directions (0 = parallel). */
const sinAngle = (a: Vec, b: Vec) => Math.abs(cross(normalize(a), normalize(b)))

describe('draftWomenBodice — size 10 key points (docs/blocks/women-bodice.md §5)', () => {
  const expected: Record<string, [number, number]> = {
    A: [0, 0],
    A1: [470, 0],
    A2: [0, 425],
    A3: [0, 625],
    A4: [470, 425],
    A6: [68.33, 0],
    A7: [0, 22.78],
    A9: [0, 213.33],
    A11: [183.0, 35.38],
    A12: [180.5, 213.33],
    A13: [300.5, 213.33],
    A16: [233.5, 213.33],
    A19: [180.5, 35.38],
    A20: [180.5, 134.01],
    A21: [199.59, 194.24],
    A22: [470, -20],
    A23: [401.67, -20],
    A24: [470, 58.33],
    A26: [286.54, 13.86],
    A27: [233.5, 193.33],
    A29: [300.5, 137.35],
    A30: [285.65, 178.48],
    A31: [203.5, 425],
    A32: [263.5, 425],
    A33: [370, 213.33],
    A34: [370, 238.06],
    A35: [239.29, 238.06],
    A36: [238.01, 228.15],
    A38: [238.02, 248.18],
    A40: [237.64, 238.16],
    A41: [101.75, 425],
    A44: [101.75, 233.33],
    A46: [87.5, 425],
    A47: [116, 425],
    A50: [370, 268.06],
    A52: [354.25, 425],
    A53: [385.75, 425],
    A45: [101.75, 575],
    A51: [370, 575],
    A54: [243.5, 625],
    A55: [223.5, 625],
  }
  for (const [name, [x, y]] of Object.entries(expected))
    it(`${name} = (${x}, ${y}) mm`, () => {
      const p = d10.points[name]
      expect(p, name).toBeDefined()
      expect(p.x).toBeCloseTo(x, 1)
      expect(p.y).toBeCloseTo(y, 1)
    })

  it('A11 and A26 lie on both construction arcs', () => {
    const p = d10.points
    expect(distance(p.A6, p.A11)).toBeCloseTo(m10.shoulderLength, 9)
    expect(distance(p.A2, p.A11)).toBeCloseTo(distance(p.A2, p.A6), 9)
    expect(distance(p.A23, p.A26)).toBeCloseTo(m10.shoulderLength, 9)
    expect(distance(p.A4, p.A26)).toBeCloseTo(distance(p.A4, p.A23), 9)
  })

  it('bust point is at "alto de pecho" from the front neck point', () => {
    expect(distance(d10.points.A23, d10.points.A34)).toBeCloseTo(m10.bustDepth, 9)
  })
})

describe('draftWomenBodice — seams (size 10)', () => {
  const r = measureWomenBodice(d10)

  it('front and back side seams match within 1 mm (bust dart excluded)', () => {
    expect(Math.abs(r.sideSeam.front - r.sideSeam.back)).toBeLessThan(1)
  })

  it('shoulder seams are equal (the method has no back shoulder ease)', () => {
    expect(r.shoulder.front).toBeCloseTo(m10.shoulderLength, 9)
    expect(r.shoulder.back).toBeCloseTo(m10.shoulderLength, 9)
  })

  it('waist after darts = waist/4 + ease/4 per quarter', () => {
    const q = m10.waist / 4 + WOMEN_BODICE_DEFAULTS.ease.waist / 4
    expect(q).toBe(175)
    expect(r.waist.front).toBeCloseTo(q, 9)
    expect(r.waist.back).toBeCloseTo(q, 9)
  })

  it('bust dart takes front − back waist length at the side, with equal legs', () => {
    const p = d10.points
    expect(r.darts.bust).toBeCloseTo(20, 0)
    expect(distance(p.A34, p.A36)).toBeCloseTo(distance(p.A34, p.A38), 9)
  })

  it('hip line = hip/2 + ease/2 across front and back', () => {
    const p = d10.points
    const backHip = p.A54.x - p.A3.x
    const frontHip = p.A5.x - p.A55.x
    expect(backHip + frontHip).toBeCloseTo(m10.hip / 2 + WOMEN_BODICE_DEFAULTS.ease.hip / 2, 9)
  })

  it('reports plausible armhole lengths', () => {
    expect(r.armhole.back).toBeCloseTo(203.42, 1)
    expect(r.armhole.front).toBeCloseTo(224.84, 1)
  })
})

describe('draftWomenBodice — curve tangency', () => {
  const p = d10.points
  it('back neckline is perpendicular to CB and to the shoulder', () => {
    const c = cubicSeg(d10, 'back.neck')
    expect(sinAngle(bezierTangent(c, 0), { x: 1, y: 0 })).toBeLessThan(1e-9)
    expect(Math.abs(dot(bezierTangent(c, 1), dir(p.A6, p.A11)))).toBeLessThan(1e-9)
  })
  it('front neckline is perpendicular to CF and to the shoulder', () => {
    const c = cubicSeg(d10, 'front.neck')
    expect(sinAngle(bezierTangent(c, 1), { x: 1, y: 0 })).toBeLessThan(1e-9)
    expect(Math.abs(dot(bezierTangent(c, 0), dir(p.A23, p.A26)))).toBeLessThan(1e-9)
  })
  it('armholes are perpendicular to the shoulder and to the side seam', () => {
    const b0 = cubicSeg(d10, 'back.armhole.0')
    const b2 = cubicSeg(d10, 'back.armhole.2')
    expect(Math.abs(dot(bezierTangent(b0, 0), dir(p.A6, p.A11)))).toBeLessThan(1e-9)
    expect(Math.abs(dot(bezierTangent(b2, 1), dir(p.A16, p.A31)))).toBeLessThan(1e-9)
    const f0 = cubicSeg(d10, 'front.armhole.0')
    const f2 = cubicSeg(d10, 'front.armhole.2')
    expect(Math.abs(dot(bezierTangent(f0, 0), dir(p.A23, p.A26)))).toBeLessThan(1e-9)
    expect(Math.abs(dot(bezierTangent(f2, 1), dir(p.A27, p.A36)))).toBeLessThan(1e-9)
  })
  it('armholes pass through the method control points', () => {
    expect(cubicSeg(d10, 'back.armhole.0').p3).toEqual(p.A20)
    expect(cubicSeg(d10, 'back.armhole.1').p3).toEqual(p.A21)
    expect(cubicSeg(d10, 'front.armhole.0').p3).toEqual(p.A29)
    expect(cubicSeg(d10, 'front.armhole.1').p3).toEqual(p.A30)
  })
  it('hip curves are vertical at the hip line', () => {
    for (const id of ['back.sideHip', 'front.sideHip'])
      expect(sinAngle(bezierTangent(cubicSeg(d10, id), 1), { x: 0, y: 1 })).toBeLessThan(1e-9)
  })
})

describe('draftWomenBodice — pieces', () => {
  it('defines Delantero and Espalda with outline, internal lines and grainline', () => {
    const names = d10.pieces.map((pc) => pc.name).sort()
    expect(names).toEqual(['Delantero', 'Espalda'])
    for (const pc of d10.pieces) {
      expect(pc.internalLines).toContain(`${pc.id}.grain`)
      expect(pc.marks.some((mk) => mk.kind === 'grainline')).toBe(true)
    }
    const front = d10.pieces.find((pc) => pc.id === 'front')!
    expect(front.internalLines).toEqual(
      expect.arrayContaining(['front.bustDart.upper', 'front.bustDart.lower', 'front.waist']),
    )
    expect(front.marks.find((mk) => mk.kind === 'bustPoint')?.at).toEqual(d10.points.A34)
  })

  it('waist length stops at the waist with the waistline as outline', () => {
    const d = draftWomenBodice(m10, { length: 'waist' })
    const back = d.pieces.find((pc) => pc.id === 'back')!
    expect(back.outline.map((r) => r.segment)).toContain('back.waist')
    expect(d.points.A54).toBeUndefined()
    const r = measureWomenBodice(d)
    expect(Math.abs(r.sideSeam.front - r.sideSeam.back)).toBeLessThan(1)
    expect(r.waist.back).toBeCloseTo(175, 9)
  })

  it('options change the draft (ease, armhole formula)', () => {
    const wide = draftWomenBodice(m10, { ease: { bust: 60 } })
    expect(wide.points.A1.x).toBeCloseTo(490, 9)
    const alt = draftWomenBodice(m10, { armholeDepth: 'bust/10+10.5+neck/18' })
    expect(alt.points.A9.y).toBeCloseTo(92 + 105 + 380 / 18, 9)
  })
})

describe.each(SIZES)('size %s', (size) => {
  const m = getMeasurements('co-women-industrial', size)
  describe.each<WomenBodiceOptionsInput['length']>(['hip', 'waist'])('length %s', (len) => {
    const d = draftWomenBodice(m, { length: len })

    it('has finite points and segments', () => {
      for (const [n, v] of Object.entries(d.points)) {
        expect(Number.isFinite(v.x), n).toBe(true)
        expect(Number.isFinite(v.y), n).toBe(true)
      }
      for (const s of Object.values(d.segments)) {
        const pts = s.kind === 'line' ? [s.p0, s.p1] : [s.p0, s.p1, s.p2, s.p3]
        for (const v of pts) expect(Number.isFinite(v.x + v.y), s.id).toBe(true)
      }
    })

    it('has closed, continuous, non self-intersecting outlines', () => {
      for (const pc of d.pieces) {
        const path = piecePath(d, pc.id)
        expect(path.closed).toBe(true)
        expect(isContinuous(path, 1e-6), pc.id).toBe(true)
        expect(pathSelfIntersections(path, 0.01), pc.id).toEqual([])
      }
    })

    it('matches side seams, shoulders and quarter waist', () => {
      const r = measureWomenBodice(d)
      expect(Math.abs(r.sideSeam.front - r.sideSeam.back)).toBeLessThan(1)
      expect(r.shoulder.front).toBeCloseTo(r.shoulder.back, 9)
      const q = m.waist / 4 + WOMEN_BODICE_DEFAULTS.ease.waist / 4
      expect(r.waist.front).toBeCloseTo(q, 9)
      expect(r.waist.back).toBeCloseTo(q, 9)
      expect(r.darts.backWaist).toBeGreaterThan(0)
      expect(r.darts.frontWaist).toBeGreaterThan(0)
    })

    it('keeps the same point names and segment ids as size 10', () => {
      const ref = draftWomenBodice(m10, { length: len })
      expect(Object.keys(d.points).sort()).toEqual(Object.keys(ref.points).sort())
      expect(Object.keys(d.segments).sort()).toEqual(Object.keys(ref.segments).sort())
    })
  })
})
