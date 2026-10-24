import { describe, expect, it } from 'vitest'
import { bezierPoint, cubic } from './bezier'
import {
  circleCircleIntersections,
  intersectSegments,
  lineBezierIntersections,
  lineLineIntersection,
  lineLineParams,
  lineSegmentIntersections,
  pathSelfIntersections,
  segmentSegmentIntersection,
} from './intersect'
import { line, path } from './path'
import { distance, vec } from './vec'

describe('line-line (infinite)', () => {
  it('finds the crossing of two lines', () => {
    const p = lineLineIntersection(vec(0, 0), vec(10, 10), vec(0, 10), vec(10, 0))
    expect(p).not.toBeNull()
    expect(p!.x).toBeCloseTo(5)
    expect(p!.y).toBeCloseTo(5)
  })
  it('extends beyond the given points', () => {
    const hit = lineLineParams(vec(0, 0), vec(1, 0), vec(5, 3), vec(5, 4))
    expect(hit!.point.x).toBeCloseTo(5)
    expect(hit!.point.y).toBeCloseTo(0)
    expect(hit!.u).toBeCloseTo(5)
    expect(hit!.v).toBeCloseTo(-3)
  })
  it('returns null for parallel lines', () => {
    expect(lineLineIntersection(vec(0, 0), vec(10, 0), vec(0, 5), vec(10, 5))).toBeNull()
  })
  it('returns null for coincident lines', () => {
    expect(lineLineIntersection(vec(0, 0), vec(10, 0), vec(20, 0), vec(30, 0))).toBeNull()
  })
  it('returns null for a degenerate line', () => {
    expect(lineLineIntersection(vec(1, 1), vec(1, 1), vec(0, 0), vec(5, 5))).toBeNull()
  })
})

describe('segment-segment', () => {
  it('finds a crossing inside both segments', () => {
    const p = segmentSegmentIntersection(vec(0, 0), vec(10, 0), vec(4, -5), vec(4, 5))
    expect(p).toEqual(vec(4, 0))
  })
  it('rejects a crossing outside one segment', () => {
    expect(segmentSegmentIntersection(vec(0, 0), vec(10, 0), vec(4, 1), vec(4, 5))).toBeNull()
    expect(segmentSegmentIntersection(vec(0, 0), vec(3, 0), vec(4, -5), vec(4, 5))).toBeNull()
  })
  it('accepts touching endpoints', () => {
    const p = segmentSegmentIntersection(vec(0, 0), vec(10, 0), vec(10, 0), vec(10, 7))
    expect(p).toEqual(vec(10, 0))
  })
  it('returns null for parallel segments', () => {
    expect(segmentSegmentIntersection(vec(0, 0), vec(10, 0), vec(0, 1), vec(10, 1))).toBeNull()
  })
})

describe('line-bezier', () => {
  // S-curve crossing the x axis three times.
  const s = cubic('s', vec(0, -50), vec(30, 150), vec(70, -150), vec(100, 50))

  it('finds all three crossings of an S-curve', () => {
    const hits = lineBezierIntersections(vec(-10, 0), vec(110, 0), s)
    expect(hits).toHaveLength(3)
    for (const h of hits) {
      expect(Math.abs(h.point.y)).toBeLessThan(1e-9)
      expect(distance(bezierPoint(s, h.t), h.point)).toBeLessThan(1e-12)
    }
    expect(hits.map((h) => h.t)).toEqual([...hits.map((h) => h.t)].sort((a, b) => a - b))
  })
  it('finds a single crossing of a vertical line', () => {
    const hits = lineBezierIntersections(vec(50, -100), vec(50, 100), s)
    expect(hits).toHaveLength(1)
    expect(hits[0].point.x).toBeCloseTo(50, 9)
  })
  it('returns nothing when the line misses the curve', () => {
    expect(lineBezierIntersections(vec(0, 200), vec(100, 200), s)).toEqual([])
    expect(lineBezierIntersections(vec(200, 0), vec(200, 10), s)).toEqual([])
  })
  it('respects segment bounds when bounded', () => {
    const all = lineBezierIntersections(vec(-10, 0), vec(110, 0), s)
    const bounded = lineBezierIntersections(vec(-10, 0), vec(40, 0), s, { bounded: true })
    expect(bounded.length).toBeGreaterThan(0)
    expect(bounded.length).toBeLessThan(all.length)
    for (const h of bounded) expect(h.point.x).toBeLessThanOrEqual(40 + 1e-9)
  })
  it('handles a tangent line touching the curve', () => {
    const arch = cubic('a', vec(0, 0), vec(0, -40), vec(100, -40), vec(100, 0)) // apex y = -30
    const hits = lineBezierIntersections(vec(0, -30), vec(100, -30), arch)
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits[0].point.x).toBeCloseTo(50, 3)
  })
})

