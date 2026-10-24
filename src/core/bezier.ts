/** Cubic Bézier primitive: evaluation, arc length, splitting and curve construction. */
import { solveQuadratic } from './poly'
import {
  EPS,
  add,
  cross,
  distance,
  dot,
  length,
  lerp,
  normalize,
  scale,
  sub,
  vec,
  type Vec,
} from './vec'

export interface CubicBezier {
  readonly kind: 'cubic'
  readonly id: string
  readonly p0: Vec
  readonly p1: Vec
  readonly p2: Vec
  readonly p3: Vec
}

export const cubic = (id: string, p0: Vec, p1: Vec, p2: Vec, p3: Vec): CubicBezier => ({
  kind: 'cubic',
  id,
  p0,
  p1,
  p2,
  p3,
})

/** Point at parameter t ∈ [0, 1]. */
export const bezierPoint = (b: CubicBezier, t: number): Vec => {
  const mt = 1 - t
  const a = mt * mt * mt
  const c1 = 3 * mt * mt * t
  const c2 = 3 * mt * t * t
  const d = t * t * t
  return vec(
    a * b.p0.x + c1 * b.p1.x + c2 * b.p2.x + d * b.p3.x,
    a * b.p0.y + c1 * b.p1.y + c2 * b.p2.y + d * b.p3.y,
  )
}

/** First derivative dB/dt. */
export const bezierDerivative = (b: CubicBezier, t: number): Vec => {
  const mt = 1 - t
  const k0 = 3 * mt * mt
  const k1 = 6 * mt * t
  const k2 = 3 * t * t
  return vec(
    k0 * (b.p1.x - b.p0.x) + k1 * (b.p2.x - b.p1.x) + k2 * (b.p3.x - b.p2.x),
    k0 * (b.p1.y - b.p0.y) + k1 * (b.p2.y - b.p1.y) + k2 * (b.p3.y - b.p2.y),
  )
}

/** Second derivative d²B/dt². */
export const bezierSecondDerivative = (b: CubicBezier, t: number): Vec => {
  const mt = 1 - t
  return vec(
    6 * mt * (b.p2.x - 2 * b.p1.x + b.p0.x) + 6 * t * (b.p3.x - 2 * b.p2.x + b.p1.x),
    6 * mt * (b.p2.y - 2 * b.p1.y + b.p0.y) + 6 * t * (b.p3.y - 2 * b.p2.y + b.p1.y),
  )
}

/**
 * Unit tangent at t (direction of travel). Handles degenerate control points (e.g. p1 == p0)
 * by falling back to the next non-coincident control point.
 */
export const bezierTangent = (b: CubicBezier, t: number): Vec => {
  const d = bezierDerivative(b, t)
  if (length(d) > 1e-9 * Math.max(1, distance(b.p0, b.p3))) return normalize(d)
  if (t <= 0.5) {
    for (const q of [b.p1, b.p2, b.p3]) if (distance(q, b.p0) > EPS) return normalize(sub(q, b.p0))
  } else {
    for (const q of [b.p2, b.p1, b.p0]) if (distance(q, b.p3) > EPS) return normalize(sub(b.p3, q))
  }
  // Interior cusp: use the second derivative, else give up with a zero vector.
  return normalize(bezierSecondDerivative(b, t))
}

// ---------- arc length (adaptive Gauss–Legendre) ----------

const GL_X = [
  -0.9602898564975363, -0.796666477413627, -0.525532409916329, -0.1834346424956498,
  0.1834346424956498, 0.525532409916329, 0.796666477413627, 0.9602898564975363,
]
const GL_W = [
  0.1012285362903763, 0.2223810344533745, 0.313706645877887, 0.362683783378362, 0.362683783378362,
  0.313706645877887, 0.2223810344533745, 0.1012285362903763,
]

