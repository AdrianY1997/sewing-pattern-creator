/**
 * The four real-size pattern-making rulers of SPEC §6, their pose on the canvas and the geometry of
 * tracing along them. Everything is in mm; a ruler lives in its own frame ("ruler frame") and is
 * placed on the canvas by a pose (translation, rotation, optional mirror).
 *
 * | Ruler | Working edges | Geometry |
 * |---|---|---|
 * | `square` Regla recta / escuadra L | outer and inner edge of both arms | 600 × 300 mm L, arms 50 mm wide |
 * | `french` Curvígrafo (curva francesa) | the curve | clothoid R 25 → 400 mm over 130 mm, then an arc R 400 mm of 170 mm (300 mm, ≈ 182° of turn) |
 * | `hip` Regla de cadera | the curve and the straight back | clothoid R 3000 → 600 mm over 600 mm (≈ 34°); straight back 20 mm behind the chord |
 * | `tailor` Regla de sastre (vary-form) | the edge | 250 mm straight, then clothoid R 1500 → 300 mm over 350 mm (≈ 40°) |
 */
import { type CubicBezier } from '../bezier'
import { applyAffine } from '../ops/affine'
import type { Affine } from '../ops/types'
import { mapSegment, polygonSignedArea } from '../path'
import { add, degToRad, distance, perp, radToDeg, scale, sub, vec, type Vec } from '../vec'
import {
  buildEdge,
  edgeAt,
  edgeFitError,
  edgePoint,
  edgePolyline,
  edgeRangeToBeziers,
  fitOneCubic,
  nearestOnEdge,
  type WorkingEdge,
  type WorkingEdgeDef,
} from './edge'

export type RulerId = 'square' | 'french' | 'hip' | 'tailor'

export const RULER_IDS: readonly RulerId[] = ['square', 'french', 'hip', 'tailor']

export interface Ruler {
  readonly id: RulerId
  readonly name: string
  readonly edges: readonly WorkingEdge[]
  /** Closed outline of the ruler body (ruler frame). */
  readonly outline: readonly Vec[]
  /** Rotation pivot: the area centroid of the outline (the corner of the L-square). */
  readonly centre: Vec
  /** Where the rotate handle sits (ruler frame), just off the body. */
  readonly handle: Vec
}

/** Placement of a ruler: world = translate(x, y) · rotate(angleDeg) · mirror(flipped) · ruler. */
export interface RulerPose {
  readonly x: number
  readonly y: number
  /** Degrees, clockwise on screen. */
  readonly angleDeg: number
  /** Mirrored across the ruler's x axis (the ruler turned over). */
  readonly flipped: boolean
}

// ---------- parameters ----------

/** French curve: clothoid from R 25 mm to R 400 mm over 130 mm, then an arc R 400 mm over 170 mm. */
export const FRENCH_CURVE = { r0: 25, r1: 400, spiralMm: 130, arcMm: 170, widthMm: 35 } as const
/** Hip curve: clothoid from R 3000 mm to R 600 mm over 600 mm, straight back 20 mm off the chord. */
export const HIP_CURVE = { r0: 3000, r1: 600, lengthMm: 600, backGapMm: 20 } as const
/** Tailor's / vary-form curve: 250 mm straight, then a clothoid R 1500 → 300 mm over 350 mm. */
export const TAILOR_CURVE = {
  straightMm: 250,
  r0: 1500,
  r1: 300,
  curveMm: 350,
  widthMm: 45,
} as const
/** L-square: 600 × 300 mm, arms 50 mm wide. */
export const L_SQUARE = { longMm: 600, shortMm: 300, armMm: 50 } as const

// ---------- construction ----------

const polygonCentroid = (pts: readonly Vec[]): Vec => {
  const a = polygonSignedArea(pts)
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i]
    const r = pts[(i + 1) % pts.length]
    const f = q.x * r.y - r.x * q.y
    cx += (q.x + r.x) * f
    cy += (q.y + r.y) * f
  }
  return vec(cx / (6 * a), cy / (6 * a))
}

