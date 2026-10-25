import { describe, expect, it } from 'vitest'
import { KAPPA, cubic, splitBezier } from './bezier'
import { bezierCurvature, curvatureProfile, curveFairness } from './fairness'
import { line } from './path'
import { vec } from './vec'

/** Quarter circle of radius r centred at the origin, from (r, 0) to (0, r) (clockwise on screen). */
const quarter = (r: number, id = 'q') =>
  cubic(id, vec(r, 0), vec(r, r * KAPPA), vec(r * KAPPA, r), vec(0, r))

describe('bezierCurvature', () => {
  it('is ≈ 1/R on a circular arc, signed by the turning direction', () => {
    for (const t of [0, 0.25, 0.5, 1])
      expect(bezierCurvature(quarter(50), t)).toBeCloseTo(1 / 50, 3)
    const reversed = cubic('r', vec(0, 50), vec(50 * KAPPA, 50), vec(50, 50 * KAPPA), vec(50, 0))
    expect(bezierCurvature(reversed, 0.5)).toBeCloseTo(-1 / 50, 3)
  })

  it('stays finite where a handle has zero length', () => {
    const c = cubic('d', vec(0, 0), vec(0, 0), vec(50, 100), vec(100, 0))
    expect(Number.isFinite(bezierCurvature(c, 0))).toBe(true)
    expect(Number.isFinite(bezierCurvature(c, 1))).toBe(true)
  })
})

describe('curveFairness', () => {
  it('an arc: no inflection, constant radius, one flat curvature (no peak)', () => {
    const [a, b] = splitBezier(quarter(80), 0.4)
    const r = curveFairness([a, b])
    expect(r.inflections).toBe(0)
    expect(r.maxJoinJump).toBeLessThan(1e-6)
    // The cubic quarter circle is within 3 % of the arc's radius.
    expect(Math.abs(r.minRadius - 80)).toBeLessThan(2.4)
    expect(Math.abs(r.maxRadius - 80)).toBeLessThan(2.4)
    expect(r.length).toBeCloseTo((Math.PI / 2) * 80, 0)
  })

  it('an S curve has one inflection, near its middle', () => {
    const s = cubic('s', vec(0, 0), vec(60, 0), vec(40, 100), vec(100, 100))
    const r = curveFairness([s])
    expect(r.inflections).toBe(1)
    expect(r.inflectionsAt[0]).toBeGreaterThan(0.4 * r.length)
    expect(r.inflectionsAt[0]).toBeLessThan(0.6 * r.length)
  })

  it('two tangent arcs of different radius: the relative jump at the join', () => {
    // R = 50 quarter, then a R = 100 quarter turning the same way (centre (0, −50)).
    const a = quarter(50, 'a')
    const b = cubic(
      'b',
      vec(0, 50),
      vec(-100 * KAPPA, 50),
      vec(-100, -50 + 100 * KAPPA),
      vec(-100, -50),
    )
    const r = curveFairness([a, b])
    expect(r.inflections).toBe(0)
    expect(r.joins).toHaveLength(1)
    expect(r.joins[0].before).toBeCloseTo(1 / 50, 3)
    expect(r.joins[0].after).toBeCloseTo(1 / 100, 3)
    expect(r.maxJoinJump).toBeCloseTo(0.5, 2)
    expect(Math.abs(r.minRadius - 50)).toBeLessThan(1.5)
    expect(Math.abs(r.maxRadius - 100)).toBeLessThan(3)
  })

  it('a line is straight: no inflection, infinite radius; a straight-to-curved join jumps 100 %', () => {
    const l = line('l', vec(100, -50), vec(100, 0))
    expect(curveFairness([l]).maxRadius).toBe(Infinity)
    const r = curveFairness([l, quarter(100)])
    expect(r.inflections).toBe(0)
    expect(r.maxJoinJump).toBeCloseTo(1, 3)
  })

  it('ignores wiggles below the tolerance', () => {
    // Nearly straight, curving very slightly one way then the other (|κ| < 1e-4).
    const s = cubic('w', vec(0, 0), vec(100, 0.01), vec(200, -0.01), vec(300, 0))
    expect(curveFairness([s]).inflections).toBe(0)
    expect(curveFairness([s], { absTolerance: 0, relTolerance: 0 }).inflections).toBe(1)
  })

  it('curvatureProfile samples every segment end to end by arc length', () => {
    const prof = curvatureProfile([quarter(50)], 5)
    expect(prof[0].s).toBe(0)
    expect(prof[prof.length - 1].s).toBeCloseTo((Math.PI / 2) * 50, 1)
    for (let i = 1; i < prof.length; i++) expect(prof[i].s).toBeGreaterThan(prof[i - 1].s)
  })
})
