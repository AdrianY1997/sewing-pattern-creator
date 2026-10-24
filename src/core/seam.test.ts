import { describe, expect, it } from 'vitest'
import { nearestOnBezier } from './bezier'
import { pathSelfIntersections } from './intersect'
import { offsetPath } from './offset'
import {
  flattenPath,
  isContinuous,
  line,
  path,
  pathBBox,
  reversePath,
  segmentPoint,
  type Path,
  type Segment,
} from './path'
import { removeSelfIntersections, seamAllowancePath } from './seam'
import {
  distance,
  perpendicularFoot,
  projectParam,
  signedDistanceToLine,
  vec,
  type Vec,
} from './vec'

const distToSegment = (p: Vec, s: Segment): number => {
  if (s.kind === 'cubic') return nearestOnBezier(s, p).distance
  const u = projectParam(p, s.p0, s.p1)
  if (u <= 0) return distance(p, s.p0)
  if (u >= 1) return distance(p, s.p1)
  return distance(p, perpendicularFoot(p, s.p0, s.p1))
}
const distToPath = (p: Vec, q: Path) => Math.min(...q.segments.map((s) => distToSegment(p, s)))

const polygon = (pts: readonly Vec[], ids?: readonly string[]): Path =>
  path(
    pts.map((p, i) => line(ids?.[i] ?? `e${i}`, p, pts[(i + 1) % pts.length])),
    true,
  )

describe('seamAllowancePath: loop removal', () => {
  // 100 × 100 square with a 10 mm wide, 6 mm deep notch in the top edge: a 15 mm allowance is wider
  // than the notch, so the raw offset of its short edges crosses itself.
  const notched = polygon([
    vec(0, 0),
    vec(45, 0),
    vec(45, 6),
    vec(55, 6),
    vec(55, 0),
    vec(100, 0),
    vec(100, 100),
    vec(0, 100),
  ])

  it('a short edge with a 15 mm allowance gives a simple closed path', () => {
    const raw = offsetPath(notched, 15)
    expect(pathSelfIntersections(raw).length).toBeGreaterThan(0)
    const d = Object.fromEntries(notched.segments.map((s) => [s.id, 15]))
    const cut = seamAllowancePath(notched, d)!
    expect(cut.closed).toBe(true)
    expect(isContinuous(cut, 1e-4)).toBe(true)
    expect(pathSelfIntersections(cut)).toEqual([])
    // The notch is bridged: the top of the cut line is straight at y = −15.
    const box = pathBBox(cut)
    expect(box.minY).toBeCloseTo(-15, 6)
    for (const p of flattenPath(cut, 0.05).filter((q) => q.x > 0 && q.x < 100 && q.y < 0))
      expect(p.y).toBeCloseTo(-15, 6)
    // No part of the cut line is closer to the outline than the allowance.
    for (const p of flattenPath(cut, 0.05)) expect(distToPath(p, notched)).toBeGreaterThan(15 - 0.1)
  })

  it('works for both windings and for a narrow spike', () => {
    const rev = reversePath(notched)
    const cut = seamAllowancePath(rev, {
      e0: 15,
      e1: 15,
      e2: 15,
      e3: 15,
      e4: 15,
      e5: 15,
      e6: 15,
      e7: 15,
    })!
    expect(pathSelfIntersections(cut)).toEqual([])
    // A 4 mm edge between two long concave-meeting edges (a V cut).
    const v = polygon([
      vec(0, 0),
      vec(48, 0),
      vec(50, 40),
      vec(52, 0),
      vec(100, 0),
      vec(100, 80),
      vec(0, 80),
    ])
    const all = Object.fromEntries(v.segments.map((s) => [s.id, 15]))
    const cv = seamAllowancePath(v, all)!
    expect(pathSelfIntersections(cv)).toEqual([])
    expect(isContinuous(cv, 1e-4)).toBe(true)
  })

  it('removeSelfIntersections keeps a simple path untouched', () => {
    const sq = polygon([vec(0, 0), vec(10, 0), vec(10, 10), vec(0, 10)])
    expect(removeSelfIntersections(sq, 1).segments).toHaveLength(4)
  })

  it('returns null when every allowance is 0', () => {
    expect(seamAllowancePath(notched, {})).toBeNull()
  })
})

describe('seamAllowancePath: mirrored hem corner', () => {
  // Flared skirt panel: waist, flared side seam, hem, centre back.
  const pts = [vec(0, 0), vec(100, 0), vec(160, 300), vec(0, 300)]
  const ids = ['waist', 'side', 'hem', 'cb']
  const panel = polygon(pts, ids)
  const side = { a: pts[1], b: pts[2] }
  const HEM_Y = 300
  const d = { waist: 10, side: 10, hem: 40, cb: 10 }

  /** Cut-line points of the hem allowance next to the side seam. */
  const cornerPoints = (cut: Path) =>
    cut.segments
      .flatMap((s) => Array.from({ length: 21 }, (_, k) => segmentPoint(s, k / 20)))
      .filter((p) => p.y > HEM_Y + 1e-6 && p.y < HEM_Y + d.hem - 1e-6 && p.x > 120)

  it.each([
    ['side → hem', panel],
    ['hem → side', reversePath(panel)],
  ])('folding the hem allowance up makes it coincide with the side allowance (%s)', (_, p) => {
    const cut = seamAllowancePath(p, d, { hemEdges: ['hem'] })!
    expect(pathSelfIntersections(cut)).toEqual([])
    const corner = cornerPoints(cut)
    expect(corner.length).toBeGreaterThan(1)
    for (const q of corner) {
      // Fold up along the hem line y = 300.
      const folded = vec(q.x, 2 * HEM_Y - q.y)
      expect(Math.abs(signedDistanceToLine(folded, side.a, side.b))).toBeCloseTo(d.side, 6)
    }
    // The corner reaches the full hem depth and slants inward (flared seam).
    const ys = flattenPath(cut, 0.01).map((q) => q.y)
    expect(Math.max(...ys)).toBeCloseTo(HEM_Y + d.hem, 6)
    const top = corner.reduce((a, b) => (b.y < a.y ? b : a))
    const bottom = corner.reduce((a, b) => (b.y > a.y ? b : a))
    expect(bottom.x).toBeLessThan(top.x)
  })

  it('a plain mitre would not match the folded side seam', () => {
    const cut = seamAllowancePath(panel, d)!
    const corner = cornerPoints(cut)
    const off = corner.map((q) =>
      Math.abs(Math.abs(signedDistanceToLine(vec(q.x, 2 * HEM_Y - q.y), side.a, side.b)) - d.side),
    )
    expect(Math.max(...off)).toBeGreaterThan(1)
  })

  it('a hem meeting a perpendicular seam gets a square corner', () => {
    const rect = polygon(
      [vec(0, 0), vec(100, 0), vec(100, 200), vec(0, 200)],
      ['w', 's', 'hem', 'c'],
    )
    const cut = seamAllowancePath(rect, { w: 10, s: 10, hem: 30, c: 10 }, { hemEdges: ['hem'] })!
    const box = pathBBox(cut)
    expect(box).toEqual({ minX: -10, minY: -10, maxX: 110, maxY: 230 })
    expect(flattenPath(cut, 0.01).some((q) => distance(q, vec(110, 230)) < 1e-6)).toBe(true)
  })
})
