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
import { getMeasurements, getTable, type MenSize } from '../data'
import {
  MEN_BODICE_CONSTANTS,
  MEN_BODICE_DEFAULTS,
  draftMenBodice,
  measureMenBodice,
  type MenBodiceOptionsInput,
} from './menBodice'
import { defaultBlockOptions, draftBlock, getBlock } from './registry'

const SIZES = getTable('es-men-easd').sizes.map((s) => s.id) as MenSize[]
const m48 = getMeasurements('es-men-easd', '48')
const d48 = draftMenBodice(m48)

const cubicSeg = (d: Draft, id: string): CubicBezier => {
  const s = d.segments[id]
  if (!s || s.kind !== 'cubic') throw new Error(`${id} is not a cubic`)
  return s
}
const dir = (a: Vec, b: Vec) => normalize(sub(b, a))
/** |sin| of the angle between two directions (0 = parallel). */
const sinAngle = (a: Vec, b: Vec) => Math.abs(cross(normalize(a), normalize(b)))

describe('draftMenBodice — size 48 key points (docs/blocks/men-bodice.md §5)', () => {
  const expected: Record<string, [number, number]> = {
    A: [0, 0],
    A1: [560, 0],
    B: [0, 270],
    C: [0, 435],
    D: [0, 595],
    E: [0, 755],
    E1: [560, 755],
    F: [290, 270],
    G: [290, 435],
    I: [290, 755],
    J: [220, 270],
    K: [360, 270],
    L: [80, 0],
    M: [80, -30],
    N: [480, 0],
    O: [560, 80],
    P: [220, 17.6],
    Q: [228.8, 22.35],
    R: [332.44, 55.73],
    S: [220, 180],
    T: [360, 180],
    U: [241.21, 248.79],
    V: [342.32, 252.32],
    X: [295, 270],
    Y: [285, 270],
    Z: [280.62, 39.04],
    Z1: [280.62, 270],
    A2: [0, 72],
    A3: [218.09, 72],
    A4: [490.12, 21.83],
    A5: [340.32, 78.42],
  }
  for (const [name, [x, y]] of Object.entries(expected))
    it(`${name} = (${x}, ${y}) mm`, () => {
      const p = d48.points[name]
      expect(p, name).toBeDefined()
      expect(p.x).toBeCloseTo(x, 1)
      expect(p.y).toBeCloseTo(y, 1)
    })

  it('back shoulder point is 1 cm along the back arc past the back width line', () => {
    const p = d48.points
    expect(distance(p.C, p.Q)).toBeCloseTo(distance(p.C, p.M), 9)
    expect(distance(p.C, p.P)).toBeCloseTo(distance(p.C, p.M), 9)
    const r = distance(p.C, p.M)
    const arc = r * Math.acos(dot(normalize(sub(p.P, p.C)), normalize(sub(p.Q, p.C))))
    expect(arc).toBeCloseTo(MEN_BODICE_CONSTANTS.shoulderExtension, 6)
  })

  it('front shoulder point is on the CF arc, with the back shoulder length', () => {
    const p = d48.points
    expect(distance(p.C1, p.R)).toBeCloseTo(distance(p.C1, p.N), 9)
    expect(distance(p.N, p.R)).toBeCloseTo(distance(p.M, p.Q), 9)
  })

  it('back yoke line is (P/10)+(P/20) below the nape and the front one P/20 from the shoulder', () => {
    const p = d48.points
    expect(p.A2.y).toBeCloseTo(m48.chest / 10 + m48.chest / 20, 9)
    expect(p.A3.y).toBeCloseTo(p.A2.y, 6)
    const sh = dir(p.N, p.R)
    for (const q of [p.A4, p.A5])
      expect(Math.abs(cross(sh, sub(q, p.N)))).toBeCloseTo(m48.chest / 20, 6)
  })
})

