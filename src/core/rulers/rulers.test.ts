import { describe, expect, it } from 'vitest'
import { bezierLength, bezierPoint, nearestOnBezier } from '../bezier'
import { distanceToPolyline, pointInPolygon } from '../path'
import { distance, vec, type Vec } from '../vec'
import {
  edgeAt,
  edgeFitError,
  edgePolyline,
  edgeRangeToBeziers,
  nearestOnEdge,
  threePointCurvature,
} from './edge'
import { edgeGraduations, rulerGraduations } from './graduations'
import {
  RULER_IDS,
  alignPose,
  fitRulerToCurve,
  fitRulerToPoints,
  flipPose,
  getRuler,
  nearestRulerEdge,
  rotatePose,
  rulerEdge,
  slidePose,
  toRuler,
  toWorld,
  traceFitError,
  type RulerPose,
} from './rulers'

const polylineLength = (pts: readonly Vec[]) =>
  pts.slice(1).reduce((t, p, i) => t + distance(pts[i], p), 0)

/** Segments of two polylines cross (excluding shared neighbours) — for the outline check. */
const selfIntersects = (poly: readonly Vec[]): boolean => {
  const n = poly.length
  const cross = (a: Vec, b: Vec, c: Vec) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      const [a, b, c, d] = [poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n]]
      const d1 = cross(c, d, a)
      const d2 = cross(c, d, b)
      const d3 = cross(a, b, c)
      const d4 = cross(a, b, d)
      if (d1 * d2 < 0 && d3 * d4 < 0) return true
    }
  return false
}

const NOMINAL: Record<string, Record<string, number>> = {
  square: { outerLong: 600, innerLong: 550, outerShort: 300, innerShort: 250 },
  french: { curve: 300 },
  hip: { curve: 600 },
  tailor: { curve: 600 },
}

describe('ruler working edges', () => {
  it('arc length matches the nominal length (±0.5 mm), also measured on a fine polyline', () => {
    for (const id of RULER_IDS)
      for (const e of getRuler(id).edges) {
        const nominal = NOMINAL[id][e.id]
        if (nominal !== undefined) expect(Math.abs(e.totalLength - nominal)).toBeLessThan(0.5)
        // Independent check: a 0.25 mm polyline of the integrated curve.
        expect(
          Math.abs(polylineLength(edgePolyline(e, 0, e.totalLength, 0.25)) - e.totalLength),
        ).toBeLessThan(0.05)
      }
    // The hip curve's straight back equals its chord.
    const hip = getRuler('hip')
    const c = rulerEdge(hip, 'curve')
    expect(rulerEdge(hip, 'back').totalLength).toBeCloseTo(
      distance(edgeAt(c, 0).point, edgeAt(c, c.totalLength).point),
      6,
    )
  })

  it('point at arc length is consistent with the samples (exact integration)', () => {
    const e = rulerEdge(getRuler('french'), 'curve')
    for (const s of [0.3, 17.25, 129.9, 130, 130.4, 299.99]) {
      const a = edgeAt(e, s).point
      const b = edgeAt(e, s + 0.001).point
      expect(distance(a, b)).toBeCloseTo(0.001, 6)
    }
  })

  it('French curve: curvature decreases monotonically from R 25 mm to R 400 mm', () => {
    const e = rulerEdge(getRuler('french'), 'curve')
    const pts = edgePolyline(e, 0, e.totalLength, 2)
    const ks = pts.slice(1, -1).map((p, i) => threePointCurvature(pts[i], p, pts[i + 2]))
    for (let i = 1; i < ks.length; i++) expect(ks[i]).toBeLessThanOrEqual(ks[i - 1] + 1e-6)
    expect(1 / ks[0]).toBeGreaterThan(24)
    expect(1 / ks[0]).toBeLessThan(27)
    expect(1 / ks[ks.length - 1]).toBeCloseTo(400, 0)
  })

  it('hip curve: curvature increases monotonically from R 3000 mm to R 600 mm', () => {
    const e = rulerEdge(getRuler('hip'), 'curve')
    const pts = edgePolyline(e, 0, e.totalLength, 5)
    const ks = pts.slice(1, -1).map((p, i) => threePointCurvature(pts[i], p, pts[i + 2]))
    for (let i = 1; i < ks.length; i++) expect(ks[i]).toBeGreaterThanOrEqual(ks[i - 1] - 1e-7)
    expect(1 / ks[0]).toBeGreaterThan(2800)
    expect(1 / ks[ks.length - 1]).toBeLessThan(620)
  })

  it('ruler outlines are simple polygons containing their centre', () => {
    for (const id of RULER_IDS) {
      const r = getRuler(id)
      expect(selfIntersects(r.outline), id).toBe(false)
      expect(pointInPolygon(r.centre, r.outline), id).toBe(true)
      expect(pointInPolygon(r.handle, r.outline), id).toBe(false)
    }
  })

  it('graduations every mm, 5 mm and cm; numbering from the label offset', () => {
    const sq = getRuler('square')
    const outer = edgeGraduations(rulerEdge(sq, 'outerLong'))
    expect(outer.ticks).toHaveLength(601)
    expect(outer.ticks.filter((t) => t.level === 'cm')).toHaveLength(61)
    expect(outer.ticks.filter((t) => t.level === 'half')).toHaveLength(60)
    expect(outer.labels.map((l) => l.value).slice(0, 3)).toEqual([1, 2, 3])
    const inner = edgeGraduations(rulerEdge(sq, 'innerLong'))
    expect(inner.labels[0].value).toBe(5)
    // Ticks go into the body.
    for (const g of rulerGraduations(sq))
      for (const t of g.ticks.filter((x) => x.level === 'cm'))
        expect(
          pointInPolygon(t.to, sq.outline) || distanceToPolyline(t.to, sq.outline, true) < 1e-6,
        ).toBe(true)
  })
})

