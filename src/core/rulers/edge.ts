/**
 * Working edges of pattern-making rulers (SPEC §6): intrinsic curves given by their curvature,
 * parametrised by arc length (mm). Each edge is a chain of pieces whose curvature varies linearly
 * with arc length: a straight line (k0 = k1 = 0), a circular arc (k0 = k1 ≠ 0) or a clothoid /
 * Euler spiral (k0 ≠ k1). Positive curvature turns from +x towards +y (clockwise on screen), so the
 * centre of curvature lies on the `perp(tangent)` side.
 *
 * The edge is integrated once at ≤ 1 mm steps (5-point Gauss–Legendre on cos θ / sin θ, θ being
 * quadratic in s inside a piece: error ≪ 1e-6 mm); any point is then integrated from the nearest
 * sample, so `edgePoint(e, s)` is exact to the micrometre and `s` IS the arc length.
 */
import { cubic, nearestOnBezier, type CubicBezier } from '../bezier'
import { add, distance, dot, length, scale, sub, vec, type Vec } from '../vec'

/** One piece of a working edge: `length` mm with curvature varying linearly from k0 to k1 (1/mm). */
export interface EdgePiece {
  readonly length: number
  readonly k0: number
  readonly k1: number
}

export interface WorkingEdgeDef {
  readonly id: string
  /** Name shown in the UI ("Borde exterior"…). */
  readonly label: string
  /** Start point (ruler frame, mm). */
  readonly start: Vec
  /** Direction at the start (radians, from +x towards +y). */
  readonly heading: number
  readonly pieces: readonly EdgePiece[]
  /** Side of the edge the ruler body (and the graduations) lie on: +1 = perp(tangent), −1 = opposite. */
  readonly bodySide: 1 | -1
  /** Graduation numbering starts at this value (mm), e.g. the inner edge of an L-square. Default 0. */
  readonly labelOffsetMm?: number
}

/** A working edge ready to evaluate (samples every ≤ 1 mm). */
export interface WorkingEdge extends WorkingEdgeDef {
  readonly totalLength: number
  /** Arc length where each piece starts (plus the total at the end). */
  readonly pieceStarts: readonly number[]
  /** Samples: arc length, position and heading. */
  readonly ss: readonly number[]
  readonly pts: readonly Vec[]
  readonly thetas: readonly number[]
}

export interface EdgeSample {
  readonly s: number
  readonly point: Vec
  /** Unit tangent (direction of increasing s). */
  readonly tangent: Vec
  readonly theta: number
  /** Signed curvature (1/mm). */
  readonly curvature: number
}

const GL5_X = [-0.906179845938664, -0.5384693101056831, 0, 0.5384693101056831, 0.906179845938664]
const GL5_W = [
  0.2369268850561891, 0.4786286704993665, 0.5688888888888889, 0.4786286704993665,
  0.2369268850561891,
]

/** Position change over arc length h from heading th0 with curvature k (+ dk per mm). */
const integrate = (th0: number, k: number, dk: number, h: number): Vec => {
  let x = 0
  let y = 0
  for (let i = 0; i < 5; i++) {
    const u = (h / 2) * (GL5_X[i] + 1)
    const th = th0 + k * u + 0.5 * dk * u * u
    x += GL5_W[i] * Math.cos(th)
    y += GL5_W[i] * Math.sin(th)
  }
  return vec((x * h) / 2, (y * h) / 2)
}

/** Build the samples of an edge definition. */
export function buildEdge(def: WorkingEdgeDef): WorkingEdge {
  const ss: number[] = [0]
  const pts: Vec[] = [def.start]
  const thetas: number[] = [def.heading]
  const pieceStarts: number[] = [0]
  let s = 0
  let p = def.start
  let th = def.heading
  for (const piece of def.pieces) {
    if (!(piece.length > 0)) throw new Error(`buildEdge(${def.id}): empty piece`)
    const n = Math.max(1, Math.ceil(piece.length))
    const h = piece.length / n
    const dk = (piece.k1 - piece.k0) / piece.length
    for (let i = 0; i < n; i++) {
      const u0 = i * h
      const k = piece.k0 + dk * u0
      p = add(p, integrate(th, k, dk, h))
      th += k * h + 0.5 * dk * h * h
      s += h
      ss.push(s)
      pts.push(p)
      thetas.push(th)
    }
    pieceStarts.push(s)
  }
  return { ...def, totalLength: s, pieceStarts, ss, pts, thetas }
}

export const edgeLength = (e: WorkingEdge): number => e.totalLength

const clampS = (e: WorkingEdge, s: number) => Math.max(0, Math.min(e.totalLength, s))