/** Edge points offset `width(s)` mm towards the body side, from the end back to the start. */
const backOffset = (e: WorkingEdge, width: (s: number) => number, step = 2): Vec[] => {
  const n = Math.ceil(e.totalLength / step)
  const out: Vec[] = []
  for (let i = n; i >= 0; i--) {
    const smp = edgeAt(e, (e.totalLength * i) / n)
    out.push(add(smp.point, scale(perp(smp.tangent), e.bodySide * width(smp.s))))
  }
  return out
}

const make = (
  id: RulerId,
  name: string,
  defs: readonly WorkingEdgeDef[],
  outlineOf: (edges: readonly WorkingEdge[]) => Vec[],
  handleOf: (edges: readonly WorkingEdge[]) => Vec,
  centreOf?: (edges: readonly WorkingEdge[]) => Vec,
): Ruler => {
  const edges = defs.map(buildEdge)
  const outline = outlineOf(edges)
  return {
    id,
    name,
    edges,
    outline,
    centre: centreOf ? centreOf(edges) : polygonCentroid(outline),
    handle: handleOf(edges),
  }
}

function buildSquare(): Ruler {
  const { longMm: L, shortMm: S, armMm: W } = L_SQUARE
  const straight = (len: number) => [{ length: len, k0: 0, k1: 0 }]
  return make(
    'square',
    'Regla recta / escuadra L',
    [
      {
        id: 'outerLong',
        label: 'Brazo largo, exterior',
        start: vec(0, 0),
        heading: 0,
        pieces: straight(L),
        bodySide: 1,
      },
      {
        id: 'innerLong',
        label: 'Brazo largo, interior',
        start: vec(W, W),
        heading: 0,
        pieces: straight(L - W),
        bodySide: -1,
        labelOffsetMm: W,
      },
      {
        id: 'outerShort',
        label: 'Brazo corto, exterior',
        start: vec(0, 0),
        heading: Math.PI / 2,
        pieces: straight(S),
        bodySide: -1,
      },
      {
        id: 'innerShort',
        label: 'Brazo corto, interior',
        start: vec(W, W),
        heading: Math.PI / 2,
        pieces: straight(S - W),
        bodySide: 1,
        labelOffsetMm: W,
      },
    ],
    () => [vec(0, 0), vec(L, 0), vec(L, W), vec(W, W), vec(W, S), vec(0, S)],
    () => vec(W / 2, S + 22),
    // The centroid of an L falls outside it: the square turns about its corner.
    () => vec(W / 2, W / 2),
  )
}

function buildFrench(): Ruler {
  const c = FRENCH_CURVE
  return make(
    'french',
    'Curvígrafo (curva francesa)',
    [
      {
        id: 'curve',
        label: 'Curva',
        start: vec(0, 0),
        heading: 0,
        pieces: [
          { length: c.spiralMm, k0: 1 / c.r0, k1: 1 / c.r1 },
          { length: c.arcMm, k0: 1 / c.r1, k1: 1 / c.r1 },
        ],
        // The body lies outside the spiral (an inner offset would cross itself at R 25 mm).
        bodySide: -1,
      },
    ],
    ([e]) => [...edgePolyline(e, 0, e.totalLength, 2), ...backOffset(e, () => c.widthMm)],
    ([e]) => {
      const m = edgeAt(e, e.totalLength * 0.75)
      return add(m.point, scale(perp(m.tangent), e.bodySide * (c.widthMm + 18)))
    },
    // The spiral's centroid falls outside the body: turn about the middle of the body.
    ([e]) => {
      const m = edgeAt(e, e.totalLength / 2)
      return add(m.point, scale(perp(m.tangent), (e.bodySide * c.widthMm) / 2))
    },
  )
}