describe('Bézier fit of an edge range', () => {
  it('fits any sub-range within 0.1 mm', () => {
    for (const id of RULER_IDS)
      for (const e of getRuler(id).edges)
        for (const [a, b] of [
          [0, e.totalLength],
          [e.totalLength * 0.1, e.totalLength * 0.6],
          [e.totalLength * 0.9, e.totalLength * 0.2],
        ]) {
          const chain = edgeRangeToBeziers(e, a, b)
          expect(chain.length).toBeGreaterThan(0)
          expect(edgeFitError(e, a, b, chain, 200), `${id}.${e.id} ${a}-${b}`).toBeLessThanOrEqual(
            0.1,
          )
          // Chain runs from E(a) to E(b) and has the range's length.
          expect(distance(chain[0].p0, edgeAt(e, a).point)).toBeLessThan(1e-9)
          expect(distance(chain[chain.length - 1].p3, edgeAt(e, b).point)).toBeLessThan(1e-9)
          const len = chain.reduce((t, c) => t + bezierLength(c), 0)
          expect(Math.abs(len - Math.abs(b - a))).toBeLessThan(0.1)
        }
  })

  it('nearestOnEdge finds the foot of a point off the edge', () => {
    const e = rulerEdge(getRuler('tailor'), 'curve')
    const smp = edgeAt(e, 400)
    const off = { x: smp.point.x - smp.tangent.y * 7, y: smp.point.y + smp.tangent.x * 7 }
    const h = nearestOnEdge(e, off)
    expect(h.s).toBeCloseTo(400, 3)
    expect(h.distance).toBeCloseTo(7, 4)
  })
})