const gaussLegendre = (b: CubicBezier, t0: number, t1: number): number => {
  const half = (t1 - t0) / 2
  const mid = (t1 + t0) / 2
  let sum = 0
  for (let i = 0; i < GL_X.length; i++)
    sum += GL_W[i] * length(bezierDerivative(b, mid + half * GL_X[i]))
  return sum * half
}

const adaptiveLength = (
  b: CubicBezier,
  t0: number,
  t1: number,
  whole: number,
  tol: number,
  depth: number,
): number => {
  const m = (t0 + t1) / 2
  const left = gaussLegendre(b, t0, m)
  const right = gaussLegendre(b, m, t1)
  if (depth >= 24 || Math.abs(left + right - whole) <= tol) return left + right
  return (
    adaptiveLength(b, t0, m, left, tol / 2, depth + 1) +
    adaptiveLength(b, m, t1, right, tol / 2, depth + 1)
  )
}

/** Arc length between parameters t0 and t1 (default whole curve). Error ≲ 1e-6 mm. */
export const bezierLength = (b: CubicBezier, t0 = 0, t1 = 1): number => {
  if (t1 < t0) return -bezierLength(b, t1, t0)
  if (t1 - t0 < 1e-15) return 0
  return adaptiveLength(b, t0, t1, gaussLegendre(b, t0, t1), 1e-7, 0)
}

/** Parameter t at which the arc length from p0 equals `s` (clamped to [0, 1]). */
export const bezierTAtLength = (b: CubicBezier, s: number): number => {
  if (s <= 0) return 0
  const total = bezierLength(b)
  if (s >= total) return 1
  let lo = 0
  let hi = 1
  let t = s / total
  for (let i = 0; i < 60; i++) {
    const f = bezierLength(b, 0, t) - s
    if (Math.abs(f) < 1e-8) break
    if (f > 0) hi = t
    else lo = t
    const speed = length(bezierDerivative(b, t))
    let next = speed > EPS ? t - f / speed : (lo + hi) / 2
    if (!(next > lo && next < hi)) next = (lo + hi) / 2
    t = next
  }
  return t
}

export interface CurveSample {
  readonly point: Vec
  /** Unit tangent (direction of travel). */
  readonly tangent: Vec
  readonly t: number
}

/** Point and unit tangent at arc length `s` from the start of the curve. */
export const bezierPointAtLength = (b: CubicBezier, s: number): CurveSample => {
  const t = bezierTAtLength(b, s)
  return { point: bezierPoint(b, t), tangent: bezierTangent(b, t), t }
}

// ---------- splitting ----------

/** Split at parameter t (de Casteljau). Default ids are `${id}.0` and `${id}.1`. */
export const splitBezier = (
  b: CubicBezier,
  t: number,
  ids: readonly [string, string] = [`${b.id}.0`, `${b.id}.1`],
): [CubicBezier, CubicBezier] => {
  const p01 = lerp(b.p0, b.p1, t)
  const p12 = lerp(b.p1, b.p2, t)
  const p23 = lerp(b.p2, b.p3, t)
  const p012 = lerp(p01, p12, t)
  const p123 = lerp(p12, p23, t)
  const mid = lerp(p012, p123, t)
  return [cubic(ids[0], b.p0, p01, p012, mid), cubic(ids[1], mid, p123, p23, b.p3)]
}

/** Split at arc length `s` from the start. */
export const splitBezierAtLength = (
  b: CubicBezier,
  s: number,
  ids?: readonly [string, string],
): [CubicBezier, CubicBezier] => splitBezier(b, bezierTAtLength(b, s), ids)

/** The portion of `b` between parameters t0 < t1, as a new curve. */
export const subBezier = (b: CubicBezier, t0: number, t1: number, id = b.id): CubicBezier => {
  if (t0 <= 0 && t1 >= 1) return { ...b, id }
  let c: CubicBezier = b
  if (t1 < 1) c = splitBezier(c, t1)[0]
  if (t0 > 0) c = splitBezier(c, t0 / (t1 < 1 ? t1 : 1))[1]
  return { ...c, id }
}

