/**
 * Fair curve through a drafting method's control points: one cubic Bézier per span, curvature
 * continuous (G2) at every internal point, prescribed end tangents, optional prescribed tangent
 * directions at internal points, and a shape chosen so the curve bends as evenly as it can (no
 * spurious inflection, curvature rising and falling once on each stretch that bends one way, like
 * a stroke of a French curve).
 *
 * Construction: between consecutive prescribed directions (the ends, and any internal point given
 * one) the curve is a clamped cubic spline over a knot vector: C2 in its parameter, hence G2 at
 * every free internal point, whatever the knots. The shape parameters are the knot spacings
 * (relative to the chord lengths) and the two end speeds of each piece. A small deterministic
 * search picks them to minimise the curvature variation ∫(dκ/ds)² ds plus a penalty on extra rises
 * and falls of |κ| and on the curvature mismatch where two pieces meet (a shared, prescribed
 * direction: G1 by construction, driven to G2 by the search, never above MAX_BREAK_JUMP),
 * rejecting any other number of inflections than the expected one.
 *
 * (Solving one C1 spline with the shared speed at a prescribed direction as an unknown is
 * singular for symmetric shapes such as a sleeve cap: the speed cancels out of the curvature
 * condition. Hence the pieces.)
 */
import {
  bezierDerivative,
  bezierPoint,
  bezierSecondDerivative,
  cubic,
  type CubicBezier,
} from './bezier'
import { add, cross, distance, EPS, length, normalize, scale, sub, vec, type Vec } from './vec'

/** Shape parameters of a fair curve (dimensionless, so they carry over to a similar curve). */
export interface FairCurveShape {
  /**
   * Speeds at the two ends of each piece between prescribed directions, relative to the
   * chord-length speed: the handle there is speed × chord / 3. Two per piece, in order.
   */
  readonly speeds: readonly number[]
  /** Knot spacing of each span relative to its chord (only ratios within a piece matter). */
  readonly knots: readonly number[]
}

export interface FairCurveOptions {
  /** Segment ids are `${idPrefix}.${i}` (one cubic per span). */
  readonly idPrefix?: string
  /** Prescribed tangent directions (direction of travel) at internal points, by point index. */
  readonly tangents?: Readonly<Record<number, Vec>>
  /** Number of curvature sign changes the curve is meant to have (0 for an armhole, 1 for an S). */
  readonly inflections?: number
  /** Use this shape instead of searching for one (e.g. while solving for a seam length). */
  readonly shape?: FairCurveShape
}

export interface FairCurveFit {
  readonly curves: CubicBezier[]
  readonly shape: FairCurveShape
}

/** Range of the relative end speeds searched (1 = the natural chord-length speed). */
const SPEED_MIN = 0.2
const SPEED_MAX = 3
/** Knot multipliers are searched within [1/KNOT_MAX, KNOT_MAX]. */
const KNOT_MAX = 4
/** Weight of the unimodality defect (extra rises and falls of |κ|) against ∫(dκ/ds)² ds · L³. */
const UNIMODAL_WEIGHT = 1000
/** Largest relative curvature jump accepted where two pieces meet at a prescribed direction… */
const MAX_BREAK_JUMP = 0.25
/** …and the weight of its square in the score (drives it towards G2). */
const BREAK_WEIGHT = 1e5
/** Samples per span when scoring a candidate. */
const SCORE_SAMPLES = 16
/** The search stops when its step (in log space) falls below this. */
const SEARCH_TOLERANCE = 5e-3
/** Fitted shapes are memoised by input (drafts refit the same armholes for every piece). */
const SHAPE_CACHE = new Map<string, FairCurveShape>()
const SHAPE_CACHE_SIZE = 512

/** Gaussian elimination with partial pivoting (small dense systems). */
function solveLinear(A: number[][], rhs: number[]): number[] {
  const n = rhs.length
  const M = A.map((row, i) => [...row, rhs[i]])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-14) throw new Error('fairCurve: singular system')
    ;[M[c], M[piv]] = [M[piv], M[c]]
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c]
      if (f !== 0) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]
    x[r] = s / M[r][r]
  }
  return x
}