describe('pose and tracing', () => {
  const french = getRuler('french')
  const pose: RulerPose = { x: 120, y: -40, angleDeg: 33, flipped: false }

  it('fitRulerToPoints on a known pose: endpoints exact after correction, deviation reported', () => {
    const e = rulerEdge(french, 'curve')
    // Points ON the posed edge: no deviation.
    const p0 = toWorld(pose, edgeAt(e, 40).point)
    const p1 = toWorld(pose, edgeAt(e, 190).point)
    const t = fitRulerToPoints(french, 'curve', pose, p0, p1)!
    expect(t.deviation).toBeLessThan(1e-4)
    expect(t.s0).toBeCloseTo(40, 3)
    expect(t.s1).toBeCloseTo(190, 3)
    expect(t.lengthMm).toBeCloseTo(150, 2)
    expect(t.warn).toBe(false)
    expect(traceFitError(french, pose, t)).toBeLessThanOrEqual(0.1)

    // Points 1.5 mm and 2 mm off the edge (along its normal): deviation reported, ends snapped.
    const n = (s: number, d: number) => {
      const smp = edgeAt(e, s)
      return toWorld(pose, {
        x: smp.point.x - smp.tangent.y * d,
        y: smp.point.y + smp.tangent.x * d,
      })
    }
    const q0 = n(60, 1.5)
    const q1 = n(220, -2)
    const u = fitRulerToPoints(french, 'curve', pose, q0, q1)!
    expect(u.startDeviation).toBeCloseTo(1.5, 3)
    expect(u.endDeviation).toBeCloseTo(2, 3)
    expect(u.deviation).toBeCloseTo(2, 3)
    expect(u.warn).toBe(false)
    expect(distance(u.beziers[0].p0, q0)).toBeLessThan(0.01)
    expect(distance(u.beziers[u.beziers.length - 1].p3, q1)).toBeLessThan(0.01)
    // Continuous chain.
    for (let i = 1; i < u.beziers.length; i++)
      expect(distance(u.beziers[i - 1].p3, u.beziers[i].p0)).toBeLessThan(1e-9)

    // 5 mm off: warned, not applied silently.
    const w = fitRulerToPoints(french, 'curve', pose, n(60, 5), n(220, 0))!
    expect(w.deviation).toBeCloseTo(5, 3)
    expect(w.warn).toBe(true)
  })

  it('works on a flipped ruler, backwards', () => {
    const flipped = flipPose(french, pose)
    expect(distance(toWorld(flipped, french.centre), toWorld(pose, french.centre))).toBeLessThan(
      1e-9,
    )
    const e = rulerEdge(french, 'curve')
    const p0 = toWorld(flipped, edgeAt(e, 250).point)
    const p1 = toWorld(flipped, edgeAt(e, 30).point)
    const t = fitRulerToPoints(french, 'curve', flipped, p0, p1)!
    expect(t.deviation).toBeLessThan(1e-4)
    expect(t.s0).toBeGreaterThan(t.s1)
    const mid = toWorld(flipped, edgeAt(e, 140).point)
    const d = Math.min(...t.beziers.map((b) => nearestOnBezier(b, mid).distance))
    expect(d).toBeLessThan(0.1)
  })

  it('rotate keeps the centre; slide keeps the contact point and tangent; align passes the edge', () => {
    const turned = rotatePose(french, pose, 78)
    expect(turned.angleDeg).toBe(78)
    expect(distance(toWorld(turned, french.centre), toWorld(pose, french.centre))).toBeLessThan(
      1e-9,
    )

    const e = rulerEdge(french, 'curve')
    const contact = toWorld(pose, edgeAt(e, 100).point)
    const slid = slidePose(french, 'curve', pose, 100, 40)
    expect(slid.s).toBe(140)
    expect(distance(toWorld(slid.pose, edgeAt(e, 140).point), contact)).toBeLessThan(1e-6)
    const t0 = edgeAt(e, 100)
    const t1 = edgeAt(e, 140)
    const w0 = toWorld(pose, { x: t0.point.x + t0.tangent.x, y: t0.point.y + t0.tangent.y })
    const w1 = toWorld(slid.pose, { x: t1.point.x + t1.tangent.x, y: t1.point.y + t1.tangent.y })
    expect(distance(w0, contact) - 1).toBeLessThan(1e-9)
    expect(distance(w1, w0)).toBeLessThan(1e-6)

    const p = vec(500, 500)
    const { pose: aligned, hit } = alignPose(french, pose, p)
    expect(nearestRulerEdge(french, aligned, p).distance).toBeLessThan(1e-6)
    expect(aligned.angleDeg).toBe(pose.angleDeg)
    expect(hit.edgeId).toBe('curve')
    expect(distance(toRuler(aligned, toWorld(aligned, vec(3, 4))), vec(3, 4))).toBeLessThan(1e-9)
  })

  it('fitRulerToCurve finds where a piece of the ruler lies on a curve', () => {
    const e = rulerEdge(french, 'curve')
    const posed: RulerPose = { x: 300, y: 200, angleDeg: -61, flipped: true }
    const curve = Array.from({ length: 41 }, (_, i) =>
      toWorld(posed, edgeAt(e, 70 + 2.5 * i).point),
    )
    const fit = fitRulerToCurve(french, 'curve', curve)
    expect(fit.deviation).toBeLessThan(0.5)
  })

  it('a straight-edge trace is a straight Bézier', () => {
    const sq = getRuler('square')
    const p: RulerPose = { x: 0, y: 0, angleDeg: 90, flipped: false }
    const t = fitRulerToPoints(sq, 'outerLong', p, vec(0, 10), vec(0, 310))!
    expect(t.beziers).toHaveLength(1)
    expect(distance(bezierPoint(t.beziers[0], 0.5), vec(0, 160))).toBeLessThan(1e-6)
  })
})
