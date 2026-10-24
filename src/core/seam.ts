/**
 * Seam allowance (cut line) of a closed outline: per-edge offset (offsetPath, mitred corners and
 * mirrored hem corners) followed by the removal of self-intersection loops, so the result is
 * always one simple closed path.
 */
import { bezierBBox, subBezier, type BBox } from './bezier'
import { intersectSegments, pathSelfIntersections } from './intersect'
import { offsetPath } from './offset'
import {
  flattenPath,
  line,
  path,
  polygonSignedArea,
  segEnd,
  segmentLength,
  type Path,
  type Segment,
} from './path'
import { distance, lerp, type Vec } from './vec'

const subSeg = (s: Segment, t0: number, t1: number): Segment =>
  s.kind === 'line' ? line(s.id, lerp(s.p0, s.p1, t0), lerp(s.p0, s.p1, t1)) : subBezier(s, t0, t1)

const segBox = (s: Segment): BBox =>
  s.kind === 'line'
    ? {
        minX: Math.min(s.p0.x, s.p1.x),
        minY: Math.min(s.p0.y, s.p1.y),
        maxX: Math.max(s.p0.x, s.p1.x),
        maxY: Math.max(s.p0.y, s.p1.y),
      }
    : bezierBBox(s)

const boxesTouch = (a: BBox, b: BBox, pad = 1e-6) =>
  !(
    a.maxX + pad < b.minX ||
    b.maxX + pad < a.minX ||
    a.maxY + pad < b.minY ||
    b.maxY + pad < a.minY
  )

const areaOf = (segs: readonly Segment[]): number =>
  polygonSignedArea(flattenPath(path(segs, true), 0.05))

/** Drop degenerate segments and snap consecutive ends together (closed chain). */
const tidy = (segs: readonly Segment[]): Segment[] => {
  const kept = segs.filter((s) => segmentLength(s) > 1e-7)
  const n = kept.length
  return kept.map((s, k) => {
    const next = kept[(k + 1) % n]
    const e = next.p0
    if (distance(segEnd(s), e) > 1e-4) return s
    return s.kind === 'line' ? line(s.id, s.p0, e) : { ...s, p3: e }
  })
}

interface Crossing {
  readonly a: number
  readonly b: number
  readonly t1: number
  readonly t2: number
  readonly point: Vec
}

/** First crossing between two segments of the closed chain that is not their shared end. */
const firstCrossing = (segs: readonly Segment[]): Crossing | null => {
  const n = segs.length
  const boxes = segs.map(segBox)
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (!boxesTouch(boxes[a], boxes[b])) continue
      const adjacentNext = b === a + 1
      const adjacentWrap = a === 0 && b === n - 1
      for (const h of intersectSegments(segs[a], segs[b])) {
        if (adjacentNext && distance(h.point, segEnd(segs[a])) < 1e-6) continue
        if (adjacentWrap && distance(h.point, segs[a].p0) < 1e-6) continue
        return { a, b, t1: h.t1, t2: h.t2, point: h.point }
      }
    }
  }
  return null
}

/**
 * Remove the loops of a closed path that crosses itself. At each crossing the path splits into two
 * closed loops; the one whose winding matches `winding` (sign of the signed area of the source
 * outline) and is the larger is kept. Offset swallowtails (an allowance wider than a short edge, or
 * a narrow concave notch) wind the opposite way and are dropped. When the curve-level pass cannot
 * make the path simple, the same procedure runs on its polyline (always terminates simple).
 */
export function removeSelfIntersections(input: Path, winding: number): Path {
  let segs = tidy(input.segments)
  for (let iter = 0; iter < 64 && segs.length > 2; iter++) {
    const c = firstCrossing(segs)
    if (!c) break
    const { a, b, t1, t2, point } = c
    const n = segs.length
    const inner = [subSeg(segs[a], t1, 1), ...segs.slice(a + 1, b), subSeg(segs[b], 0, t2)]
    const outer = [
      subSeg(segs[b], t2, 1),
      ...segs.slice(b + 1, n),
      ...segs.slice(0, a),
      subSeg(segs[a], 0, t1),
    ]
    const fix = (list: Segment[]) => {
      // Exact crossing point at both ends of the loop.
      const first = list[0]
      const last = list[list.length - 1]
      list[0] = first.kind === 'line' ? line(first.id, point, first.p1) : { ...first, p0: point }
      list[list.length - 1] =
        last.kind === 'line' ? line(last.id, last.p0, point) : { ...last, p3: point }
      return tidy(list)
    }
    const loops = [fix(inner), fix(outer)].filter((l) => l.length > 0)
    if (loops.length === 0) break
    const scored = loops.map((l) => ({ l, area: areaOf(l) }))
    const matching = scored.filter((x) => Math.sign(x.area) === Math.sign(winding))
    const pool = matching.length ? matching : scored
    segs = pool.reduce((x, y) => (Math.abs(y.area) > Math.abs(x.area) ? y : x)).l
  }
  const out = path(segs, true)
  if (pathSelfIntersections(out, 0.02).length === 0) return out
  return removePolylineLoops(out, winding)
}

/** Polyline fallback of removeSelfIntersections. */
function removePolylineLoops(p: Path, winding: number): Path {
  const id = p.segments[0]?.id ?? 'cut'
  let pts = flattenPath(p, 0.02)
  for (let iter = 0; iter < 256; iter++) {
    const segs = pts.map((q, k) => line(id, q, pts[(k + 1) % pts.length]))
    const c = firstCrossing(segs)
    if (!c) break
    const inner = [c.point, ...pts.slice(c.a + 1, c.b + 1)]
    const outer = [c.point, ...pts.slice(c.b + 1), ...pts.slice(0, c.a + 1)]
    const scored = [inner, outer]
      .filter((l) => l.length >= 3)
      .map((l) => ({ l, area: polygonSignedArea(l) }))
    if (scored.length === 0) break
    const matching = scored.filter((x) => Math.sign(x.area) === Math.sign(winding))
    const pool = matching.length ? matching : scored
    pts = pool.reduce((x, y) => (Math.abs(y.area) > Math.abs(x.area) ? y : x)).l
  }
  return path(
    pts.map((q, k) => line(`${id}~poly.${k}`, q, pts[(k + 1) % pts.length])),
    true,
  )
}

export interface SeamAllowanceOptions {
  /** Hem edges: their corners with the neighbouring edges are mirrored (see offsetPath). */
  readonly hemEdges?: Iterable<string>
}

/**
 * Cut line of a piece: `outline` offset outward by `distances[segmentId]` mm (missing ids: 0),
 * with mitred corners, mirrored hem corners and no self-intersection loops. Returns null when
 * every distance is 0 (the cut line is the seam line).
 */
export function seamAllowancePath(
  outline: Path,
  distances: Readonly<Record<string, number>>,
  options: SeamAllowanceOptions = {},
): Path | null {
  if (!outline.segments.some((s) => (distances[s.id] ?? 0) > 0)) return null
  const winding = polygonSignedArea(flattenPath(outline, 0.05))
  const raw = offsetPath(outline, distances, { defaultDistance: 0, hemEdges: options.hemEdges })
  return removeSelfIntersections(raw, winding)
}
