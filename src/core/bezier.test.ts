import { describe, expect, it } from 'vitest'
import {
  KAPPA,
  bezierBBox,
  bezierLength,
  bezierPoint,
  bezierPointAtLength,
  bezierTangent,
  catmullRom,
  cubic,
  curveWithTangents,
  flattenBezier,
  nearestOnBezier,
  smoothWithTangents,
  splitBezier,
  splitBezierAtLength,
  subBezier,
} from './bezier'
import { distance, dot, length, lerp, normalize, perp, scale, sub, vec, type Vec } from './vec'

/** Quadratic (0,0)-(50,100)-(100,0) elevated to a cubic: the parabola y = 2x − x²/50. */
const parabola = cubic(
  'par',
  vec(0, 0),
  lerp(vec(0, 0), vec(50, 100), 2 / 3),
  lerp(vec(100, 0), vec(50, 100), 2 / 3),
  vec(100, 0),
)
// ∫₀¹⁰⁰ √(1 + (2 − x/25)²) dx = 25·(2√5 + asinh 2)
const PARABOLA_LENGTH = 25 * (2 * Math.sqrt(5) + Math.asinh(2))

const quarter = cubic('q', vec(100, 0), vec(100, 100 * KAPPA), vec(100 * KAPPA, 100), vec(0, 100))

const expectParallel = (a: Vec, b: Vec, eps = 1e-9) => {
  const na = normalize(a)
  const nb = normalize(b)
  expect(dot(na, nb)).toBeGreaterThan(1 - eps)
}

describe('bezier arc length', () => {
  it('matches the closed-form parabola length within 0.001 mm', () => {
    expect(Math.abs(bezierLength(parabola) - PARABOLA_LENGTH)).toBeLessThan(1e-3)
  })
  it('is exact for a straight curve with uneven control points', () => {
    const b = cubic('s', vec(0, 0), vec(5, 0), vec(80, 0), vec(100, 0))
    expect(bezierLength(b)).toBeCloseTo(100, 6)
  })
  it('approximates a quarter circle (KAPPA arc) to within 0.03% of πr/2', () => {
    expect(bezierLength(quarter) / ((Math.PI * 100) / 2)).toBeCloseTo(1, 3)
  })
  it('handles partial ranges additively', () => {
    const total = bezierLength(parabola)
    expect(bezierLength(parabola, 0, 0.3) + bezierLength(parabola, 0.3, 1)).toBeCloseTo(total, 6)
  })
})

describe('point and tangent at arc length', () => {
  it('finds the apex of the symmetric parabola at half its length', () => {
    const s = bezierPointAtLength(parabola, PARABOLA_LENGTH / 2)
    expect(s.point.x).toBeCloseTo(50, 4)
    expect(s.point.y).toBeCloseTo(50, 4)
    expect(s.tangent.x).toBeCloseTo(1, 6)
    expect(s.tangent.y).toBeCloseTo(0, 6)
  })
  it('round-trips length → t → length', () => {
    for (const s of [0.1, 13.7, 80, 140]) {
      const { t } = bezierPointAtLength(parabola, s)
      expect(bezierLength(parabola, 0, t)).toBeCloseTo(s, 5)
    }
  })
  it('clamps outside the curve', () => {
    expect(bezierPointAtLength(parabola, -5).t).toBe(0)
    expect(bezierPointAtLength(parabola, 1e6).t).toBe(1)
  })
})

describe('split', () => {
  it('is continuous in position and tangent at the split point', () => {
    const [a, b] = splitBezier(parabola, 0.37)
    expect(a.p3).toEqual(b.p0)
    expect(distance(a.p3, bezierPoint(parabola, 0.37))).toBeLessThan(1e-9)
    expectParallel(sub(a.p3, a.p2), sub(b.p1, b.p0))
    expectParallel(bezierTangent(a, 1), bezierTangent(parabola, 0.37))
    expect(a.id).toBe('par.0')
    expect(b.id).toBe('par.1')
  })
  it('halves trace the original curve and their lengths add up', () => {
    const [a, b] = splitBezier(parabola, 0.6)
    for (const u of [0, 0.2, 0.5, 0.9, 1]) {
      expect(distance(bezierPoint(a, u), bezierPoint(parabola, 0.6 * u))).toBeLessThan(1e-9)
      expect(distance(bezierPoint(b, u), bezierPoint(parabola, 0.6 + 0.4 * u))).toBeLessThan(1e-9)
    }
    expect(bezierLength(a) + bezierLength(b)).toBeCloseTo(bezierLength(parabola), 6)
  })
  it('splits at a length', () => {
    const [a, b] = splitBezierAtLength(parabola, 40, ['x', 'y'])
    expect(bezierLength(a)).toBeCloseTo(40, 5)
    expect(bezierLength(b)).toBeCloseTo(PARABOLA_LENGTH - 40, 3)
    expect([a.id, b.id]).toEqual(['x', 'y'])
  })
  it('extracts a sub-curve', () => {
    const s = subBezier(parabola, 0.2, 0.7)
    expect(distance(s.p0, bezierPoint(parabola, 0.2))).toBeLessThan(1e-9)
    expect(distance(s.p3, bezierPoint(parabola, 0.7))).toBeLessThan(1e-9)
    expect(distance(bezierPoint(s, 0.5), bezierPoint(parabola, 0.45))).toBeLessThan(1e-9)
  })
})