/**
 * The C2 (hence G2) cubic spline through `pts` over knots chord × `knots`, leaving along `d0` and
 * arriving along `dn` with the given relative end speeds.
 */
function splineFor(
  pts: readonly Vec[],
  d0: Vec,
  dn: Vec,
  speeds: readonly [number, number],
  knots: readonly number[],
  ids: readonly string[],
): CubicBezier[] {
  const n = pts.length - 1
  const chord = pts.slice(0, n).map((p, i) => Math.max(distance(p, pts[i + 1]), EPS))
  const h = chord.map((c, i) => c * (knots[i] ?? 1))
  const derivs = (x: readonly number[]): Vec[] =>
    pts.map((_, i) => {
      if (i === 0) return scale(d0, (speeds[0] * chord[0]) / h[0])
      if (i === n) return scale(dn, (speeds[1] * chord[n - 1]) / h[n - 1])
      return vec(x[2 * i - 2], x[2 * i - 1])
    })
  // Jump of the second derivative at each internal point: zero for a C2 spline. Linear in x.
  const residual = (x: readonly number[]): number[] => {
    const m = derivs(x)
    const out: number[] = []
    for (let i = 1; i < n; i++) {
      const left = add(
        scale(sub(pts[i], pts[i - 1]), -6 / h[i - 1] ** 2),
        scale(add(scale(m[i - 1], 2), scale(m[i], 4)), 1 / h[i - 1]),
      )
      const right = sub(
        scale(sub(pts[i + 1], pts[i]), 6 / h[i] ** 2),
        scale(add(scale(m[i], 4), scale(m[i + 1], 2)), 1 / h[i]),
      )
      const r = sub(left, right)
      out.push(r.x, r.y)
    }
    return out
  }
  let x: number[] = []
  const count = 2 * (n - 1)
  if (count > 0) {
    const zero = new Array<number>(count).fill(0)
    const r0 = residual(zero)
    const cols = zero.map((_, j) => {
      const e = [...zero]
      e[j] = 1
      return residual(e).map((v, k) => v - r0[k])
    })
    x = solveLinear(
      r0.map((_, k) => cols.map((col) => col[k])),
      r0.map((v) => -v),
    )
  }
  const m = derivs(x)
  return h.map((hi, i) =>
    cubic(
      ids[i],
      pts[i],
      add(pts[i], scale(m[i], hi / 3)),
      sub(pts[i + 1], scale(m[i + 1], hi / 3)),
      pts[i + 1],
    ),
  )
}

/** Signed curvature at an end of a cubic (t = 0 or 1). */
const endCurvature = (c: CubicBezier, t: 0 | 1): number => {
  const d1 = bezierDerivative(c, t)
  const sp = length(d1)
  return sp < 1e-9 ? NaN : cross(d1, bezierSecondDerivative(c, t)) / sp ** 3
}

/**
 * Score of a candidate (lower is fairer): dimensionless curvature variation ∫(dκ/ds)² ds · L³, the
 * unimodality defect and the curvature mismatch at the breaks (points with a prescribed direction,
 * where two separately built pieces meet); Infinity for a wrong number of inflections, a cusp or a
 * mismatch above MAX_BREAK_JUMP.
 */