describe('draftMenBodice — seams and widths (size 48)', () => {
  const r = measureMenBodice(d48)

  it('chest width per half = chest (half measure)/2 + ease/2, ± the side seam shift', () => {
    const e = MEN_BODICE_DEFAULTS.ease.chest
    const s = MEN_BODICE_DEFAULTS.sideSeamShift
    expect(r.chestWidth.back + r.chestWidth.front).toBeCloseTo(m48.chest + e, 9)
    expect((r.chestWidth.back + r.chestWidth.front) / 2).toBeCloseTo(m48.chest / 2 + e / 2, 9)
    expect(r.chestWidth.back).toBeCloseTo(m48.chest / 2 + e / 2 + s, 9)
    expect(r.chestWidth.front).toBeCloseTo(m48.chest / 2 + e / 2 - s, 9)
    expect(r.chestWidth.back).toBe(290)
    expect(r.chestWidth.front).toBe(270)
  })

  it('side seams are equal (both cross the side line by the same 0.5 cm)', () => {
    expect(Math.abs(r.sideSeam.front - r.sideSeam.back)).toBeLessThan(1)
    expect(r.sideSeam.back).toBeCloseTo(485.08, 1)
  })

  it('shoulder seams are equal (the method copies the back shoulder to the front)', () => {
    expect(r.shoulder.front).toBeCloseTo(r.shoulder.back, 9)
    expect(r.shoulder.back).toBeCloseTo(157.74, 1)
  })

  it('reports the armhole lengths and the profundidad de sisa (PS)', () => {
    expect(r.armhole.back).toBeCloseTo(291.92, 1)
    expect(r.armhole.front).toBeCloseTo(266.18, 1)
    expect(r.armholeDepth).toBeCloseTo(115.48, 1)
  })

  it('box lines use the EASD measurements plus the method ease', () => {
    const p = d48.points
    expect(p.B.y).toBe(m48.armholeDepth + 40)
    expect(p.C.y).toBe(m48.waistLength)
    expect(p.D.y).toBe(m48.waistLength + m48.hipDepth)
    expect(p.E.y).toBe(m48.shirtLength)
    expect(p.J.x).toBe(m48.halfBackWidth + 5)
    expect(p.A1.x - p.K.x).toBe(m48.halfChestWidth + 10)
    expect(p.L.x).toBe(m48.neckRadius)
    expect(p.A1.x - p.N.x).toBe(m48.neckRadius)
    expect(p.O.y).toBe(m48.neckRadius)
    expect(-p.M.y).toBe(m48.neckRadius / 2 - 10)
  })
})

describe('draftMenBodice — curve tangency', () => {
  const p = d48.points
  it('necklines are perpendicular to CB/CF and to the shoulder', () => {
    const bn = cubicSeg(d48, 'back.neck')
    expect(sinAngle(bezierTangent(bn, 0), { x: 1, y: 0 })).toBeLessThan(1e-9)
    expect(Math.abs(dot(bezierTangent(bn, 1), dir(p.M, p.Q)))).toBeLessThan(1e-9)
    const fn = cubicSeg(d48, 'front.neck')
    expect(sinAngle(bezierTangent(fn, 1), { x: 1, y: 0 })).toBeLessThan(1e-9)
    expect(Math.abs(dot(bezierTangent(fn, 0), dir(p.N, p.R)))).toBeLessThan(1e-9)
  })
  it('armholes are perpendicular to the shoulder and to the side seam', () => {
    expect(
      Math.abs(dot(bezierTangent(cubicSeg(d48, 'back.armhole.0'), 0), dir(p.M, p.Q))),
    ).toBeLessThan(1e-9)
    expect(
      Math.abs(dot(bezierTangent(cubicSeg(d48, 'back.armhole.2'), 1), dir(p.X, p.G))),
    ).toBeLessThan(1e-9)
    expect(
      Math.abs(dot(bezierTangent(cubicSeg(d48, 'front.armhole.0'), 0), dir(p.N, p.R))),
    ).toBeLessThan(1e-9)
    expect(
      Math.abs(dot(bezierTangent(cubicSeg(d48, 'front.armhole.2'), 1), dir(p.Y, p.G))),
    ).toBeLessThan(1e-9)
  })
  it('armholes pass through the third points and the bisector points', () => {
    expect(cubicSeg(d48, 'back.armhole.0').p3).toEqual(p.S)
    expect(cubicSeg(d48, 'back.armhole.1').p3).toEqual(p.U)
    expect(cubicSeg(d48, 'front.armhole.0').p3).toEqual(p.T)
    expect(cubicSeg(d48, 'front.armhole.1').p3).toEqual(p.V)
  })
})

