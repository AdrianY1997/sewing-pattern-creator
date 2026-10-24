import { describe, expect, it } from 'vitest'
import { cubic, nearestOnBezier, curveWithTangents } from './bezier'
import { offsetPath } from './offset'
import {
  isContinuous,
  line,
  path,
  pathBBox,
  pathSignedArea,
  reversePath,
  segEnd,
  segmentPoint,
  type Path,
  type Segment,
} from './path'
import { distance, perpendicularFoot, projectParam, vec, type Vec } from './vec'

const distToSegment = (p: Vec, s: Segment): number => {
  if (s.kind === 'cubic') return nearestOnBezier(s, p).distance
  const u = projectParam(p, s.p0, s.p1)
  if (u <= 0) return distance(p, s.p0)
  if (u >= 1) return distance(p, s.p1)
  return distance(p, perpendicularFoot(p, s.p0, s.p1))
}
const distToPath = (p: Vec, path: Path) =>
  Math.min(...path.segments.map((s) => distToSegment(p, s)))

const samples = (s: Segment, n = 40): Vec[] =>
  Array.from({ length: n + 1 }, (_, i) => segmentPoint(s, i / n))

const square = path(
  [
    line('top', vec(0, 0), vec(100, 0)),
    line('right', vec(100, 0), vec(100, 100)),
    line('bottom', vec(100, 100), vec(0, 100)),
    line('left', vec(0, 100), vec(0, 0)),
  ],
  true,
)