function score(
  curves: readonly CubicBezier[],
  inflections: number,
  breaks: readonly number[],
): number {
  let breakPenalty = 0
  for (const i of breaks) {
    const k0 = endCurvature(curves[i - 1], 1)
    const k1 = endCurvature(curves[i], 0)
    if (!Number.isFinite(k0) || !Number.isFinite(k1)) return Infinity
    const jump = Math.abs(k1 - k0) / Math.max(Math.abs(k0), Math.abs(k1), 1e-6)
    if (jump > MAX_BREAK_JUMP) return Infinity
    breakPenalty += BREAK_WEIGHT * jump ** 2
  }
  const ks: number[] = []
  const ss: number[] = []
  let s = 0
  let prev: Vec | null = null
  for (const c of curves)
    for (let j = 0; j <= SCORE_SAMPLES; j++) {
      const t = j / SCORE_SAMPLES
      const p = bezierPoint(c, t)
      const d1 = bezierDerivative(c, t)
      const sp = length(d1)
      if (sp < 1e-9) return Infinity // cusp
      if (prev) s += distance(prev, p)
      prev = p
      ks.push(cross(d1, bezierSecondDerivative(c, t)) / sp ** 3)
      ss.push(s)
    }
  const maxAbs = Math.max(...ks.map(Math.abs))
  if (!(maxAbs > 0)) return breakPenalty
  const tol = Math.max(1e-4, 0.01 * maxAbs)
  let signs = 0
  let sign = 0
  for (const k of ks) {
    if (Math.abs(k) < tol) continue
    if (sign !== 0 && Math.sign(k) !== sign) signs++
    sign = Math.sign(k)
  }
  if (signs !== inflections) return Infinity
  let variation = 0
  for (let i = 1; i < ks.length; i++) {
    const ds = ss[i] - ss[i - 1]
    if (ds > 1e-9) variation += (ks[i] - ks[i - 1]) ** 2 / ds
  }
  // On each stretch that bends one way: total variation of |κ| beyond one rise and one fall.
  let defect = 0
  let run: number[] = []
  const flush = () => {
    if (run.length < 2) return
    let tv = 0
    for (let i = 1; i < run.length; i++) tv += Math.abs(run[i] - run[i - 1])
    defect += (tv - (2 * Math.max(...run) - run[0] - run[run.length - 1])) / maxAbs
  }
  ks.forEach((k, i) => {
    if (i > 0 && Math.sign(k) !== Math.sign(ks[i - 1])) {
      flush()
      run = []
    }
    run.push(Math.abs(k))
  })
  flush()
  return variation * s ** 3 + UNIMODAL_WEIGHT * defect + breakPenalty
}

