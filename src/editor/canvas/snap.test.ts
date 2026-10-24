import { describe, expect, it } from 'vitest'
import { bezierPoint, cubic, distance, line, nearestOnBezier, vec } from '../../core'
import {
  SNAP_PRIORITY,
  buildSnapIndex,
  gridSnapStep,
  pointsAt,
  segmentMidpoint,
  snap,
} from './snap'

// a: horizontal 0..100 on y=0 (midpoint 50,0); b: vertical x=30 crossing a at (30,0);
// c: symmetric cubic arch from (0,100) to (100,100) with its top at (50,70).
const a = line('a', vec(0, 0), vec(100, 0))
const b = line('b', vec(30, -50), vec(30, 50))
const c = cubic('c', vec(0, 100), vec(30, 60), vec(70, 60), vec(100, 100))
const points = [
  { name: 'P1', at: vec(0, 0) },
  { name: 'P1b', at: vec(0, 0) },
  { name: 'Q', at: vec(200, -200) },
]
const index = buildSnapIndex(points, [a, b, c])
const at = (x: number, y: number, scale = 1, extra = {}) =>
  snap(index, vec(x, y), { scale, ...extra })

describe('snap engine', () => {
  it('precomputes endpoints, midpoints and crossings (not joins)', () => {
    expect(index.endpoints).toHaveLength(6)
    expect(index.midpoints.map((m) => m.at)).toContainEqual(vec(50, 0))
    expect(index.intersections).toHaveLength(1)
    expect(index.intersections[0].at.x).toBeCloseTo(30, 9)
    expect(index.intersections[0].at.y).toBeCloseTo(0, 9)
    const joined = buildSnapIndex([], [a, line('d', vec(100, 0), vec(100, 50))])
    expect(joined.intersections).toHaveLength(0)
    expect(joined.endpoints).toHaveLength(3)
  })

  it('snaps to a named point', () => {
    expect(at(2, 1)).toMatchObject({ kind: 'point', at: vec(0, 0), name: 'P1' })
  })

  it('snaps to a segment endpoint', () => {
    expect(at(98, 2)).toMatchObject({ kind: 'endpoint', at: vec(100, 0), segmentId: 'a' })
  })

  it('snaps to an intersection', () => {
    const r = at(32, 3)
    expect(r?.kind).toBe('intersection')
    expect(r?.at.x).toBeCloseTo(30, 9)
  })

  it('snaps to a segment midpoint (arc length for curves)', () => {
    expect(at(52, 3)).toMatchObject({ kind: 'midpoint', at: vec(50, 0), segmentId: 'a' })
    const m = segmentMidpoint(c)
    expect(m.x).toBeCloseTo(50, 6)
    expect(m.y).toBeCloseTo(70, 6)
  })

  it('snaps to the nearest point on a line or curve', () => {
    expect(at(70, 4)).toMatchObject({ kind: 'curve', at: vec(70, 0), segmentId: 'a' })
    const r = at(20, 85)
    expect(r?.kind).toBe('curve')
    expect(r?.segmentId).toBe('c')
    const onCurve = nearestOnBezier(c, r!.at)
    expect(onCurve.distance).toBeLessThan(1e-6)
    expect(distance(r!.at, bezierPoint(c, onCurve.t))).toBeLessThan(1e-6)
  })

  it('falls back to the grid: 1 cm normally, 1 mm when zoomed in', () => {
    expect(gridSnapStep(1)).toBe(10)
    expect(gridSnapStep(12)).toBe(1)
    expect(at(203, 198)).toMatchObject({ kind: 'grid', at: vec(200, 200) })
    expect(at(203.3, 198.2, 12)).toMatchObject({ kind: 'grid', at: vec(203, 198) })
    expect(at(203, 198, 1, { grid: false })).toBeNull()
  })

  it('follows the priority order when several targets are in range', () => {
    expect(SNAP_PRIORITY).toEqual([
      'point',
      'endpoint',
      'intersection',
      'midpoint',
      'curve',
      'grid',
    ])
    // (0,0) is both a named point and an endpoint of a: the point wins.
    expect(at(1, 1)?.kind).toBe('point')
    expect(at(1, 1, 1, { disabled: ['point'] })?.kind).toBe('endpoint')
    // Near the crossing the curve (line a) is closer than the crossing itself, but ranks lower.
    expect(at(36, 1)?.kind).toBe('intersection')
    // (b's midpoint is the crossing too.)
    expect(at(36, 1, 1, { disabled: ['intersection', 'midpoint'] })?.kind).toBe('curve')
  })

  it('uses a tolerance in screen pixels that scales with the zoom', () => {
    expect(at(0, 6)?.kind).toBe('point') // 6 px away
    expect(at(0, 6, 2)?.kind).not.toBe('point') // 12 px away
    expect(at(0, 6, 1, { tolerancePx: 5 })?.kind).not.toBe('point')
    expect(at(0, 9)?.distancePx).toBeCloseTo(9, 9)
    expect(at(500, 505, 1, { grid: false })).toBeNull()
  })

  it('returns every named point at the hovered spot', () => {
    expect(pointsAt(points, vec(3, 3), 1).map((p) => p.name)).toEqual(['P1', 'P1b'])
    expect(pointsAt(points, vec(30, 30), 1)).toEqual([])
    expect(pointsAt(points, vec(205, -200), 2)).toEqual([]) // 5 mm = 10 px > 8 px
  })
})