function buildHip(): Ruler {
  const c = HIP_CURVE
  const curve = buildEdge({
    id: 'curve',
    label: 'Curva',
    start: vec(0, 0),
    heading: 0,
    pieces: [{ length: c.lengthMm, k0: 1 / c.r0, k1: 1 / c.r1 }],
    bodySide: 1,
  })
  // Straight back: parallel to the chord, `backGapMm` beyond it on the side of the curvature centre.
  const a = edgePoint(curve, 0)
  const b = edgePoint(curve, curve.totalLength)
  const chord = sub(b, a)
  const u = scale(chord, 1 / Math.hypot(chord.x, chord.y))
  const n = perp(u)
  const b0 = add(a, scale(n, c.backGapMm))
  return make(
    'hip',
    'Regla de cadera',
    [
      curve,
      {
        id: 'back',
        label: 'Canto recto',
        start: b0,
        heading: Math.atan2(u.y, u.x),
        pieces: [{ length: Math.hypot(chord.x, chord.y), k0: 0, k1: 0 }],
        bodySide: -1,
      },
    ],
    ([e]) => [...edgePolyline(e, 0, e.totalLength, 2), add(b, scale(n, c.backGapMm)), b0],
    () => add(add(a, scale(chord, 0.5)), scale(n, c.backGapMm + 18)),
  )
}

function buildTailor(): Ruler {
  const c = TAILOR_CURVE
  return make(
    'tailor',
    'Regla de sastre',
    [
      {
        id: 'curve',
        label: 'Canto',
        start: vec(0, 0),
        heading: 0,
        pieces: [
          { length: c.straightMm, k0: 0, k1: 0 },
          { length: c.curveMm, k0: 1 / c.r0, k1: 1 / c.r1 },
        ],
        bodySide: 1,
      },
    ],
    ([e]) => [...edgePolyline(e, 0, e.totalLength, 2), ...backOffset(e, () => c.widthMm)],
    ([e]) => {
      const m = edgeAt(e, e.totalLength * 0.3)
      return add(m.point, scale(perp(m.tangent), e.bodySide * (c.widthMm + 18)))
    },
  )
}

const cache = new Map<RulerId, Ruler>()

export const getRuler = (id: RulerId): Ruler => {
  let r = cache.get(id)
  if (!r) {
    r =
      id === 'square'
        ? buildSquare()
        : id === 'french'
          ? buildFrench()
          : id === 'hip'
            ? buildHip()
            : buildTailor()
    cache.set(id, r)
  }
  return r
}

export const isRulerId = (v: unknown): v is RulerId =>
  typeof v === 'string' && (RULER_IDS as readonly string[]).includes(v)

export const rulerEdge = (ruler: Ruler, edgeId: string): WorkingEdge => {
  const e = ruler.edges.find((x) => x.id === edgeId)
  if (!e) throw new Error(`La regla "${ruler.id}" no tiene el borde "${edgeId}"`)
  return e
}

// ---------- pose ----------

/** Ruler frame → world. */
export const poseAffine = (pose: RulerPose): Affine => {
  const t = degToRad(pose.angleDeg)
  const c = Math.cos(t)
  const s = Math.sin(t)
  const f = pose.flipped ? -1 : 1
  return { a: c, b: s, c: -s * f, d: c * f, e: pose.x, f: pose.y }
}

export const invertAffine = (m: Affine): Affine => {
  const det = m.a * m.d - m.b * m.c
  const a = m.d / det
  const b = -m.b / det
  const c = -m.c / det
  const d = m.a / det
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) }
}

export const toWorld = (pose: RulerPose, p: Vec): Vec => applyAffine(poseAffine(pose), p)
export const toRuler = (pose: RulerPose, p: Vec): Vec =>
  applyAffine(invertAffine(poseAffine(pose)), p)

/** Normalise degrees to (−180, 180]. */
export const wrapDegrees = (d: number): number => {
  const r = ((((d + 180) % 360) + 360) % 360) - 180
  return r === -180 ? 180 : r
}

/** Pose with the ruler's centre at world point `at`. */
export const poseCentredAt = (ruler: Ruler, at: Vec, angleDeg = 0, flipped = false): RulerPose => {
  const base: RulerPose = { x: 0, y: 0, angleDeg, flipped }
  const c = toWorld(base, ruler.centre)
  return { ...base, x: at.x - c.x, y: at.y - c.y }
}

/** The same pose turned to `angleDeg` about the ruler's centre. */
export const rotatePose = (ruler: Ruler, pose: RulerPose, angleDeg: number): RulerPose =>
  poseCentredAt(ruler, toWorld(pose, ruler.centre), wrapDegrees(angleDeg), pose.flipped)