/** Index of the piece containing arc length s. */
const pieceIndex = (e: WorkingEdge, s: number): number => {
  for (let i = 0; i < e.pieces.length; i++) if (s <= e.pieceStarts[i + 1] + 1e-12) return i
  return e.pieces.length - 1
}

/** Curvature at arc length s (pieces are left-closed: at a join, the later piece wins). */
export const edgeCurvature = (e: WorkingEdge, s: number): number => {
  const x = clampS(e, s)
  let i = pieceIndex(e, x)
  if (i < e.pieces.length - 1 && x >= e.pieceStarts[i + 1] - 1e-12) i++
  const p = e.pieces[i]
  return p.k0 + ((p.k1 - p.k0) * (x - e.pieceStarts[i])) / p.length
}

/** Point, tangent, heading and curvature at arc length s (clamped to the edge). */
export function edgeAt(e: WorkingEdge, s: number): EdgeSample {
  const x = clampS(e, s)
  // Last sample at or before x.
  let lo = 0
  let hi = e.ss.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (e.ss[mid] <= x) lo = mid
    else hi = mid
  }
  let point = e.pts[lo]
  let theta = e.thetas[lo]
  const h = x - e.ss[lo]
  if (h > 1e-12) {
    // The step [ss[lo], x] lies inside one piece (piece starts are samples).
    const i = pieceIndex(e, e.ss[lo] + h / 2)
    const p = e.pieces[i]
    const dk = (p.k1 - p.k0) / p.length
    const k = p.k0 + dk * (e.ss[lo] - e.pieceStarts[i])
    point = add(point, integrate(theta, k, dk, h))
    theta += k * h + 0.5 * dk * h * h
  }
  return {
    s: x,
    point,
    tangent: vec(Math.cos(theta), Math.sin(theta)),
    theta,
    curvature: edgeCurvature(e, x),
  }
}

export const edgePoint = (e: WorkingEdge, s: number): Vec => edgeAt(e, s).point

/** Points every `step` mm (both ends included) between s0 and s1 (any order). */
export function edgePolyline(e: WorkingEdge, s0 = 0, s1 = e.totalLength, step = 1): Vec[] {
  const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / step))
  return Array.from({ length: n + 1 }, (_, i) => edgePoint(e, s0 + ((s1 - s0) * i) / n))
}

export interface EdgeHit {
  readonly s: number
  readonly point: Vec
  readonly distance: number
}

/** Point of the edge nearest to `p` (ruler frame). */
export function nearestOnEdge(e: WorkingEdge, p: Vec): EdgeHit {
  let best = { s: 0, d: Infinity }
  for (let i = 0; i < e.pts.length - 1; i++) {
    const a = e.pts[i]
    const b = e.pts[i + 1]
    const ab = sub(b, a)
    const l2 = dot(ab, ab)
    const u = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2))
    const d = distance(add(a, scale(ab, u)), p)
    if (d < best.d) best = { s: e.ss[i] + u * (e.ss[i + 1] - e.ss[i]), d }
  }
  // Refine on the true curve (golden-section search within ±1 sample).
  let lo = clampS(e, best.s - 1.5)
  let hi = clampS(e, best.s + 1.5)
  const f = (s: number) => distance(edgePoint(e, s), p)
  const g = (Math.sqrt(5) - 1) / 2
  let c = hi - g * (hi - lo)
  let d = lo + g * (hi - lo)
  let fc = f(c)
  let fd = f(d)
  for (let i = 0; i < 40 && hi - lo > 1e-7; i++) {
    if (fc < fd) {
      hi = d
      d = c
      fd = fc
      c = hi - g * (hi - lo)
      fc = f(c)
    } else {
      lo = c
      c = d
      fc = fd
      d = lo + g * (hi - lo)
      fd = f(d)
    }
  }
  const s = (lo + hi) / 2
  const point = edgePoint(e, s)
  return { s, point, distance: distance(point, p) }
}

// ---------- Bézier fitting ----------

/** Max distance (mm) from `n` points of the edge range [s0, s1] to the Bézier chain. */
export function edgeFitError(
  e: WorkingEdge,
  s0: number,
  s1: number,
  beziers: readonly CubicBezier[],
  n = 64,
): number {
  let worst = 0
  for (let i = 0; i <= n; i++) {
    const q = edgePoint(e, s0 + ((s1 - s0) * i) / n)
    let d = Infinity
    for (const b of beziers) d = Math.min(d, nearestOnBezier(b, q, 24).distance)
    worst = Math.max(worst, d)
  }
  return worst
}

