/**
 * "Ajuste automático" (auto-align) of a ruler between two points (SPEC §6.1).
 *
 * With the existing curve between the points (an outline edge or a run of them), it searches the
 * ruler pose — which stretch of which working edge (position along the edge), its rotation and
 * whether the ruler is turned over — that minimises the MAX deviation between the curve that
 * "Trazar" would apply (the stretch between the projections of the points, its ends taken exactly
 * to them) and the existing curve. Without a curve it lays the edge exactly through both points,
 * moving the ruler as little as possible from its current pose.
 *
 * Search: every stretch whose chord equals the distance between the points (both points exactly on
 * the edge) is tried on a 2 mm grid of start positions, both ways round and face up / turned over;
 * the best ones are refined by a pattern search on the pose (x, y, angle) that may leave the points
 * up to `maxEndDeviationMm` off the edge. The result is measured on the real trace.
 */
import { applyAffine } from '../ops/affine'
import { segmentLength, segmentPointAtLength, type Segment } from '../path'
import { add, distance, radToDeg, scale, sub, vec, type Vec } from '../vec'
import { edgePoint, nearestOnEdge, type WorkingEdge } from './edge'
import {
  fitRulerToPoints,
  poseAffine,
  toRuler,
  toWorld,
  translatePose,
  wrapDegrees,
  type Ruler,
  type RulerPose,
  type RulerTrace,
} from './rulers'

/** Default largest distance (mm) the auto-aligned edge may pass from either point. */
export const AUTO_ALIGN_END_DEVIATION_MM = 1

export interface AutoAlignOptions {
  /** The existing curve from p0 to p1 (world polyline, ≤ 2 mm spacing recommended). */
  readonly curve?: readonly Vec[]
  /** Only this working edge (default: every edge of the ruler). */
  readonly edgeId?: string
  /** Current pose: without a curve the ruler moves as little as possible from it. */
  readonly current?: RulerPose
  /** Largest distance (mm) from p0 / p1 to the posed edge. Default AUTO_ALIGN_END_DEVIATION_MM. */
  readonly maxEndDeviationMm?: number
}

export interface AutoAlignResult {
  readonly pose: RulerPose
  readonly edgeId: string
  /** The trace "Trazar" makes at this pose (fitRulerToPoints). */
  readonly trace: RulerTrace
  /**
   * Max distance (mm) between the trace and the existing curve, measured both ways (every point
   * of each to the other); null without a curve.
   */
  readonly curveDeviation: number | null
}

// ---------- polylines ----------

const polylineLength = (pts: readonly Vec[]) => {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += distance(pts[i - 1], pts[i])
  return len
}

/** `n` points evenly spaced by arc length along a polyline (both ends included). */
export function resamplePolyline(pts: readonly Vec[], n: number): Vec[] {
  if (pts.length < 2 || n < 2) return [...pts]
  const total = polylineLength(pts)
  const out: Vec[] = [pts[0]]
  let i = 1
  let acc = 0
  for (let k = 1; k < n - 1; k++) {
    const target = (total * k) / (n - 1)
    while (i < pts.length - 1 && acc + distance(pts[i - 1], pts[i]) < target) {
      acc += distance(pts[i - 1], pts[i])
      i++
    }
    const l = distance(pts[i - 1], pts[i])
    const u = l > 0 ? (target - acc) / l : 0
    out.push(add(pts[i - 1], scale(sub(pts[i], pts[i - 1]), Math.max(0, Math.min(1, u)))))
  }
  out.push(pts[pts.length - 1])
  return out
}

/** Points every ≤ `step` mm along a chain of segments (ends included, joins once). */
export function sampleSegments(segs: readonly Segment[], step = 1): Vec[] {
  const out: Vec[] = []
  segs.forEach((s, j) => {
    const len = segmentLength(s)
    const n = Math.max(1, Math.ceil(len / step))
    for (let i = j === 0 ? 0 : 1; i <= n; i++)
      out.push(segmentPointAtLength(s, (len * i) / n).point)
  })
  return out
}

const distToPolyline = (p: Vec, pts: readonly Vec[]): number => {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    const d = Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y)
    if (d < best) best = d
  }
  return pts.length === 1 ? distance(p, pts[0]) : best
}

/** Max distance between two polylines, both ways (a discrete Hausdorff distance). */
export function polylineDeviation(a: readonly Vec[], b: readonly Vec[]): number {
  let worst = 0
  for (const p of a) worst = Math.max(worst, distToPolyline(p, b))
  for (const p of b) worst = Math.max(worst, distToPolyline(p, a))
  return worst
}

/** Max deviation (mm) between a trace and a curve (world polyline), both ways. */
export const traceCurveDeviation = (trace: RulerTrace, curve: readonly Vec[]): number =>
  polylineDeviation(sampleSegments(trace.beziers, 1), resamplePolyline(curve, curveSamples(curve)))

const curveSamples = (curve: readonly Vec[]) =>
  Math.max(2, Math.min(600, Math.ceil(polylineLength(curve))))