/** The ruler turned over (mirrored across its own x axis) in place: its centre stays put. */
export const flipPose = (ruler: Ruler, pose: RulerPose): RulerPose =>
  poseCentredAt(ruler, toWorld(pose, ruler.centre), pose.angleDeg, !pose.flipped)

export const translatePose = (pose: RulerPose, d: Vec): RulerPose => ({
  ...pose,
  x: pose.x + d.x,
  y: pose.y + d.y,
})

/** World heading (radians) of the edge tangent at s for a pose. */
const worldHeading = (e: WorkingEdge, s: number, pose: RulerPose): number =>
  degToRad(pose.angleDeg) + (pose.flipped ? -1 : 1) * edgeAt(e, s).theta

/**
 * Slide the ruler along its own working edge: the edge point at `sContact` is the contact point;
 * afterwards the edge point at `sContact + delta` sits there with the same world tangent (straight
 * edges simply translate along themselves; on curves the ruler turns to stay tangent).
 */
export function slidePose(
  ruler: Ruler,
  edgeId: string,
  pose: RulerPose,
  sContact: number,
  delta: number,
): { pose: RulerPose; s: number } {
  const e = rulerEdge(ruler, edgeId)
  const s = Math.max(0, Math.min(e.totalLength, sContact + delta))
  const contact = toWorld(pose, edgePoint(e, sContact))
  const heading = worldHeading(e, sContact, pose)
  const local = edgeAt(e, s)
  const angle = heading - (pose.flipped ? -1 : 1) * local.theta
  const turned: RulerPose = {
    x: 0,
    y: 0,
    angleDeg: wrapDegrees(radToDeg(angle)),
    flipped: pose.flipped,
  }
  const at = toWorld(turned, local.point)
  return { pose: { ...turned, x: contact.x - at.x, y: contact.y - at.y }, s }
}

export interface RulerEdgeHit {
  readonly edgeId: string
  readonly s: number
  /** World point on the edge. */
  readonly point: Vec
  readonly distance: number
}

/** Working-edge point nearest to the world point `p` (over every edge, or one). */
export function nearestRulerEdge(
  ruler: Ruler,
  pose: RulerPose,
  p: Vec,
  edgeId?: string,
): RulerEdgeHit {
  const q = toRuler(pose, p)
  let best: RulerEdgeHit | null = null
  for (const e of ruler.edges) {
    if (edgeId && e.id !== edgeId) continue
    const h = nearestOnEdge(e, q)
    if (!best || h.distance < best.distance)
      best = { edgeId: e.id, s: h.s, point: toWorld(pose, h.point), distance: h.distance }
  }
  if (!best) throw new Error(`La regla "${ruler.id}" no tiene el borde "${edgeId}"`)
  return best
}

/** Quick align: move the ruler (no turn) so its nearest working edge passes through `p`. */
export function alignPose(
  ruler: Ruler,
  pose: RulerPose,
  p: Vec,
): { pose: RulerPose; hit: RulerEdgeHit } {
  const hit = nearestRulerEdge(ruler, pose, p)
  return { pose: translatePose(pose, sub(p, hit.point)), hit: { ...hit, point: p, distance: 0 } }
}

// ---------- tracing ----------

/** Endpoint deviation (mm) above which a trace is reported instead of applied silently. */
export const TRACE_DEVIATION_WARN_MM = 3

export interface RulerTrace {
  readonly rulerId: RulerId
  readonly edgeId: string
  /** Edge arc lengths nearest to p0 and p1. */
  readonly s0: number
  readonly s1: number
  /** World Béziers from exactly p0 to exactly p1 (after the endpoint correction). */
  readonly beziers: readonly CubicBezier[]
  /** World Béziers of the edge itself between s0 and s1 (before the correction). */
  readonly raw: readonly CubicBezier[]
  /** Distance (mm) from p0 / p1 to the posed edge, and the larger one. */
  readonly startDeviation: number
  readonly endDeviation: number
  readonly deviation: number
  /** Length of the corrected curve (mm). */
  readonly lengthMm: number
  /** True when the deviation exceeds TRACE_DEVIATION_WARN_MM (the UI must say so). */
  readonly warn: boolean
  /** The whole trace as ONE cubic (corrected like `beziers`), and its max deviation from the edge. */
  readonly single: CubicBezier
  readonly singleError: number
}

