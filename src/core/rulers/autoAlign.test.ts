import { describe, expect, it } from 'vitest'
import { WOMEN_BODICE_BLOCK, draftBlock } from '../../blocks'
import { stripMeta } from '../draft'
import { distance, vec } from '../vec'
import { edgePolyline } from './edge'
import {
  AUTO_ALIGN_END_DEVIATION_MM,
  autoAlignRuler,
  polylineDeviation,
  resamplePolyline,
  sampleSegments,
  traceCurveDeviation,
} from './autoAlign'
import {
  fitRulerToCurve,
  fitRulerToPoints,
  getRuler,
  rulerEdge,
  toWorld,
  type RulerPose,
} from './rulers'

const french = getRuler('french')

describe('autoAlignRuler', () => {
  it('finds the stretch and pose of a curve that IS a piece of the ruler (turned over)', () => {
    const e = rulerEdge(french, 'curve')
    const posed: RulerPose = { x: 240, y: -80, angleDeg: 127, flipped: true }
    const curve = edgePolyline(e, 35, 205, 1).map((p) => toWorld(posed, p))
    const fit = autoAlignRuler(french, curve[0], curve[curve.length - 1], { curve })!
    expect(fit.curveDeviation).toBeLessThan(0.15)
    expect(fit.pose.flipped).toBe(true)
    expect(fit.trace.deviation).toBeLessThan(AUTO_ALIGN_END_DEVIATION_MM)
    expect(Math.abs(Math.abs(fit.trace.s1 - fit.trace.s0) - 170)).toBeLessThan(1)
  })

  it('without a curve: the edge passes through both points, moving the ruler little', () => {
    const p0 = vec(0, 0)
    const p1 = vec(120, 40)
    const current: RulerPose = { x: 10, y: 30, angleDeg: 20, flipped: false }
    for (const id of ['french', 'hip', 'tailor', 'square'] as const) {
      const r = getRuler(id)
      const fit = autoAlignRuler(r, p0, p1, { current })!
      expect(fit.curveDeviation).toBeNull()
      expect(fit.trace.deviation, id).toBeLessThan(0.01)
      expect(fit.pose.flipped).toBe(false)
    }
  })

  it('is null when the points are farther apart than any stretch of the edge', () => {
    expect(autoAlignRuler(french, vec(0, 0), vec(500, 0))).toBeNull()
  })

  it('polyline helpers', () => {
    const line = [vec(0, 0), vec(10, 0), vec(30, 0)]
    const r = resamplePolyline(line, 4)
    expect(r.map((p) => p.x)).toEqual([0, 10, 20, 30])
    expect(polylineDeviation(line, [vec(0, 1), vec(30, 1)])).toBeCloseTo(1, 9)
    // One-sided misses count: a longer second polyline is far from the first's end.
    expect(polylineDeviation(line, [vec(0, 0), vec(40, 0)])).toBeCloseTo(10, 9)
  })

  /**
   * Women bodice, size 10: the whole front armhole (3 edges, A26 → A27, 227 mm). Its curvature has
   * an inflection ~7 mm from the side seam, a peak (R ≈ 31 mm) 60 mm up and a jump from R ≈ 95 to
   * R ≈ 900 mm where two of its Béziers meet: a ruler whose curvature only falls (the French curve:
   * a clothoid R 25 → 400 mm, then an arc) cannot follow it within 1 mm. Best max deviations (trace
   * vs the existing armhole, points ≤ 1 mm off the edge), measured by this search:
   *   square 51.7 mm · french 5.9 mm · hip 46.5 mm · tailor 42.1 mm.
   */
  it('women bodice front armhole: the best each ruler can do (the French curve is the best)', () => {
    const draft = draftBlock(WOMEN_BODICE_BLOCK, '10', {})
    const segs = ['front.armhole.0', 'front.armhole.1', 'front.armhole.2'].map((id) =>
      stripMeta(draft.segments[id]),
    )
    const curve = sampleSegments(segs, 1)
    const p0 = curve[0]
    const p1 = curve[curve.length - 1]
    const best: Record<string, number> = {}
    for (const id of ['square', 'french', 'hip', 'tailor'] as const) {
      const fit = autoAlignRuler(getRuler(id), p0, p1, { curve })!
      best[id] = fit.curveDeviation!
      expect(fit.trace.deviation).toBeLessThanOrEqual(AUTO_ALIGN_END_DEVIATION_MM + 1e-6)
      // The reported deviation is the real trace's.
      const again = fitRulerToPoints(getRuler(id), fit.edgeId, fit.pose, p0, p1)!
      expect(traceCurveDeviation(again, curve)).toBeCloseTo(fit.curveDeviation!, 6)
      expect(distance(again.beziers[0].p0, p0)).toBeLessThan(1e-6)
    }
    expect(best.french).toBeGreaterThan(5.5)
    expect(best.french).toBeLessThan(6.1)
    expect(best.square).toBeGreaterThan(50)
    expect(best.hip).toBeGreaterThan(40)
    expect(best.tailor).toBeGreaterThan(40)
    expect(Math.min(...Object.values(best))).toBe(best.french)
    // At least as good as the F5 placement (fitRulerToCurve), judged on the applied trace.
    const f5 = fitRulerToPoints(
      french,
      'curve',
      fitRulerToCurve(french, 'curve', curve).pose,
      p0,
      p1,
    )!
    expect(best.french).toBeLessThanOrEqual(traceCurveDeviation(f5, curve) + 1e-6)
  }, 60_000)
})
