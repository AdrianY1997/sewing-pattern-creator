import { describe, expect, it } from 'vitest'
import {
  add,
  angle,
  angleBetween,
  degToRad,
  distance,
  length,
  lerp,
  mirror,
  normalize,
  perpendicularFoot,
  pointAlong,
  pointAtAngle,
  rotate,
  scale,
  signedDistanceToLine,
  sub,
  vec,
} from './vec'

const close = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-9) => {
  expect(a.x).toBeCloseTo(b.x, -Math.log10(eps))
  expect(a.y).toBeCloseTo(b.y, -Math.log10(eps))
}

describe('vec basics', () => {
  it('adds, subtracts, scales', () => {
    expect(add(vec(1, 2), vec(3, 4))).toEqual(vec(4, 6))
    expect(sub(vec(1, 2), vec(3, 4))).toEqual(vec(-2, -2))
    expect(scale(vec(1, -2), 3)).toEqual(vec(3, -6))
  })
  it('measures length and distance', () => {
    expect(length(vec(3, 4))).toBe(5)
    expect(distance(vec(1, 1), vec(4, 5))).toBe(5)
  })
  it('normalizes, keeping zero as zero', () => {
    close(normalize(vec(0, 10)), vec(0, 1))
    expect(normalize(vec(0, 0))).toEqual(vec(0, 0))
  })
  it('lerps', () => {
    expect(lerp(vec(0, 0), vec(10, 20), 0.25)).toEqual(vec(2.5, 5))
  })
  it('measures angles from +x towards +y (y down: clockwise on screen)', () => {
    expect(angle(vec(0, 1))).toBeCloseTo(Math.PI / 2)
    expect(angleBetween(vec(1, 0), vec(0, 1))).toBeCloseTo(Math.PI / 2)
    expect(angleBetween(vec(0, 1), vec(1, 0))).toBeCloseTo(-Math.PI / 2)
  })
})

describe('rotate', () => {
  it('rotates about the origin', () => {
    close(rotate(vec(10, 0), Math.PI / 2), vec(0, 10))
  })
  it('rotates about a pivot and preserves distance to it', () => {
    const pivot = vec(5, 5)
    const p = vec(8, 9)
    const r = rotate(p, degToRad(37), pivot)
    expect(distance(r, pivot)).toBeCloseTo(distance(p, pivot), 12)
    close(rotate(r, degToRad(-37), pivot), p)
    close(rotate(vec(15, 5), Math.PI, pivot), vec(-5, 5))
  })
})

describe('mirror', () => {
  it('mirrors across axis-aligned and diagonal lines', () => {
    close(mirror(vec(3, 4), vec(0, 0), vec(0, 10)), vec(-3, 4))
    close(mirror(vec(3, 4), vec(0, 0), vec(1, 1)), vec(4, 3))
  })
  it('is an involution and keeps points on the axis fixed', () => {
    const a = vec(1, 2)
    const b = vec(7, -3)
    const p = vec(4.2, 9.1)
    close(mirror(mirror(p, a, b), a, b), p)
    close(mirror(lerp(a, b, 0.3), a, b), lerp(a, b, 0.3))
  })
})

describe('construction helpers', () => {
  it('point at distance and angle', () => {
    close(pointAtAngle(vec(10, 10), degToRad(90), 5), vec(10, 15))
    close(pointAtAngle(vec(0, 0), degToRad(45), Math.SQRT2), vec(1, 1))
  })
  it('point along a line, including extension beyond the end', () => {
    close(pointAlong(vec(0, 0), vec(10, 0), 4), vec(4, 0))
    close(pointAlong(vec(0, 0), vec(0, 10), 25), vec(0, 25))
    close(pointAlong(vec(0, 0), vec(3, 4), -5), vec(-3, -4))
  })
  it('perpendicular foot', () => {
    close(perpendicularFoot(vec(5, 7), vec(0, 0), vec(10, 0)), vec(5, 0))
    const foot = perpendicularFoot(vec(0, 10), vec(0, 0), vec(10, 10))
    close(foot, vec(5, 5))
    // Foot outside the segment is still on the infinite line.
    close(perpendicularFoot(vec(-5, 3), vec(0, 0), vec(10, 0)), vec(-5, 0))
  })
  it('signed distance to a line', () => {
    expect(signedDistanceToLine(vec(5, 3), vec(0, 0), vec(10, 0))).toBeCloseTo(3)
    expect(signedDistanceToLine(vec(5, -3), vec(0, 0), vec(10, 0))).toBeCloseTo(-3)
  })
})