/** Similarity (rotation + uniform scale + translation) taking a → p and b → q. */
const similarity = (a: Vec, b: Vec, p: Vec, q: Vec): ((z: Vec) => Vec) => {
  const ab = sub(b, a)
  const pq = sub(q, p)
  const den = ab.x * ab.x + ab.y * ab.y
  // k = pq / ab as complex numbers.
  const kr = den > 0 ? (pq.x * ab.x + pq.y * ab.y) / den : 1
  const ki = den > 0 ? (pq.y * ab.x - pq.x * ab.y) / den : 0
  return (z) => {
    const d = sub(z, a)
    return vec(p.x + kr * d.x - ki * d.y, p.y + ki * d.x + kr * d.y)
  }
}

/**
 * Trace along a placed ruler between two world points: both are projected onto the posed working
 * edge, the edge between the projections is fitted with Béziers (≤ 0.05 mm) and its ends are taken
 * exactly to p0 and p1 by a small similarity (the "affine correction"). The deviation of p0 / p1
 * from the edge is reported; above 3 mm the UI must warn instead of applying silently.
 * Returns null when the two points project to (almost) the same place of the edge.
 */
export function fitRulerToPoints(
  ruler: Ruler,
  edgeId: string,
  pose: RulerPose,
  p0: Vec,
  p1: Vec,
): RulerTrace | null {
  const e = rulerEdge(ruler, edgeId)
  const h0 = nearestOnEdge(e, toRuler(pose, p0))
  const h1 = nearestOnEdge(e, toRuler(pose, p1))
  if (Math.abs(h1.s - h0.s) < 1 || distance(p0, p1) < 1) return null
  const m = poseAffine(pose)
  const raw = edgeRangeToBeziers(e, h0.s, h1.s, 0.05).map(
    (b) => mapSegment(b, (q) => applyAffine(m, q)) as CubicBezier,
  )
  const e0 = applyAffine(m, h0.point)
  const e1 = applyAffine(m, h1.point)
  const fix = similarity(e0, e1, p0, p1)
  const beziers = raw.map((b) => mapSegment(b, fix) as CubicBezier)
  const k = distance(p0, p1) / Math.max(distance(e0, e1), 1e-9)
  const deviation = Math.max(h0.distance, h1.distance)
  const one = fitOneCubic(e, h0.s, h1.s)
  const single = mapSegment(
    mapSegment(one, (q) => applyAffine(m, q)),
    fix,
  ) as CubicBezier
  return {
    rulerId: ruler.id,
    edgeId,
    s0: h0.s,
    s1: h1.s,
    beziers,
    raw,
    startDeviation: h0.distance,
    endDeviation: h1.distance,
    deviation,
    lengthMm: Math.abs(h1.s - h0.s) * k,
    warn: deviation > TRACE_DEVIATION_WARN_MM,
    single,
    singleError: edgeFitError(e, h0.s, h1.s, [one], 48) * k,
  }
}

/** The trace on the working edge that passes closest to both points. */
export function bestRulerTrace(ruler: Ruler, pose: RulerPose, p0: Vec, p1: Vec): RulerTrace | null {
  let best: RulerTrace | null = null
  for (const e of ruler.edges) {
    const t = fitRulerToPoints(ruler, e.id, pose, p0, p1)
    if (t && (!best || t.deviation < best.deviation)) best = t
  }
  return best
}

/** Max distance (mm) between a trace's raw Béziers and the ruler edge (fit quality). */
export const traceFitError = (ruler: Ruler, pose: RulerPose, t: RulerTrace): number => {
  const inv = invertAffine(poseAffine(pose))
  const local = t.raw.map((b) => mapSegment(b, (q) => applyAffine(inv, q)) as CubicBezier)
  return edgeFitError(rulerEdge(ruler, t.edgeId), t.s0, t.s1, local)
}

/**
 * Pose that lays a working edge best along a world curve (sampled as a polyline from its start to
 * its end): every stretch of the edge as long as the curve is tried (both ways round, ruler face up
 * or turned over), its chord laid on the curve's chord; the one with the smallest max deviation wins.
 */