// ---------- the search ----------

/** Edge points between arc lengths a and b (any order), ≤ 1 mm apart, from a to b. */
const stretch = (e: WorkingEdge, a: number, b: number, every = 1): Vec[] => {
  const lo = Math.max(0, Math.min(a, b))
  const hi = Math.min(e.totalLength, Math.max(a, b))
  const pts: Vec[] = [edgePoint(e, lo)]
  for (let i = 0; i < e.ss.length; i += every)
    if (e.ss[i] > lo + 1e-9 && e.ss[i] < hi - 1e-9) pts.push(e.pts[i])
  pts.push(edgePoint(e, hi))
  return a <= b ? pts : pts.reverse()
}

const mirrorY = (v: Vec): Vec => vec(v.x, -v.y)

/** Pose laying E(s0) → E(s1)'s chord on p0 → p1's (rotated to it, midpoints together). */
const chordPose = (e: WorkingEdge, s0: number, s1: number, flipped: boolean, p0: Vec, p1: Vec) => {
  const unit: RulerPose = { x: 0, y: 0, angleDeg: 0, flipped }
  const la = toWorld(unit, edgePoint(e, s0))
  const lb = toWorld(unit, edgePoint(e, s1))
  const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x) - Math.atan2(lb.y - la.y, lb.x - la.x)
  const turned: RulerPose = { x: 0, y: 0, angleDeg: wrapDegrees(radToDeg(angle)), flipped }
  const ca = toWorld(turned, edgePoint(e, s0))
  const cb = toWorld(turned, edgePoint(e, s1))
  return translatePose(turned, sub(scale(add(p0, p1), 0.5), scale(add(ca, cb), 0.5)))
}

/**
 * Deviation of the corrected stretch [s0, s1] from the probes: the probes are taken to the ruler
 * frame by the (anti-)similarity sending p0 → E(s0), p1 → E(s1); world mm = ruler mm × k.
 */
const stretchDeviation = (
  e: WorkingEdge,
  s0: number,
  s1: number,
  q: readonly Vec[],
  q0: Vec,
  q1: Vec,
  every = 1,
): number => {
  const A = edgePoint(e, s0)
  const B = edgePoint(e, s1)
  const w = sub(q1, q0)
  const den = w.x * w.x + w.y * w.y
  const ab = sub(B, A)
  // z = (B − A) / (q1 − q0) as complex numbers.
  const zr = (ab.x * w.x + ab.y * w.y) / den
  const zi = (ab.y * w.x - ab.x * w.y) / den
  const k = 1 / Math.hypot(zr, zi)
  const pts = stretch(e, s0, s1, every)
  let worst = 0
  for (const p of q) {
    const d = sub(p, q0)
    const r = vec(A.x + zr * d.x - zi * d.y, A.y + zi * d.x + zr * d.y)
    worst = Math.max(worst, distToPolyline(r, pts))
  }
  return worst * k
}

interface Candidate {
  readonly edge: WorkingEdge
  readonly s0: number
  readonly s1: number
  readonly flipped: boolean
  readonly cost: number
}

/** Stretches [s0, s1] of `e` whose chord is exactly `d` (start every `step` mm, both ways). */
function exactStretches(e: WorkingEdge, d: number, step = 2): { s0: number; s1: number }[] {
  const L = e.totalLength
  const out: { s0: number; s1: number }[] = []
  const chord = (a: number, b: number) => distance(edgePoint(e, a), edgePoint(e, b))
  for (let s0 = 0; s0 <= L + 1e-9; s0 += step)
    for (const dir of [1, -1]) {
      // Chord − d along the stretch length; roots by bisection between grid points.
      let prevLen = 0
      let prevF = -d
      for (let len = step; ; len += step) {
        const s1 = s0 + dir * len
        if (s1 < -1e-9 || s1 > L + 1e-9) break
        const f = chord(s0, s1) - d
        if (prevF < 0 !== f < 0) {
          let lo = prevLen
          let hi = len
          for (let i = 0; i < 40; i++) {
            const m = (lo + hi) / 2
            if (chord(s0, s0 + dir * m) - d < 0 === prevF < 0) lo = m
            else hi = m
          }
          out.push({ s0, s1: s0 + (dir * (lo + hi)) / 2 })
        }
        prevLen = len
        prevF = f
      }
    }
  return out
}

const turnAbout = (pose: RulerPose, pivot: Vec, deg: number): RulerPose => {
  const m = poseAffine({ ...pose, angleDeg: pose.angleDeg + deg })
  const at = applyAffine(m, toRuler(pose, pivot))
  return {
    ...pose,
    angleDeg: wrapDegrees(pose.angleDeg + deg),
    x: m.e + pivot.x - at.x,
    y: m.f + pivot.y - at.y,
  }
}

/**
 * Auto-align (see the module comment). Returns null when no stretch of the ruler's edges can reach
 * both points (they are farther apart than any chord of the edge).
 */