describe('generic segment intersections', () => {
  it('bezier × bezier', () => {
    const a = cubic('a', vec(0, 0), vec(30, 100), vec(70, 100), vec(100, 0))
    const b = cubic('b', vec(0, 80), vec(30, -20), vec(70, -20), vec(100, 80))
    const hits = intersectSegments(a, b)
    expect(hits).toHaveLength(2)
    for (const h of hits)
      expect(distance(bezierPoint(a, h.t1), bezierPoint(b, h.t2))).toBeLessThan(1e-6)
    expect(hits[0].point.x + hits[1].point.x).toBeCloseTo(100, 6) // symmetric
  })
  it('bezier × bezier with no hit', () => {
    const a = cubic('a', vec(0, 0), vec(30, 10), vec(70, 10), vec(100, 0))
    const b = cubic('b', vec(0, 50), vec(30, 60), vec(70, 60), vec(100, 50))
    expect(intersectSegments(a, b)).toEqual([])
  })
  it('line × bezier in both argument orders agree', () => {
    const l = line('l', vec(50, -10), vec(50, 100))
    const c = cubic('c', vec(0, 0), vec(30, 100), vec(70, 100), vec(100, 0))
    const h1 = intersectSegments(l, c)
    const h2 = intersectSegments(c, l)
    expect(h1).toHaveLength(1)
    expect(h2).toHaveLength(1)
    expect(h1[0].t1).toBeCloseTo(h2[0].t2, 12)
    expect(h1[0].point.y).toBeCloseTo(75, 9)
  })
  it('line × line (parallel) is empty', () => {
    expect(
      intersectSegments(line('a', vec(0, 0), vec(1, 0)), line('b', vec(0, 1), vec(1, 1))),
    ).toEqual([])
  })
  it('infinite line against a segment', () => {
    expect(
      lineSegmentIntersections(vec(0, 0), vec(1, 1), line('s', vec(10, 0), vec(0, 10))),
    ).toHaveLength(1)
    expect(
      lineSegmentIntersections(vec(0, 0), vec(1, 0), line('s', vec(0, 1), vec(5, 2))),
    ).toHaveLength(0)
  })
})

describe('circle-circle', () => {
  it('finds both crossings, the first to the screen-left of c1 → c2', () => {
    const hits = circleCircleIntersections(vec(0, 0), 5, vec(8, 0), 5)
    expect(hits).toHaveLength(2)
    expect(hits[0].x).toBeCloseTo(4, 12)
    expect(hits[0].y).toBeCloseTo(-3, 12)
    expect(hits[1].y).toBeCloseTo(3, 12)
    for (const h of hits) {
      expect(distance(h, vec(0, 0))).toBeCloseTo(5, 12)
      expect(distance(h, vec(8, 0))).toBeCloseTo(5, 12)
    }
  })
  it('handles tangency, separation, containment and coincidence', () => {
    const t = circleCircleIntersections(vec(0, 0), 2, vec(5, 0), 3)
    expect(t).toHaveLength(1)
    expect(t[0].x).toBeCloseTo(2, 9)
    expect(circleCircleIntersections(vec(0, 0), 1, vec(5, 0), 1)).toEqual([])
    expect(circleCircleIntersections(vec(0, 0), 10, vec(1, 0), 1)).toEqual([])
    expect(circleCircleIntersections(vec(0, 0), 1, vec(0, 0), 1)).toEqual([])
  })
})

describe('pathSelfIntersections', () => {
  it('is empty for a simple closed outline with a curve', () => {
    const p = path(
      [
        line('a', vec(0, 0), vec(100, 0)),
        line('b', vec(100, 0), vec(100, 100)),
        cubic('c', vec(100, 100), vec(70, 140), vec(30, 140), vec(0, 100)),
        line('d', vec(0, 100), vec(0, 0)),
      ],
      true,
    )
    expect(pathSelfIntersections(p)).toEqual([])
  })
  it('finds the crossing of a bow-tie', () => {
    const p = path(
      [
        line('a', vec(0, 0), vec(100, 100)),
        line('b', vec(100, 100), vec(100, 0)),
        line('c', vec(100, 0), vec(0, 100)),
        line('d', vec(0, 100), vec(0, 0)),
      ],
      true,
    )
    const hits = pathSelfIntersections(p)
    expect(hits).toHaveLength(1)
    expect(hits[0].x).toBeCloseTo(50, 9)
    expect(hits[0].y).toBeCloseTo(50, 9)
  })
})