export function fitRulerToCurve(
  ruler: Ruler,
  edgeId: string,
  curve: readonly Vec[],
): { pose: RulerPose; s0: number; s1: number; deviation: number } {
  const e = rulerEdge(ruler, edgeId)
  let len = 0
  for (let i = 1; i < curve.length; i++) len += distance(curve[i - 1], curve[i])
  len = Math.min(len, e.totalLength)
  const q0 = curve[0]
  const q1 = curve[curve.length - 1]
  const probes = Array.from(
    { length: 24 },
    (_, i) => curve[Math.round((i * (curve.length - 1)) / 23)],
  )
  const tryAt = (s0: number, backwards: boolean, flipped: boolean) => {
    const a = backwards ? s0 + len : s0
    const b = backwards ? s0 : s0 + len
    const unit: RulerPose = { x: 0, y: 0, angleDeg: 0, flipped }
    const la = toWorld(unit, edgePoint(e, a))
    const lb = toWorld(unit, edgePoint(e, b))
    const angle = Math.atan2(q1.y - q0.y, q1.x - q0.x) - Math.atan2(lb.y - la.y, lb.x - la.x)
    const turned: RulerPose = { x: 0, y: 0, angleDeg: wrapDegrees(radToDeg(angle)), flipped }
    // Centre the chords on each other.
    const ca = toWorld(turned, edgePoint(e, a))
    const cb = toWorld(turned, edgePoint(e, b))
    const shift = sub(scale(add(q0, q1), 0.5), scale(add(ca, cb), 0.5))
    const pose = translatePose(turned, shift)
    let dev = 0
    for (const p of probes) dev = Math.max(dev, nearestOnEdge(e, toRuler(pose, p)).distance)
    return { pose, s0: a, s1: b, deviation: dev }
  }
  let best = tryAt(0, false, false)
  for (const flipped of [false, true])
    for (const backwards of [false, true])
      for (let s = 0; s <= e.totalLength - len + 1e-9; s += 4) {
        const r = tryAt(s, backwards, flipped)
        if (r.deviation < best.deviation) best = r
      }
  // Refine around the best start.
  const start = Math.min(best.s0, best.s1)
  const backwards = best.s0 > best.s1
  for (let s = Math.max(0, start - 4); s <= Math.min(e.totalLength - len, start + 4); s += 0.5) {
    const r = tryAt(s, backwards, best.pose.flipped)
    if (r.deviation < best.deviation) best = r
  }
  // Then nudge the pose (x, y, angle about the curve's middle) while the max deviation drops.
  const devOf = (pose: RulerPose) => {
    let dev = 0
    for (const p of probes) dev = Math.max(dev, nearestOnEdge(e, toRuler(pose, p)).distance)
    return dev
  }
  const pivot = scale(add(q0, q1), 0.5)
  const turnAbout = (pose: RulerPose, deg: number): RulerPose => {
    const m = poseAffine({ ...pose, angleDeg: pose.angleDeg + deg })
    const local = toRuler(pose, pivot)
    const at = applyAffine(m, local)
    return {
      ...pose,
      angleDeg: wrapDegrees(pose.angleDeg + deg),
      x: m.e + pivot.x - at.x,
      y: m.f + pivot.y - at.y,
    }
  }
  let pose = best.pose
  let dev = best.deviation
  for (let step = 2; step > 0.01; step /= 2) {
    let improved = true
    while (improved) {
      improved = false
      for (const cand of [
        translatePose(pose, vec(step, 0)),
        translatePose(pose, vec(-step, 0)),
        translatePose(pose, vec(0, step)),
        translatePose(pose, vec(0, -step)),
        turnAbout(pose, step / 2),
        turnAbout(pose, -step / 2),
      ]) {
        const d = devOf(cand)
        if (d < dev - 1e-6) {
          pose = cand
          dev = d
          improved = true
        }
      }
    }
  }
  const ends = [nearestOnEdge(e, toRuler(pose, q0)).s, nearestOnEdge(e, toRuler(pose, q1)).s]
  return { pose, s0: ends[0], s1: ends[1], deviation: dev }
}