describe('offset of a square', () => {
  it('uniform distance gives the enlarged square with mitred corners', () => {
    const o = offsetPath(square, 10)
    expect(o.closed).toBe(true)
    expect(isContinuous(o, 1e-9)).toBe(true)
    expect(o.segments).toHaveLength(4)
    expect(o.segments.map((s) => s.id)).toEqual(['top~off', 'right~off', 'bottom~off', 'left~off'])
    const bb = pathBBox(o)
    expect(bb.minX).toBeCloseTo(-10, 9)
    expect(bb.minY).toBeCloseTo(-10, 9)
    expect(bb.maxX).toBeCloseTo(110, 9)
    expect(bb.maxY).toBeCloseTo(110, 9)
    expect(pathSignedArea(o)).toBeCloseTo(120 * 120, 6)
  })
  it('does not depend on winding direction', () => {
    const o = offsetPath(reversePath(square), 10)
    const bb = pathBBox(o)
    expect([bb.minX, bb.minY, bb.maxX, bb.maxY].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([
      -10, -10, 110, 110,
    ])
    expect(pathSignedArea(o)).toBeCloseTo(-120 * 120, 6)
  })
  it('uses a different distance per segment', () => {
    const o = offsetPath(square, { top: 10, right: 15, bottom: 40, left: 0 })
    const bb = pathBBox(o)
    expect(bb.minX).toBeCloseTo(0, 9)
    expect(bb.minY).toBeCloseTo(-10, 9)
    expect(bb.maxX).toBeCloseTo(115, 9)
    expect(bb.maxY).toBeCloseTo(140, 9)
    expect(isContinuous(o, 1e-9)).toBe(true)
    // Every edge sits at its own distance.
    const top = o.segments.find((s) => s.id === 'top~off')!
    expect(top.p0.y).toBeCloseTo(-10, 9)
    const bottom = o.segments.find((s) => s.id === 'bottom~off')!
    expect(bottom.p0.y).toBeCloseTo(140, 9)
  })
  it('negative distance offsets inward', () => {
    const bb = pathBBox(offsetPath(square, -10))
    expect([bb.minX, bb.maxX]).toEqual([expect.closeTo(10, 9), expect.closeTo(90, 9)])
  })
  it('clips very sharp mitres at the limit', () => {
    const spike = path(
      [
        line('a', vec(0, 0), vec(200, 10)),
        line('b', vec(200, 10), vec(0, 20)),
        line('c', vec(0, 20), vec(0, 0)),
      ],
      true,
    )
    const o = offsetPath(spike, 5, { miterLimit: 4 })
    expect(isContinuous(o, 1e-9)).toBe(true)
    // Unclipped, the tip mitre would reach ~100 mm past the vertex; clipped, at most 4 × 5.
    expect(pathBBox(o).maxX).toBeLessThanOrEqual(200 + 20 + 1e-6)
    expect(o.segments.some((s) => s.id.includes('~join'))).toBe(true)
    for (const s of o.segments)
      for (const p of samples(s, 10)) expect(distToPath(p, spike)).toBeGreaterThan(5 - 1e-6)
  })
})

describe('offset of curved paths', () => {
  // A bodice-like piece: straight side seams, a convex hem curve and a concave "armhole".
  const piece = path(
    [
      line('cf', vec(0, 0), vec(0, 300)),
      cubic('hem', vec(0, 300), vec(80, 330), vec(160, 320), vec(200, 290)),
      line('side', vec(200, 290), vec(200, 120)),
      // Concave curve (bulges into the piece).
      cubic('arm', vec(200, 120), vec(150, 110), vec(140, 60), vec(150, 0)),
      line('shoulder', vec(150, 0), vec(0, 0)),
    ],
    true,
  )

  for (const d of [10, 15]) {
    it(`curve pieces stay at d = ${d} mm ± 0.1 mm from the source`, () => {
      const o = offsetPath(piece, d)
      expect(isContinuous(o, 1e-9)).toBe(true)
      const curvePieces = o.segments.filter((s) => /^(hem|arm)~off/.test(s.id))
      expect(curvePieces.length).toBeGreaterThan(0)
      for (const s of curvePieces)
        for (const p of samples(s, 60))
          expect(Math.abs(distToPath(p, piece) - d)).toBeLessThanOrEqual(0.1)
    })
  }

  it('no part of the allowance comes closer than d to the source', () => {
    const o = offsetPath(piece, 10)
    for (const s of o.segments)
      for (const p of samples(s, 30)) expect(distToPath(p, piece)).toBeGreaterThan(10 - 0.1)
  })

  it('per-segment distances on curves (hem 40, others 10)', () => {
    const o = offsetPath(piece, { cf: 10, hem: 40, side: 10, arm: 10, shoulder: 10 })
    expect(isContinuous(o, 1e-9)).toBe(true)
    for (const s of o.segments.filter((x) => x.id.startsWith('hem~off')))
      for (const p of samples(s, 40))
        expect(Math.abs(distToPath(p, piece) - 40)).toBeLessThanOrEqual(0.1)
  })

  it('offsets a closed curve made only of beziers (circle-like)', () => {
    const r = 50
    const quarter = (id: string, a: Vec, da: Vec, b: Vec, db: Vec) =>
      curveWithTangents(id, a, da, b, db)
    const circle = path(
      [
        quarter('q1', vec(r, 0), vec(0, 1), vec(0, r), vec(-1, 0)),
        quarter('q2', vec(0, r), vec(-1, 0), vec(-r, 0), vec(0, -1)),
        quarter('q3', vec(-r, 0), vec(0, -1), vec(0, -r), vec(1, 0)),
        quarter('q4', vec(0, -r), vec(1, 0), vec(r, 0), vec(0, 1)),
      ],
      true,
    )
    const o = offsetPath(circle, 12)
    expect(isContinuous(o, 1e-9)).toBe(true)
    expect(o.segments.every((s) => s.kind === 'cubic')).toBe(true)
    for (const s of o.segments)
      for (const p of samples(s, 30))
        expect(Math.abs(distToPath(p, circle) - 12)).toBeLessThanOrEqual(0.1)
    expect(segEnd(o.segments[o.segments.length - 1])).toEqual(o.segments[0].p0)
  })

  it('rejects open paths', () => {
    expect(() => offsetPath(path([line('a', vec(0, 0), vec(1, 0))], false), 5)).toThrow()
  })
})
