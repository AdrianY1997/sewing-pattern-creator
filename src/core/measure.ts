/**
 * Measuring helpers for the "Medir" tool: arc-length position of a point on a path, the length
 * between two points along a closed outline, and the length of a chain of contiguous segments.
 */
import { bezierLength, nearestOnBezier } from './bezier'
import { segEnd, segmentLength, type Path, type Segment } from './path'
import { distance, projectParam, type Vec } from './vec'

export interface PathPosition {
  /** Arc length from the start of the path to the foot of `p` (mm). */
  readonly s: number
  /** Distance from `p` to the path (mm). */
  readonly distance: number
}

const footOnSegment = (seg: Segment, p: Vec): { len: number; distance: number } => {
  if (seg.kind === 'cubic') {
    const n = nearestOnBezier(seg, p, 64)
    return { len: bezierLength(seg, 0, n.t), distance: n.distance }
  }
  const l = distance(seg.p0, seg.p1)
  if (l < 1e-12) return { len: 0, distance: distance(p, seg.p0) }
  const u = Math.max(0, Math.min(1, projectParam(p, seg.p0, seg.p1)))
  const foot = { x: seg.p0.x + (seg.p1.x - seg.p0.x) * u, y: seg.p0.y + (seg.p1.y - seg.p0.y) * u }
  return { len: u * l, distance: distance(p, foot) }
}

/** Arc-length position of the point of `path` nearest to `p`. */
export function positionOnPath(path: Path, p: Vec): PathPosition {
  let acc = 0
  let best: PathPosition = { s: 0, distance: Infinity }
  for (const seg of path.segments) {
    const f = footOnSegment(seg, p)
    if (f.distance < best.distance) best = { s: acc + f.len, distance: f.distance }
    acc += segmentLength(seg)
  }
  return best
}

export interface OutlineSpan {
  /** Length from a to b in the path's direction (mm). */
  readonly forward: number
  /** Length from a to b the other way round (mm). */
  readonly backward: number
  /** The shorter of the two. */
  readonly shortest: number
  /** Distances of a and b to the outline (mm). */
  readonly offA: number
  readonly offB: number
}

/** Lengths between two points (projected on the outline) along a closed path, both ways round. */
export function lengthBetweenOnClosedPath(path: Path, a: Vec, b: Vec): OutlineSpan {
  const total = path.segments.reduce((t, s) => t + segmentLength(s), 0)
  const pa = positionOnPath(path, a)
  const pb = positionOnPath(path, b)
  const forward = (((pb.s - pa.s) % total) + total) % total
  const backward = forward === 0 ? 0 : total - forward
  return {
    forward,
    backward,
    shortest: Math.min(forward, backward),
    offA: pa.distance,
    offB: pb.distance,
  }
}

/**
 * True when every segment shares an end (within `tol` mm) with the next one, whatever their
 * directions: a chain of edges the user shift-clicked in order.
 */
export function isContiguousChain(segments: readonly Segment[], tol = 0.01): boolean {
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1]
    const b = segments[i]
    const ends = [a.p0, segEnd(a)]
    if (!ends.some((p) => distance(p, b.p0) <= tol || distance(p, segEnd(b)) <= tol)) return false
  }
  return true
}

/** Total arc length of a list of segments (mm). */
export const segmentsLength = (segments: readonly Segment[]): number =>
  segments.reduce((t, s) => t + segmentLength(s), 0)