/** Fair curve through `points` and the shape it was built with (see the module comment). */
export function fitFairCurve(
  points: readonly Vec[],
  startDir: Vec,
  endDir: Vec,
  options: FairCurveOptions = {},
): FairCurveFit {
  const { idPrefix = 'fc', inflections = 0 } = options
  if (points.length < 2) throw new Error('fairCurve: needs at least two points')
  for (let i = 1; i < points.length; i++)
    if (distance(points[i], points[i - 1]) <= EPS) throw new Error('fairCurve: coincident points')
  const d0 = normalize(startDir)
  const dn = normalize(endDir)
  if (length(d0) === 0 || length(dn) === 0) throw new Error('fairCurve: zero direction')
  const spans = points.length - 1
  // Directions at the ends and at the internal points that prescribe one.
  const dirs = new Map<number, Vec>([
    [0, d0],
    [spans, dn],
  ])
  for (const [k, v] of Object.entries(options.tangents ?? {})) {
    const i = Number(k)
    if (!(Number.isInteger(i) && i > 0 && i < spans))
      throw new Error(`fairCurve: tangent index ${k} is not an internal point`)
    if (length(v) === 0) throw new Error('fairCurve: zero direction')
    dirs.set(i, normalize(v))
  }
  // Pieces between consecutive prescribed directions, each a C2 spline of its own.
  const cuts = [...dirs.keys()].sort((a, b) => a - b)
  const pieces = cuts.slice(0, -1).map((a, j) => [a, cuts[j + 1]] as const)
  const breaks = cuts.slice(1, -1)
  const ids = Array.from({ length: spans }, (_, i) => `${idPrefix}.${i}`)
  const dirAt = (i: number): Vec => dirs.get(i) ?? d0

  const build = (shape: FairCurveShape): CubicBezier[] =>
    pieces.flatMap(([a, b], j) =>
      splineFor(
        points.slice(a, b + 1),
        dirAt(a),
        dirAt(b),
        [shape.speeds[2 * j], shape.speeds[2 * j + 1]],
        shape.knots.slice(a, b),
        ids.slice(a, b),
      ),
    )
  if (options.shape) {
    if (options.shape.speeds.length !== 2 * pieces.length || options.shape.knots.length !== spans)
      throw new Error('fairCurve: the shape does not match the points')
    return { curves: build(options.shape), shape: options.shape }
  }
  const key = JSON.stringify([points, d0, dn, [...dirs], inflections])
  const cached = SHAPE_CACHE.get(key)
  if (cached) return { curves: build(cached), shape: cached }

  // Search in log space: q = [log speeds (2 per piece)…, log knots (1 per span)…]. The first knot
  // of each piece stays 1 (only ratios within a piece matter).
  const nSpeeds = 2 * pieces.length
  const pieceStarts = new Set(pieces.map(([a]) => a))
  const toShape = (q: readonly number[]): FairCurveShape => ({
    speeds: q.slice(0, nSpeeds).map(Math.exp),
    knots: q.slice(nSpeeds).map(Math.exp),
  })
  const E = (q: readonly number[]) => {
    try {
      return score(build(toShape(q)), inflections, breaks)
    } catch {
      return Infinity
    }
  }
  const lo = Math.log(SPEED_MIN)
  const hi = Math.log(SPEED_MAX)
  const free = (k: number) => k < nSpeeds || !pieceStarts.has(k - nSpeeds)
  const bounds = (k: number): readonly [number, number] =>
    k < nSpeeds ? [lo, hi] : [-Math.log(KNOT_MAX), Math.log(KNOT_MAX)]
  let best = new Array<number>(nSpeeds + spans).fill(0)
  let bestE = E(best)
  // Coarse grid (every piece leaves at speed a and arrives at speed b, chord-length knots)…
  const grid = 7
  for (let i = 0; i < grid; i++)
    for (let j = 0; j < grid; j++) {
      const q = [...best]
      for (let p = 0; p < pieces.length; p++) {
        q[2 * p] = lo + ((hi - lo) * i) / (grid - 1)
        q[2 * p + 1] = lo + ((hi - lo) * j) / (grid - 1)
      }
      const e = E(q)
      if (e < bestE) {
        bestE = e
        best = q
      }
    }
  // …then a compass search over every free parameter.
  let step = (hi - lo) / (grid - 1) / 2
  while (step > SEARCH_TOLERANCE) {
    let moved = false
    for (let k = 0; k < best.length; k++) {
      if (!free(k)) continue
      for (const dir of [1, -1]) {
        const [a, b] = bounds(k)
        const q = [...best]
        q[k] = Math.min(b, Math.max(a, q[k] + dir * step))
        if (q[k] === best[k]) continue
        const e = E(q)
        if (e < bestE) {
          bestE = e
          best = q
          moved = true
        }
      }
    }
    if (!moved) step /= 2
  }
  if (!Number.isFinite(bestE))
    throw new Error(`fairCurve: no fair curve with ${inflections} inflection(s) through the points`)
  const shape = toShape(best)
  if (SHAPE_CACHE.size >= SHAPE_CACHE_SIZE) SHAPE_CACHE.delete(SHAPE_CACHE.keys().next().value!)
  SHAPE_CACHE.set(key, shape)
  return { curves: build(shape), shape }
}

/**
 * Fair curve through `points`: it leaves the first point along `startDir`, arrives at the last one
 * travelling along `endDir`, passes through every point (along the prescribed direction where one
 * is given) and is G2 everywhere (within a few % where a direction is prescribed). Ids are
 * `${idPrefix}.${i}`.
 */
export const fairCurve = (
  points: readonly Vec[],
  startDir: Vec,
  endDir: Vec,
  options: FairCurveOptions = {},
): CubicBezier[] => fitFairCurve(points, startDir, endDir, options).curves
