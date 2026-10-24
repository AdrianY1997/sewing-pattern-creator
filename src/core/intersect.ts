/**
 * Intersections between lines, segments and cubic Béziers.
 * Overlapping collinear / coincident geometry is reported as "no intersection".
 */
import { type CubicBezier, bezierBBox, bezierDerivative, bezierPoint, splitBezier } from './bezier'
import { solveCubic } from './poly'
import { flattenPath, segEnd, segmentPoint, type Path, type Segment } from './path'
import { cross, distance, dot, lerp, normalize, perp, projectParam, sub, type Vec } from './vec'

/** Parameter tolerance used to accept hits at segment ends. */
const PARAM_EPS = 1e-9

export interface LineHit {
  readonly point: Vec
  /** Parameter along the first line (0 at a1, 1 at a2). */
  readonly u: number
  /** Parameter along the second line (0 at b1, 1 at b2). */
  readonly v: number
}

/** Intersection of the infinite lines a1a2 and b1b2 with both parameters, or null if parallel. */
export const lineLineParams = (a1: Vec, a2: Vec, b1: Vec, b2: Vec): LineHit | null => {
  const r = sub(a2, a1)
  const s = sub(b2, b1)
  const den = cross(r, s)
  const scaleRef = Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y)
  if (scaleRef === 0 || Math.abs(den) <= 1e-12 * scaleRef) return null
  const w = sub(b1, a1)
  const u = cross(w, s) / den
  const v = cross(w, r) / den
  return { point: lerp(a1, a2, u), u, v }
}

/** Intersection point of the infinite lines a1a2 and b1b2, or null if parallel. */
export const lineLineIntersection = (a1: Vec, a2: Vec, b1: Vec, b2: Vec): Vec | null =>
  lineLineParams(a1, a2, b1, b2)?.point ?? null

/** Intersection of the closed segments [a1,a2] and [b1,b2], or null. */
export const segmentSegmentIntersection = (a1: Vec, a2: Vec, b1: Vec, b2: Vec): Vec | null => {
  const hit = lineLineParams(a1, a2, b1, b2)
  if (!hit) return null
  const inside = (x: number) => x >= -PARAM_EPS && x <= 1 + PARAM_EPS
  return inside(hit.u) && inside(hit.v) ? hit.point : null
}

export interface CurveHit {
  readonly point: Vec
  /** Parameter on the Bézier. */
  readonly t: number
  /** Parameter on the line (0 at a, 1 at b). */
  readonly u: number
}

/**
 * Intersections of the line through `a`,`b` with a cubic Bézier, sorted by t. With
 * `bounded: true` only hits within the segment [a, b] are kept.
 */
export const lineBezierIntersections = (
  a: Vec,
  b: Vec,
  bez: CubicBezier,
  options: { bounded?: boolean } = {},
): CurveHit[] => {
  const n = normalize(perp(sub(b, a)))
  if (n.x === 0 && n.y === 0) throw new Error('lineBezierIntersections: degenerate line (a == b)')
  const { p0, p1, p2, p3 } = bez
  const c3 = dot(n, { x: p3.x - 3 * p2.x + 3 * p1.x - p0.x, y: p3.y - 3 * p2.y + 3 * p1.y - p0.y })
  const c2 = 3 * dot(n, { x: p2.x - 2 * p1.x + p0.x, y: p2.y - 2 * p1.y + p0.y })
  const c1 = 3 * dot(n, sub(p1, p0))
  const c0 = dot(n, sub(p0, a))
  const hits: CurveHit[] = []
  for (const root of solveCubic(c3, c2, c1, c0)) {
    if (root < -1e-7 || root > 1 + 1e-7) continue
    const t = Math.max(0, Math.min(1, root))
    const point = bezierPoint(bez, t)
    const u = projectParam(point, a, b)
    if (options.bounded && (u < -1e-7 || u > 1 + 1e-7)) continue
    if (hits.some((h) => Math.abs(h.t - t) < 1e-9 || distance(h.point, point) < 1e-7)) continue
    hits.push({ point, t, u })
  }
  return hits.sort((h1, h2) => h1.t - h2.t)
}

// ---------- generic segment × segment ----------