export const reverseBezier = (b: CubicBezier, id = b.id): CubicBezier =>
  cubic(id, b.p3, b.p2, b.p1, b.p0)

// ---------- bounds / nearest point / flattening ----------

export interface BBox {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

const axisExtrema = (p0: number, p1: number, p2: number, p3: number): number[] =>
  solveQuadratic(-p0 + 3 * p1 - 3 * p2 + p3, 2 * (p0 - 2 * p1 + p2), p1 - p0).filter(
    (t) => t > 0 && t < 1,
  )

/** Exact (tight) bounding box. */
export const bezierBBox = (b: CubicBezier): BBox => {
  const ts = [
    0,
    1,
    ...axisExtrema(b.p0.x, b.p1.x, b.p2.x, b.p3.x),
    ...axisExtrema(b.p0.y, b.p1.y, b.p2.y, b.p3.y),
  ]
  const pts = ts.map((t) => bezierPoint(b, t))
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  }
}

export interface NearestResult {
  readonly t: number
  readonly point: Vec
  readonly distance: number
}

/** Closest point on the curve to `p` (coarse sampling + Newton refinement). */
export const nearestOnBezier = (b: CubicBezier, p: Vec, samples = 48): NearestResult => {
  let bestT = 0
  let bestD = Infinity
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const d = distance(bezierPoint(b, t), p)
    if (d < bestD) {
      bestD = d
      bestT = t
    }
  }
  const lo = Math.max(0, bestT - 1 / samples)
  const hi = Math.min(1, bestT + 1 / samples)
  let t = bestT
  for (let i = 0; i < 20; i++) {
    const diff = sub(bezierPoint(b, t), p)
    const d1 = bezierDerivative(b, t)
    const d2 = bezierSecondDerivative(b, t)
    const f = dot(diff, d1)
    const df = dot(d1, d1) + dot(diff, d2)
    if (Math.abs(df) < EPS) break
    const next = Math.min(hi, Math.max(lo, t - f / df))
    if (Math.abs(next - t) < 1e-12) {
      t = next
      break
    }
    t = next
  }
  const point = bezierPoint(b, t)
  const d = distance(point, p)
  return d <= bestD
    ? { t, point, distance: d }
    : { t: bestT, point: bezierPoint(b, bestT), distance: bestD }
}

/** Flatten to a polyline whose chord error is below `tolerance` mm. Includes both endpoints. */
export const flattenBezier = (b: CubicBezier, tolerance = 0.01): Vec[] => {
  const out: Vec[] = [b.p0]
  const rec = (c: CubicBezier, depth: number) => {
    const chord = sub(c.p3, c.p0)
    const cl = length(chord)
    const dev =
      cl < EPS
        ? Math.max(distance(c.p1, c.p0), distance(c.p2, c.p0))
        : Math.max(
            Math.abs(cross(chord, sub(c.p1, c.p0))),
            Math.abs(cross(chord, sub(c.p2, c.p0))),
          ) / cl
    // Control-polygon deviation bounds the curve deviation (×3/4).
    if (depth >= 16 || dev * 0.75 <= tolerance) {
      out.push(c.p3)
      return
    }
    const [l, r] = splitBezier(c, 0.5)
    rec(l, depth + 1)
    rec(r, depth + 1)
  }
  rec(b, 0)
  return out
}

// ---------- construction ----------

/** Handle factor that makes a quarter circle from two perpendicular unit legs. */
export const KAPPA = 0.5522847498

/**
 * A Bézier that leaves `p0` travelling along `dir0` and arrives at `p3` travelling along `dir3`
 * (so the tangent at p3 points along dir3). Typical use: necklines/armholes that must meet a seam
 * at a right angle.
 *
 * When the two tangent rays meet in front of both ends at X, the handles are `tension` × the
 * distance to X (the default KAPPA gives a circular arc for a right-angle corner with equal legs).
 * Otherwise (parallel or diverging rays) the handles are chord/3 × tension/KAPPA. Each handle is
 * capped at the chord length to avoid loops.
 */