describe('draftMenBodice — pieces', () => {
  it('defines Espalda and Delantero with yoke lines, grainlines and armhole notches', () => {
    expect(d48.pieces.map((pc) => pc.name).sort()).toEqual(['Delantero', 'Espalda'])
    const back = d48.pieces.find((pc) => pc.id === 'back')!
    const front = d48.pieces.find((pc) => pc.id === 'front')!
    expect(back.internalLines).toEqual(
      expect.arrayContaining(['back.yoke', 'back.waistLine', 'back.hipLine', 'back.grain']),
    )
    expect(front.internalLines).toEqual(expect.arrayContaining(['front.yoke', 'front.grain']))
    for (const pc of [back, front]) {
      expect(pc.marks.some((mk) => mk.kind === 'grainline')).toBe(true)
      const armholeIds = pc.outline.map((o) => o.segment).filter((id) => /armhole/.test(id))
      expect(armholeIds).toHaveLength(3)
    }
    expect(back.marks.find((mk) => mk.kind === 'notch')?.at).toEqual(d48.points.S)
    expect(front.marks.find((mk) => mk.kind === 'notch')?.at).toEqual(d48.points.T)
  })

  it('hip length ends at the hip line', () => {
    const d = draftMenBodice(m48, { length: 'hip' })
    expect(d.points.E.y).toBe(595)
    expect(d.segments['back.hipLine']).toBeUndefined()
    const r = measureMenBodice(d)
    expect(Math.abs(r.sideSeam.front - r.sideSeam.back)).toBeLessThan(1)
  })

  it('is registered as "men-bodice" for the es-men-easd table', () => {
    const block = getBlock('men-bodice')
    expect(block.system).toBe('es-men-easd')
    expect(block.sex).toBe('male')
    expect(block.defaultSize).toBe('48')
    expect(defaultBlockOptions(block)).toEqual({ length: 'shirt' })
    expect(draftBlock(block, '48')).toEqual(d48)
    expect(draftBlock(block, '48', { length: 'hip' }).points.E.y).toBe(595)
  })
})

describe.each(SIZES)('size %s', (size) => {
  const m = getMeasurements('es-men-easd', size)
  describe.each<MenBodiceOptionsInput['length']>(['shirt', 'hip'])('length %s', (len) => {
    const d = draftMenBodice(m, { length: len })

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

    it('matches side seams and shoulders; chest = chest/2 + ease/2 per half', () => {
      const r = measureMenBodice(d)
      expect(Math.abs(r.sideSeam.front - r.sideSeam.back)).toBeLessThan(1)
      expect(r.shoulder.front).toBeCloseTo(r.shoulder.back, 9)
      const half = m.chest / 2 + MEN_BODICE_DEFAULTS.ease.chest / 2
      expect((r.chestWidth.back + r.chestWidth.front) / 2).toBeCloseTo(half, 9)
      // The box keeps ease over the waist and the hip (straight shirt, no waist suppression).
      expect(d.points.A1.x).toBeGreaterThan(m.waist)
      expect(d.points.A1.x).toBeGreaterThan(m.hip)
    })

    it('keeps the same point names and segment ids as size 48', () => {
      const ref = draftMenBodice(m48, { length: len })
      expect(Object.keys(d.points).sort()).toEqual(Object.keys(ref.points).sort())
      expect(Object.keys(d.segments).sort()).toEqual(Object.keys(ref.segments).sort())
    })
  })
})