/**
 * One cubic from E(a) to E(b) with the edge's end tangents; the two handle lengths are fitted by
 * least squares to points of the edge (Schneider's method with two reparametrisation passes).
 */
export function fitOneCubic(e: WorkingEdge, a: number, b: number, id = 'ruler'): CubicBezier {
  const A = edgeAt(e, a)
  const B = edgeAt(e, b)
  const dir = Math.sign(b - a)
  const t0 = scale(A.tangent, dir)
  const t3 = scale(B.tangent, -dir)
  const L = Math.abs(b - a)
  const turn = Math.abs(B.theta - A.theta)
  // Start from the circular-arc handle length.
  const arcH = turn > 1e-9 ? ((4 / 3) * Math.tan(turn / 4) * L) / turn : L / 3
  let h0 = arcH
  let h3 = arcH
  const n = 16
  const samples = Array.from({ length: n - 1 }, (_, i) => edgePoint(e, a + ((b - a) * (i + 1)) / n))
  let ts = samples.map((_, i) => (i + 1) / n)
  for (let pass = 0; pass < 3; pass++) {
    // Least squares on h0, h3: B(t) = P0·B0 + (P0 + h0 t0)·B1 + (P3 + h3 t3)·B2 + P3·B3.
    let c00 = 0
    let c01 = 0
    let c11 = 0
    let x0 = 0
    let x1 = 0
    samples.forEach((q, i) => {
      const t = ts[i]
      const mt = 1 - t
      const b0 = mt * mt * mt
      const b1 = 3 * mt * mt * t
      const b2 = 3 * mt * t * t
      const b3 = t * t * t
      const v0 = scale(t0, b1)
      const v1 = scale(t3, b2)
      const base = add(scale(A.point, b0 + b1), scale(B.point, b2 + b3))
      const r = sub(q, base)
      c00 += dot(v0, v0)
      c01 += dot(v0, v1)
      c11 += dot(v1, v1)
      x0 += dot(v0, r)
      x1 += dot(v1, r)
    })
    const det = c00 * c11 - c01 * c01
    if (Math.abs(det) > 1e-12) {
      const n0 = (x0 * c11 - x1 * c01) / det
      const n3 = (c00 * x1 - c01 * x0) / det
      if (n0 > 1e-6 && n3 > 1e-6 && n0 < L && n3 < L) {
        h0 = n0
        h3 = n3
      }
    }
    const c = cubic(id, A.point, add(A.point, scale(t0, h0)), add(B.point, scale(t3, h3)), B.point)
    ts = samples.map((q) => nearestOnBezier(c, q, 32).t)
  }
  return cubic(id, A.point, add(A.point, scale(t0, h0)), add(B.point, scale(t3, h3)), B.point)
}

/**
 * Bézier chain for the edge range from s0 to s1 (s1 < s0 runs backwards), with a maximum deviation
 * of `tolerance` mm: ranges that turn more than 90° or miss the tolerance are halved.
 * Ids are `${idPrefix}.${i}`.
 */
export function edgeRangeToBeziers(
  e: WorkingEdge,
  s0: number,
  s1: number,
  tolerance = 0.05,
  idPrefix = 'ruler',
): CubicBezier[] {
  const a0 = clampS(e, s0)
  const a1 = clampS(e, s1)
  if (Math.abs(a1 - a0) < 1e-6) return []
  const out: CubicBezier[] = []
  const rec = (a: number, b: number, depth: number) => {
    const turn = Math.abs(edgeAt(e, b).theta - edgeAt(e, a).theta)
    if (depth < 12 && turn > Math.PI / 2) {
      const m = (a + b) / 2
      rec(a, m, depth + 1)
      rec(m, b, depth + 1)
      return
    }
    const c = fitOneCubic(e, a, b, '')
    if (depth < 12 && Math.abs(b - a) > 2 && edgeFitError(e, a, b, [c], 24) > tolerance) {
      const m = (a + b) / 2
      rec(a, m, depth + 1)
      rec(m, b, depth + 1)
      return
    }
    out.push(c)
  }
  rec(a0, a1, 0)
  return out.map((c, i) => ({ ...c, id: `${idPrefix}.${i}` }))
}

/** Signed curvature from three points (circumscribed circle), for checks. */
export const threePointCurvature = (a: Vec, b: Vec, c: Vec): number => {
  const ab = sub(b, a)
  const bc = sub(c, b)
  const ca = sub(a, c)
  const cr = ab.x * bc.y - ab.y * bc.x
  const den = length(ab) * length(bc) * length(ca)
  return den < 1e-15 ? 0 : (2 * cr) / den
}
