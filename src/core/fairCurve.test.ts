import { describe, expect, it } from 'vitest'
import { bezierTangent } from './bezier'
import { fairCurve, fitFairCurve } from './fairCurve'
import { curveFairness } from './fairness'
import { cross, normalize, vec, type Vec } from './vec'

const sinAngle = (a: Vec, b: Vec) => Math.abs(cross(normalize(a), normalize(b)))

// A front-armhole-like set of points: down from the shoulder, round the underarm, to the side.
const ARMHOLE = [vec(0, 0), vec(10, 120), vec(-25, 175), vec(-80, 190)]
const DOWN = vec(0.25, 1)
const LEFT = vec(-1, 0.12)

describe('fairCurve', () => {
  const curves = fairCurve(ARMHOLE, DOWN, LEFT, { idPrefix: 'arm' })

  it('passes through every point with the prescribed end tangents and stable ids', () => {
    expect(curves.map((c) => c.id)).toEqual(['arm.0', 'arm.1', 'arm.2'])
    curves.forEach((c, i) => {
      expect(c.p0).toEqual(ARMHOLE[i])
      expect(c.p3).toEqual(ARMHOLE[i + 1])
    })
    expect(sinAngle(bezierTangent(curves[0], 0), DOWN)).toBeLessThan(1e-9)
    expect(sinAngle(bezierTangent(curves[2], 1), LEFT)).toBeLessThan(1e-9)
  })

  it('is G2 at the internal points and bends one way only', () => {
    const r = curveFairness(curves)
    expect(r.inflections).toBe(0)
    expect(r.maxJoinJump).toBeLessThan(1e-6)
    // Tangent continuity too.
    for (let i = 0; i < 2; i++)
      expect(sinAngle(bezierTangent(curves[i], 1), bezierTangent(curves[i + 1], 0))).toBeLessThan(
        1e-9,
      )
  })

  it('a prescribed internal direction: an S with one inflection per half, ≈ G2 at the top', () => {
    const right = vec(1, 0)
    // A sleeve-cap-like outline: underarm → hollow → crown (horizontal at the top) → hollow → underarm.
    const cap = [
      vec(-170, 124),
      vec(-139, 107),
      vec(-113, 82),
      vec(-68, 25),
      vec(0, 0),
      vec(62, 21),
      vec(101, 74),
      vec(127, 111),
      vec(170, 124),
    ]
    const fit = fitFairCurve(cap, right, right, { tangents: { 4: right }, inflections: 2 })
    expect(sinAngle(bezierTangent(fit.curves[3], 1), right)).toBeLessThan(1e-9)
    expect(sinAngle(bezierTangent(fit.curves[4], 0), right)).toBeLessThan(1e-9)
    expect(curveFairness(fit.curves.slice(0, 4)).inflections).toBe(1)
    expect(curveFairness(fit.curves.slice(4)).inflections).toBe(1)
    expect(curveFairness(fit.curves).maxJoinJump).toBeLessThan(0.05)
    // The fitted shape rebuilds the same curve (used to solve for a seam length).
    const again = fitFairCurve(cap, right, right, { tangents: { 4: right }, shape: fit.shape })
    expect(again.curves).toEqual(fit.curves)
  })

  it('is scale invariant (the shape parameters are dimensionless)', () => {
    const big = fitFairCurve(
      ARMHOLE.map((p) => vec(p.x * 2, p.y * 2)),
      DOWN,
      LEFT,
    )
    const small = fitFairCurve(ARMHOLE, DOWN, LEFT)
    big.shape.speeds.forEach((s, i) => expect(s).toBeCloseTo(small.shape.speeds[i], 6))
  })

  it('rejects bad input', () => {
    expect(() => fairCurve([vec(0, 0)], DOWN, LEFT)).toThrow()
    expect(() => fairCurve([vec(0, 0), vec(0, 0), vec(1, 1)], DOWN, LEFT)).toThrow(/coincident/)
    expect(() => fairCurve(ARMHOLE, vec(0, 0), LEFT)).toThrow(/zero direction/)
    expect(() => fairCurve(ARMHOLE, DOWN, LEFT, { tangents: { 0: DOWN } })).toThrow(/internal/)
    expect(() =>
      fitFairCurve(ARMHOLE, DOWN, LEFT, { shape: { speeds: [1, 1], knots: [1] } }),
    ).toThrow(/shape/)
  })
})