export const curveWithTangents = (
  id: string,
  p0: Vec,
  dir0: Vec,
  p3: Vec,
  dir3: Vec,
  tension = KAPPA,
): CubicBezier => {
  const d0 = normalize(dir0)
  const d3 = normalize(dir3)
  const chord = distance(p0, p3)
  if (length(d0) === 0 || length(d3) === 0) throw new Error('curveWithTangents: zero direction')
  if (chord < EPS) throw new Error('curveWithTangents: coincident end points')
  // Corner X = p0 + s·d0 = p3 - r·d3, i.e. s·d0 + r·d3 = w.
  const den = cross(d0, d3)
  const w = sub(p3, p0)
  let h0 = (chord / 3) * (tension / KAPPA)
  let h3 = h0
  if (Math.abs(den) > 1e-9) {
    const s = cross(w, d3) / den
    const r = cross(d0, w) / den
    if (s > EPS && r > EPS) {
      h0 = tension * s
      h3 = tension * r
    }
  }
  h0 = Math.min(h0, chord)
  h3 = Math.min(h3, chord)
  return cubic(id, p0, add(p0, scale(d0, h0)), sub(p3, scale(d3, h3)), p3)
}

/**
 * Smooth curve through `points` as a chain of cubic Béziers using centripetal Catmull–Rom
 * (alpha = 0.5, no cusps or self-intersections within a span). Ids are `${idPrefix}.${i}`.
 * Open curves use reflected phantom end points.
 */
export const catmullRom = (
  points: readonly Vec[],
  options: { closed?: boolean; alpha?: number; idPrefix?: string } = {},
): CubicBezier[] => {
  const { closed = false, alpha = 0.5, idPrefix = 'cr' } = options
  const pts = points.filter((p, i) => i === 0 || distance(p, points[i - 1]) > EPS)
  if (closed && pts.length > 1 && distance(pts[0], pts[pts.length - 1]) <= EPS) pts.pop()
  if (pts.length < 2) return []
  const n = pts.length
  const at = (i: number): Vec => {
    if (closed) return pts[((i % n) + n) % n]
    if (i < 0) return sub(scale(pts[0], 2), pts[1])
    if (i >= n) return sub(scale(pts[n - 1], 2), pts[n - 2])
    return pts[i]
  }
  const spans = closed ? n : n - 1
  const out: CubicBezier[] = []
  for (let i = 0; i < spans; i++) {
    const P0 = at(i - 1)
    const P1 = at(i)
    const P2 = at(i + 1)
    const P3 = at(i + 2)
    const d1 = Math.max(distance(P0, P1), EPS)
    const d2 = Math.max(distance(P1, P2), EPS)
    const d3 = Math.max(distance(P2, P3), EPS)
    const d1a = d1 ** alpha
    const d2a = d2 ** alpha
    const d3a = d3 ** alpha
    const d1_2a = d1a * d1a
    const d2_2a = d2a * d2a
    const d3_2a = d3a * d3a
    const b1 = scale(
      add(sub(scale(P2, d1_2a), scale(P0, d2_2a)), scale(P1, 2 * d1_2a + 3 * d1a * d2a + d2_2a)),
      1 / (3 * d1a * (d1a + d2a)),
    )
    const b2 = scale(
      add(sub(scale(P1, d3_2a), scale(P3, d2_2a)), scale(P2, 2 * d3_2a + 3 * d3a * d2a + d2_2a)),
      1 / (3 * d3a * (d3a + d2a)),
    )
    out.push(cubic(`${idPrefix}.${i}`, P1, b1, b2, P2))
  }
  return out
}