export interface SegmentHit {
  readonly point: Vec
  /** Parameter on the first segment. */
  readonly t1: number
  /** Parameter on the second segment. */
  readonly t2: number
}

interface Sub {
  readonly c: CubicBezier
  readonly t0: number
  readonly t1: number
}

const overlaps = (a: CubicBezier, b: CubicBezier, pad: number): boolean => {
  const A = bezierBBox(a)
  const B = bezierBBox(b)
  return !(
    A.maxX + pad < B.minX ||
    B.maxX + pad < A.minX ||
    A.maxY + pad < B.minY ||
    B.maxY + pad < A.minY
  )
}

const flatness = (c: CubicBezier): number => {
  const l = distance(c.p0, c.p3)
  if (l < 1e-12) return Math.max(distance(c.p1, c.p0), distance(c.p2, c.p0))
  const ch = sub(c.p3, c.p0)
  return Math.max(Math.abs(cross(ch, sub(c.p1, c.p0))), Math.abs(cross(ch, sub(c.p2, c.p0)))) / l
}

/** Newton refinement of B1(t) = B2(u). */
const refine = (a: CubicBezier, b: CubicBezier, t: number, u: number): [number, number] => {
  for (let i = 0; i < 12; i++) {
    const f = sub(bezierPoint(a, t), bezierPoint(b, u))
    if (Math.hypot(f.x, f.y) < 1e-10) break
    const da = bezierDerivative(a, t)
    const db = bezierDerivative(b, u)
    // Solve [da, -db] [dt, du]^T = -f
    const det = -da.x * db.y + db.x * da.y
    if (Math.abs(det) < 1e-14) break
    const dt = (-f.x * -db.y - -db.x * -f.y) / det
    const du = (da.x * -f.y - da.y * -f.x) / det
    t = Math.max(0, Math.min(1, t + dt))
    u = Math.max(0, Math.min(1, u + du))
  }
  return [t, u]
}

const bezierBezier = (a: CubicBezier, b: CubicBezier): SegmentHit[] => {
  const hits: SegmentHit[] = []
  const stack: Array<[Sub, Sub, number]> = [[{ c: a, t0: 0, t1: 1 }, { c: b, t0: 0, t1: 1 }, 0]]
  while (stack.length > 0) {
    const [sa, sb, depth] = stack.pop()!
    if (!overlaps(sa.c, sb.c, 1e-6)) continue
    const fa = flatness(sa.c)
    const fb = flatness(sb.c)
    if ((fa < 1e-3 && fb < 1e-3) || depth > 48) {
      const hit = lineLineParams(sa.c.p0, sa.c.p3, sb.c.p0, sb.c.p3)
      if (!hit || hit.u < -0.01 || hit.u > 1.01 || hit.v < -0.01 || hit.v > 1.01) continue
      const t0 = sa.t0 + (sa.t1 - sa.t0) * Math.max(0, Math.min(1, hit.u))
      const u0 = sb.t0 + (sb.t1 - sb.t0) * Math.max(0, Math.min(1, hit.v))
      const [t, u] = refine(a, b, t0, u0)
      const point = bezierPoint(a, t)
      if (distance(point, bezierPoint(b, u)) > 1e-6) continue
      if (hits.some((h) => distance(h.point, point) < 1e-6)) continue
      hits.push({ point, t1: t, t2: u })
      continue
    }
    if (fa >= fb) {
      const m = (sa.t0 + sa.t1) / 2
      const [l, r] = splitBezier(sa.c, 0.5)
      stack.push(
        [{ c: l, t0: sa.t0, t1: m }, sb, depth + 1],
        [{ c: r, t0: m, t1: sa.t1 }, sb, depth + 1],
      )
    } else {
      const m = (sb.t0 + sb.t1) / 2
      const [l, r] = splitBezier(sb.c, 0.5)
      stack.push(
        [sa, { c: l, t0: sb.t0, t1: m }, depth + 1],
        [sa, { c: r, t0: m, t1: sb.t1 }, depth + 1],
      )
    }
  }
  return hits.sort((h1, h2) => h1.t1 - h2.t1)
}