describe('curveWithTangents', () => {
  const cases: Array<[string, Vec, Vec, Vec, Vec]> = [
    // Neckline: leaves the shoulder point heading down, arrives at centre front horizontally.
    ['converging rays', vec(0, 0), vec(0, 1), vec(-70, 80), vec(-1, 0)],
    ['parallel rays (S-curve)', vec(0, 0), vec(1, 0), vec(100, 40), vec(1, 0)],
    ['diverging rays', vec(0, 0), vec(-1, 1), vec(100, 0), vec(-1, -1)],
    ['oblique', vec(10, 5), vec(3, 1), vec(60, 90), vec(0.2, 1)],
  ]
  for (const [name, p0, d0, p3, d3] of cases) {
    it(`respects both tangent directions: ${name}`, () => {
      const c = curveWithTangents('n', p0, d0, p3, d3)
      expect(c.p0).toEqual(p0)
      expect(c.p3).toEqual(p3)
      expectParallel(bezierTangent(c, 0), d0, 1e-12)
      expectParallel(bezierTangent(c, 1), d3, 1e-12)
    })
  }
  it('gives a near-circular arc for a right-angle corner with equal legs', () => {
    const c = curveWithTangents('arc', vec(100, 0), vec(0, 1), vec(0, 100), vec(-1, 0))
    expect(
      Math.max(...[0.25, 0.5, 0.75].map((t) => Math.abs(length(bezierPoint(c, t)) - 100))),
    ).toBeLessThan(0.03)
  })
  it('meets a seam at a right angle when asked to', () => {
    // Centre front is the vertical x = 0; the neckline must arrive perpendicular to it.
    const cf = vec(0, 1)
    const c = curveWithTangents('neck', vec(70, 0), vec(0, 1), vec(0, 75), scale(perp(cf), 1))
    expect(Math.abs(dot(bezierTangent(c, 1), cf))).toBeLessThan(1e-12)
  })
})

describe('catmullRom', () => {
  const pts = [vec(0, 0), vec(30, 40), vec(80, 45), vec(120, 0), vec(140, -20)]
  it('passes through every point', () => {
    const curves = catmullRom(pts, { idPrefix: 'arm' })
    expect(curves).toHaveLength(4)
    curves.forEach((c, i) => {
      expect(c.p0).toEqual(pts[i])
      expect(c.p3).toEqual(pts[i + 1])
      expect(c.id).toBe(`arm.${i}`)
    })
  })
  it('is tangent-continuous at interior joints', () => {
    const curves = catmullRom(pts)
    for (let i = 1; i < curves.length; i++)
      expectParallel(bezierTangent(curves[i - 1], 1), bezierTangent(curves[i], 0), 1e-12)
  })
  it('closes the loop when closed', () => {
    const curves = catmullRom(pts.slice(0, 4), { closed: true })
    expect(curves).toHaveLength(4)
    expect(curves[3].p3).toEqual(curves[0].p0)
    expectParallel(bezierTangent(curves[3], 1), bezierTangent(curves[0], 0), 1e-12)
  })
})

describe('bbox, nearest, flatten', () => {
  it('bounding box includes the apex, not just the endpoints', () => {
    const bb = bezierBBox(parabola)
    expect(bb.minX).toBeCloseTo(0)
    expect(bb.maxX).toBeCloseTo(100)
    expect(bb.minY).toBeCloseTo(0)
    expect(bb.maxY).toBeCloseTo(50, 9)
  })
  it('nearest point', () => {
    const r = nearestOnBezier(parabola, vec(50, 80))
    expect(r.point.x).toBeCloseTo(50, 6)
    expect(r.distance).toBeCloseTo(30, 6)
  })
  it('flattened polyline stays within tolerance', () => {
    const pts = flattenBezier(parabola, 0.01)
    for (let i = 1; i < pts.length; i++) {
      const mid = lerp(pts[i - 1], pts[i], 0.5)
      expect(nearestOnBezier(parabola, mid).distance).toBeLessThan(0.01 + 1e-9)
    }
    expect(pts[0]).toEqual(parabola.p0)
    expect(pts[pts.length - 1]).toEqual(parabola.p3)
  })
})

describe('smoothWithTangents', () => {
  const pts = [vec(0, 0), vec(40, 60), vec(100, 80), vec(160, 40)]
  const curves = smoothWithTangents(pts, vec(0, 1), vec(1, -1), 'arm')
  it('passes through every point with stable ids', () => {
    expect(curves.map((c) => c.id)).toEqual(['arm.0', 'arm.1', 'arm.2'])
    curves.forEach((c, i) => {
      expect(c.p0).toEqual(pts[i])
      expect(c.p3).toEqual(pts[i + 1])
    })
  })
  it('honours the prescribed end tangents', () => {
    expectParallel(bezierTangent(curves[0], 0), vec(0, 1), 1e-12)
    expectParallel(bezierTangent(curves[2], 1), normalize(vec(1, -1)), 1e-12)
  })
  it('is tangent-continuous at interior points (Catmull–Rom direction)', () => {
    for (let i = 1; i < curves.length; i++) {
      const t = normalize(sub(pts[i + 1], pts[i - 1]))
      expectParallel(bezierTangent(curves[i - 1], 1), t, 1e-12)
      expectParallel(bezierTangent(curves[i], 0), t, 1e-12)
    }
  })
  it('rejects degenerate input', () => {
    expect(() => smoothWithTangents([vec(0, 0)], vec(1, 0), vec(1, 0))).toThrow()
    expect(() => smoothWithTangents([vec(0, 0), vec(1, 0)], vec(0, 0), vec(1, 0))).toThrow()
  })
})
