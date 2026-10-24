/** Line segments, generic segment operations and paths (ordered chains of segments). */
import {
  type BBox,
  type CubicBezier,
  type CurveSample,
  bezierBBox,
  bezierLength,
  bezierPoint,
  bezierPointAtLength,
  bezierTangent,
  cubic,
  flattenBezier,
  reverseBezier,
} from './bezier'
import { distance, lerp, mirror, normalize, rotate, sub, type Vec } from './vec'

export interface LineSeg {
  readonly kind: 'line'
  readonly id: string
  readonly p0: Vec
  readonly p1: Vec
}

export type Segment = LineSeg | CubicBezier

export interface Path {
  readonly segments: readonly Segment[]
  readonly closed: boolean
}

export const line = (id: string, p0: Vec, p1: Vec): LineSeg => ({ kind: 'line', id, p0, p1 })

export const path = (segments: readonly Segment[], closed = false): Path => ({ segments, closed })

export const segStart = (s: Segment): Vec => s.p0
export const segEnd = (s: Segment): Vec => (s.kind === 'line' ? s.p1 : s.p3)

export const segmentLength = (s: Segment): number =>
  s.kind === 'line' ? distance(s.p0, s.p1) : bezierLength(s)

/** Point at parameter t ∈ [0, 1] (linear parameter for lines). */
export const segmentPoint = (s: Segment, t: number): Vec =>
  s.kind === 'line' ? lerp(s.p0, s.p1, t) : bezierPoint(s, t)

/** Unit tangent at parameter t. */
export const segmentTangent = (s: Segment, t: number): Vec =>
  s.kind === 'line' ? normalize(sub(s.p1, s.p0)) : bezierTangent(s, t)

/** Point and unit tangent at arc length `len` from the segment start. */
export const segmentPointAtLength = (s: Segment, len: number): CurveSample => {
  if (s.kind === 'cubic') return bezierPointAtLength(s, len)
  const l = distance(s.p0, s.p1)
  const t = l === 0 ? 0 : Math.max(0, Math.min(1, len / l))
  return { point: lerp(s.p0, s.p1, t), tangent: normalize(sub(s.p1, s.p0)), t }
}

export const reverseSegment = (s: Segment, id = s.id): Segment =>
  s.kind === 'line' ? line(id, s.p1, s.p0) : reverseBezier(s, id)

/** Apply a point transform to every control point (affine transforms keep Béziers exact). */
export const mapSegment = (s: Segment, f: (p: Vec) => Vec): Segment =>
  s.kind === 'line' ? line(s.id, f(s.p0), f(s.p1)) : cubic(s.id, f(s.p0), f(s.p1), f(s.p2), f(s.p3))

export const segmentBBox = (s: Segment): BBox =>
  s.kind === 'line'
    ? {
        minX: Math.min(s.p0.x, s.p1.x),
        minY: Math.min(s.p0.y, s.p1.y),
        maxX: Math.max(s.p0.x, s.p1.x),
        maxY: Math.max(s.p0.y, s.p1.y),
      }
    : bezierBBox(s)

/** Polyline approximation (chord error ≤ tolerance), including both endpoints. */
export const flattenSegment = (s: Segment, tolerance = 0.01): Vec[] =>
  s.kind === 'line' ? [s.p0, s.p1] : flattenBezier(s, tolerance)

// ---------- paths ----------

export const pathLength = (p: Path): number =>
  p.segments.reduce((sum, s) => sum + segmentLength(s), 0)

export const unionBBox = (boxes: readonly BBox[]): BBox => ({
  minX: Math.min(...boxes.map((b) => b.minX)),
  minY: Math.min(...boxes.map((b) => b.minY)),
  maxX: Math.max(...boxes.map((b) => b.maxX)),
  maxY: Math.max(...boxes.map((b) => b.maxY)),
})

/** Tight bounding box of the path. Throws on an empty path. */
export const pathBBox = (p: Path): BBox => {
  if (p.segments.length === 0) throw new Error('pathBBox: empty path')
  return unionBBox(p.segments.map(segmentBBox))
}

/** Reverse traversal direction. Segment ids are preserved (an edge keeps its identity). */
export const reversePath = (p: Path): Path =>
  path(
    [...p.segments].reverse().map((s) => reverseSegment(s)),
    p.closed,
  )

export const mapPath = (p: Path, f: (q: Vec) => Vec): Path =>
  path(
    p.segments.map((s) => mapSegment(s, f)),
    p.closed,
  )

export const rotatePath = (p: Path, theta: number, pivot?: Vec): Path =>
  mapPath(p, (q) => rotate(q, theta, pivot))

/**
 * Mirror across the line ab. Mirroring flips orientation, so the result is also reversed to keep
 * the same winding sense as the input (segment ids preserved).
 */
export const mirrorPath = (p: Path, a: Vec, b: Vec): Path =>
  reversePath(mapPath(p, (q) => mirror(q, a, b)))

/** Point and tangent at arc length `len` along the whole path (clamped to its ends). */
export const pathPointAtLength = (p: Path, len: number): CurveSample & { segmentId: string } => {
  if (p.segments.length === 0) throw new Error('pathPointAtLength: empty path')
  let rest = Math.max(0, len)
  for (const s of p.segments) {
    const l = segmentLength(s)
    if (rest <= l) return { ...segmentPointAtLength(s, rest), segmentId: s.id }
    rest -= l
  }
  const last = p.segments[p.segments.length - 1]
  return { ...segmentPointAtLength(last, segmentLength(last)), segmentId: last.id }
}

/** Polyline approximation of the whole path (closing point not repeated for closed paths). */
export const flattenPath = (p: Path, tolerance = 0.01): Vec[] => {
  const out: Vec[] = []
  p.segments.forEach((s, i) => {
    const pts = flattenSegment(s, tolerance)
    out.push(...(i === 0 ? pts : pts.slice(1)))
  })
  if (p.closed && out.length > 1 && distance(out[0], out[out.length - 1]) < 1e-9) out.pop()
  return out
}

/** Shoelace signed area of a polygon (positive when it turns from +x towards +y). */
export const polygonSignedArea = (pts: readonly Vec[]): number => {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

/** Signed area enclosed by a closed path (sign = winding, see polygonSignedArea). */
export const pathSignedArea = (p: Path): number => polygonSignedArea(flattenPath(p, 0.001))

/** True when consecutive segments share endpoints (and the last meets the first if closed). */
export const isContinuous = (p: Path, tolerance = 1e-6): boolean => {
  const segs = p.segments
  for (let i = 1; i < segs.length; i++)
    if (distance(segEnd(segs[i - 1]), segStart(segs[i])) > tolerance) return false
  if (p.closed && segs.length > 0)
    return distance(segEnd(segs[segs.length - 1]), segStart(segs[0])) <= tolerance
  return true
}

/** SVG path data (`d` attribute) with coordinates in mm. */
export const toSvgPathData = (p: Path, digits = 3): string => {
  if (p.segments.length === 0) return ''
  const f = (n: number) => Number(n.toFixed(digits)).toString()
  const pt = (v: Vec) => `${f(v.x)} ${f(v.y)}`
  const parts = [`M ${pt(p.segments[0].p0)}`]
  for (const s of p.segments)
    parts.push(s.kind === 'line' ? `L ${pt(s.p1)}` : `C ${pt(s.p1)} ${pt(s.p2)} ${pt(s.p3)}`)
  if (p.closed) parts.push('Z')
  return parts.join(' ')
}