/** All intersections between two segments (line or cubic), sorted by t1. */
export const intersectSegments = (s1: Segment, s2: Segment): SegmentHit[] => {
  if (s1.kind === 'line' && s2.kind === 'line') {
    const hit = lineLineParams(s1.p0, s1.p1, s2.p0, s2.p1)
    if (!hit) return []
    const inside = (x: number) => x >= -PARAM_EPS && x <= 1 + PARAM_EPS
    if (!inside(hit.u) || !inside(hit.v)) return []
    const t1 = Math.max(0, Math.min(1, hit.u))
    return [{ point: segmentPoint(s1, t1), t1, t2: Math.max(0, Math.min(1, hit.v)) }]
  }
  if (s1.kind === 'line' && s2.kind === 'cubic')
    return lineBezierIntersections(s1.p0, s1.p1, s2, { bounded: true }).map((h) => ({
      point: h.point,
      t1: Math.max(0, Math.min(1, h.u)),
      t2: h.t,
    }))
  if (s1.kind === 'cubic' && s2.kind === 'line')
    return intersectSegments(s2, s1)
      .map((h) => ({ point: h.point, t1: h.t2, t2: h.t1 }))
      .sort((h1, h2) => h1.t1 - h2.t1)
  return bezierBezier(s1 as CubicBezier, s2 as CubicBezier)
}

/** Convenience: intersections of an infinite line with any segment (unbounded on the line). */
export const lineSegmentIntersections = (a: Vec, b: Vec, s: Segment): Vec[] => {
  if (s.kind === 'cubic') return lineBezierIntersections(a, b, s).map((h) => h.point)
  const hit = lineLineParams(a, b, s.p0, segEnd(s))
  return hit && hit.v >= -PARAM_EPS && hit.v <= 1 + PARAM_EPS ? [hit.point] : []
}

// ---------- circles ----------

/**
 * Intersections of the circles (c1, r1) and (c2, r2): 0, 1 (tangent) or 2 points. With two
 * points, the first is on the `-perp(c2 - c1)` side, i.e. to the left of c1 → c2 as seen on screen
 * (y down). Coincident circles return [].
 */
export const circleCircleIntersections = (c1: Vec, r1: number, c2: Vec, r2: number): Vec[] => {
  const d = distance(c1, c2)
  if (d < 1e-12 || r1 < 0 || r2 < 0) return []
  if (d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return []
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const h2 = r1 * r1 - a * a
  const u = normalize(sub(c2, c1))
  const base = { x: c1.x + u.x * a, y: c1.y + u.y * a }
  if (h2 <= 1e-12 * Math.max(1, r1 * r1)) return [base]
  const h = Math.sqrt(h2)
  const n = perp(u)
  return [
    { x: base.x - n.x * h, y: base.y - n.y * h },
    { x: base.x + n.x * h, y: base.y + n.y * h },
  ]
}

// ---------- self-intersection ----------

/**
 * Points where a path crosses itself, found on its polyline approximation (chord error ≤
 * `tolerance` mm). Adjacent polyline edges only touch at their shared vertex and are ignored, as
 * is the closing joint of a closed path. Returns [] for a simple path.
 */
export const pathSelfIntersections = (p: Path, tolerance = 0.05): Vec[] => {
  const pts = flattenPath(p, tolerance)
  const n = pts.length
  const edges = p.closed ? n : n - 1
  const hits: Vec[] = []
  for (let i = 0; i < edges; i++) {
    const a1 = pts[i]
    const a2 = pts[(i + 1) % n]
    const minX = Math.min(a1.x, a2.x)
    const maxX = Math.max(a1.x, a2.x)
    const minY = Math.min(a1.y, a2.y)
    const maxY = Math.max(a1.y, a2.y)
    for (let j = i + 2; j < edges; j++) {
      if (p.closed && i === 0 && j === edges - 1) continue
      const b1 = pts[j]
      const b2 = pts[(j + 1) % n]
      if (
        Math.max(b1.x, b2.x) < minX ||
        Math.min(b1.x, b2.x) > maxX ||
        Math.max(b1.y, b2.y) < minY ||
        Math.min(b1.y, b2.y) > maxY
      )
        continue
      const hit = segmentSegmentIntersection(a1, a2, b1, b2)
      if (hit) hits.push(hit)
    }
  }
  return hits
}