export function autoAlignRuler(
  ruler: Ruler,
  p0: Vec,
  p1: Vec,
  options: AutoAlignOptions = {},
): AutoAlignResult | null {
  const d = distance(p0, p1)
  if (d < 1) return null
  const maxEnd = options.maxEndDeviationMm ?? AUTO_ALIGN_END_DEVIATION_MM
  const edges = ruler.edges.filter((e) => !options.edgeId || e.id === options.edgeId)
  const curve = options.curve && options.curve.length >= 2 ? options.curve : null

  // ---- without a curve: through both points, the least move from the current pose ----
  if (!curve) {
    const cur = options.current
    let best: { pose: RulerPose; edgeId: string; cost: number } | null = null
    for (const e of edges)
      for (const flipped of cur ? [cur.flipped] : [false, true])
        for (const st of exactStretches(e, d)) {
          const pose = chordPose(e, st.s0, st.s1, flipped, p0, p1)
          const cost = cur
            ? distance(toWorld(pose, ruler.centre), toWorld(cur, ruler.centre)) +
              Math.abs(wrapDegrees(pose.angleDeg - cur.angleDeg))
            : Math.abs((st.s0 + st.s1) / 2 - e.totalLength / 2)
          if (!best || cost < best.cost) best = { pose, edgeId: e.id, cost }
        }
    if (!best) return null
    const trace = fitRulerToPoints(ruler, best.edgeId, best.pose, p0, p1)
    return trace && { pose: best.pose, edgeId: best.edgeId, trace, curveDeviation: null }
  }

  // ---- with a curve: minimise the max deviation of the trace from it ----
  const probes = resamplePolyline(
    curve,
    Math.max(24, Math.min(80, Math.ceil(polylineLength(curve) / 4))),
  )
  const cands: Candidate[] = []
  for (const e of edges)
    for (const flipped of [false, true]) {
      const q = flipped ? probes.map(mirrorY) : probes
      const q0 = flipped ? mirrorY(p0) : p0
      const q1 = flipped ? mirrorY(p1) : p1
      for (const st of exactStretches(e, d))
        cands.push({
          edge: e,
          ...st,
          flipped,
          cost: stretchDeviation(e, st.s0, st.s1, q, q0, q1, 2),
        })
    }
  if (cands.length === 0) return null
  cands.sort((a, b) => a.cost - b.cost)

  // Real objective of a pose: the stretch between the projections of p0 and p1, corrected.
  const objective = (e: WorkingEdge, pose: RulerPose): number => {
    const h0 = nearestOnEdge(e, toRuler(pose, p0))
    const h1 = nearestOnEdge(e, toRuler(pose, p1))
    if (Math.max(h0.distance, h1.distance) > maxEnd || Math.abs(h1.s - h0.s) < 1) return Infinity
    const f = pose.flipped
    const map = (v: Vec) => (f ? mirrorY(v) : v)
    return stretchDeviation(e, h0.s, h1.s, probes.map(map), map(p0), map(p1))
  }
  const pivot = scale(add(p0, p1), 0.5)
  const refine = (c: Candidate) => {
    let pose = chordPose(c.edge, c.s0, c.s1, c.flipped, p0, p1)
    let dev = objective(c.edge, pose)
    for (let step = 2; step > 0.005; step /= 2) {
      let improved = true
      while (improved) {
        improved = false
        for (const cand of [
          translatePose(pose, vec(step, 0)),
          translatePose(pose, vec(-step, 0)),
          translatePose(pose, vec(0, step)),
          translatePose(pose, vec(0, -step)),
          turnAbout(pose, pivot, step / 2),
          turnAbout(pose, pivot, -step / 2),
          turnAbout(pose, p0, step / 2),
          turnAbout(pose, p0, -step / 2),
          turnAbout(pose, p1, step / 2),
          turnAbout(pose, p1, -step / 2),
        ]) {
          const v = objective(c.edge, cand)
          if (v < dev - 1e-6) {
            pose = cand
            dev = v
            improved = true
          }
        }
      }
    }
    return { pose, dev, edgeId: c.edge.id }
  }
  // Refine the best few candidates that are not near-duplicates of each other.
  const picked: Candidate[] = []
  for (const c of cands) {
    if (picked.length >= 4) break
    if (
      picked.some(
        (p) =>
          p.edge === c.edge &&
          p.flipped === c.flipped &&
          Math.abs(p.s0 - c.s0) < 6 &&
          Math.abs(p.s1 - c.s1) < 6,
      )
    )
      continue
    picked.push(c)
  }
  let best: { pose: RulerPose; edgeId: string; trace: RulerTrace; dev: number } | null = null
  for (const c of picked) {
    const r = refine(c)
    const trace = fitRulerToPoints(ruler, r.edgeId, r.pose, p0, p1)
    if (!trace) continue
    const dev = traceCurveDeviation(trace, curve)
    if (!best || dev < best.dev) best = { pose: r.pose, edgeId: r.edgeId, trace, dev }
  }
  return (
    best && { pose: best.pose, edgeId: best.edgeId, trace: best.trace, curveDeviation: best.dev }
  )
}
