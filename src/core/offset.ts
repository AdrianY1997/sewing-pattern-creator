/**
 * Offset of closed paths (seam allowance) with a per-segment distance.
 *
 * - Positive distances go outward (away from the enclosed area), negative inward, 0 keeps the edge.
 * - Lines are offset exactly. Béziers are offset by fitting cubics to the true offset curve and
 *   subdividing until every fitted point lies at |d| ± `tolerance` from the source curve.
 * - Convex corners are mitred; a mitre longer than `miterLimit × max(d)` from the original corner
 *   is clipped square to the bisector. Concave corners are trimmed at the intersection of the
 *   neighbouring offset pieces. Unequal distances on a smooth joint produce a straight step.
 * - Corners between a hem edge (`hemEdges`) and a neighbouring edge are "mirrored" (esquina
 *   espejo, see mirroredHemCorner) so the turned-up hem allowance matches the neighbouring seam.
 * - Output ids: `${id}~off` (or `${id}~off.k` when a curve needed several pieces) and
 *   `${id}~join.k` for corner connectors.
 * Limitations: self-intersections between non-adjacent pieces (allowance wider than a short edge
 * or larger than the curvature radius on the inward side) are not removed here; seamAllowancePath
 * (./seam) removes them.
 */
import {
  type CubicBezier,
  bezierPoint,
  bezierDerivative,
  bezierTangent,
  cubic,
  nearestOnBezier,
  subBezier,
} from './bezier'
import { intersectSegments, lineBezierIntersections, lineLineParams } from './intersect'
import {
  type Path,
  type Segment,
  isContinuous,
  line,
  path,
  pathSignedArea,
  segEnd,
  segmentLength,
  segmentTangent,
} from './path'
import { add, distance, dot, length, lerp, mirror, normalize, scale, sub, type Vec } from './vec'

export type OffsetDistances = number | Readonly<Record<string, number>>

export interface OffsetOptions {
  /** Maximum mitre reach from the corner, as a multiple of the larger adjacent distance. Default 4. */
  readonly miterLimit?: number
  /** Maximum radial error of offset curves in mm. Default 0.02. */
  readonly tolerance?: number
  /** Distance for segments missing from a distance record. Default 0. */
  readonly defaultDistance?: number
  /**
   * Ids of hem edges: a corner between a hem edge with a positive distance and a non-hem edge
   * gets a mirrored corner (see mirroredHemCorner) instead of a mitre.
   */
  readonly hemEdges?: Iterable<string>
}

const TINY = 1e-9

const subSegment = (s: Segment, t0: number, t1: number, id = s.id): Segment =>
  s.kind === 'line'
    ? line(id, lerp(s.p0, s.p1, t0), lerp(s.p0, s.p1, t1))
    : subBezier(s, t0, t1, id)

const withStart = (s: Segment, p: Vec): Segment =>
  s.kind === 'line' ? line(s.id, p, s.p1) : cubic(s.id, p, add(s.p1, sub(p, s.p0)), s.p2, s.p3)

const withEnd = (s: Segment, p: Vec): Segment =>
  s.kind === 'line' ? line(s.id, s.p0, p) : cubic(s.id, s.p0, s.p1, add(s.p2, sub(p, s.p3)), p)

// ---------- curve offset by fitting ----------

const bernstein = (u: number): [number, number, number, number] => {
  const mu = 1 - u
  return [mu * mu * mu, 3 * mu * mu * u, 3 * mu * u * u, u * u * u]
}

/** Least-squares cubic with fixed ends and end tangent directions (Schneider). */
const fitCubic = (
  id: string,
  pts: readonly Vec[],
  t0: Vec,
  t3: Vec,
  params: readonly number[],
): CubicBezier => {
  const first = pts[0]
  const last = pts[pts.length - 1]
  const tHat2 = scale(t3, -1)
  let c00 = 0
  let c01 = 0
  let c11 = 0
  let x0 = 0
  let x1 = 0
  pts.forEach((q, i) => {
    const [b0, b1, b2, b3] = bernstein(params[i])
    const a1 = scale(t0, b1)
    const a2 = scale(tHat2, b2)
    c00 += dot(a1, a1)
    c01 += dot(a1, a2)
    c11 += dot(a2, a2)
    const tmp = sub(q, add(scale(first, b0 + b1), scale(last, b2 + b3)))
    x0 += dot(a1, tmp)
    x1 += dot(a2, tmp)
  })
  const det = c00 * c11 - c01 * c01
  const chord = distance(first, last)
  let alpha = Math.abs(det) > 1e-12 ? (x0 * c11 - x1 * c01) / det : 0
  let beta = Math.abs(det) > 1e-12 ? (c00 * x1 - c01 * x0) / det : 0
  if (!(alpha > 1e-6 * chord) || !(beta > 1e-6 * chord)) alpha = beta = chord / 3
  return cubic(id, first, add(first, scale(t0, alpha)), add(last, scale(tHat2, beta)), last)
}

/** One Newton step improving the curve parameter of each sample (Schneider reparameterisation). */
const reparameterise = (c: CubicBezier, pts: readonly Vec[], params: readonly number[]): number[] =>
  params.map((u, i) => {
    const d = sub(bezierPoint(c, u), pts[i])
    const d1 = bezierDerivative(c, u)
    const p1 = c.p1
    // Second derivative at u.
    const mu = 1 - u
    const d2 = {
      x: 6 * mu * (c.p2.x - 2 * p1.x + c.p0.x) + 6 * u * (c.p3.x - 2 * c.p2.x + p1.x),
      y: 6 * mu * (c.p2.y - 2 * p1.y + c.p0.y) + 6 * u * (c.p3.y - 2 * c.p2.y + p1.y),
    }
    const den = dot(d1, d1) + dot(d, d2)
    if (Math.abs(den) < TINY) return u
    const next = u - dot(d, d1) / den
    return Math.max(0, Math.min(1, next))
  })

const offsetBezier = (
  b: CubicBezier,
  d: number,
  outward: (tangent: Vec) => Vec,
  tolerance: number,
): CubicBezier[] => {
  const offsetAt = (t: number) => add(bezierPoint(b, t), scale(outward(bezierTangent(b, t)), d))
  const out: CubicBezier[] = []
  const SAMPLES = 16
  const fit = (ta: number, tb: number, depth: number) => {
    const pts: Vec[] = []
    for (let k = 0; k <= SAMPLES; k++) pts.push(offsetAt(ta + ((tb - ta) * k) / SAMPLES))
    const cum = [0]
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + distance(pts[k - 1], pts[k]))
    const total = cum[cum.length - 1]
    let params = cum.map((c) => (total > 0 ? c / total : 0))
    const tA = bezierTangent(b, ta)
    const tB = bezierTangent(b, tb)
    let c = fitCubic('', pts, tA, tB, params)
    for (let it = 0; it < 4; it++) {
      params = reparameterise(c, pts, params)
      c = fitCubic('', pts, tA, tB, params)
    }
    // Error: fitted points vs. exact offset distance, plus coverage of the exact samples.
    let err = 0
    for (let k = 1; k < 2 * SAMPLES; k++) {
      const p = bezierPoint(c, k / (2 * SAMPLES))
      err = Math.max(err, Math.abs(nearestOnBezier(b, p).distance - Math.abs(d)))
    }
    for (let k = 1; k < SAMPLES; k++) err = Math.max(err, nearestOnBezier(c, pts[k]).distance)
    if (err <= tolerance || depth >= 10) {
      out.push(c)
      return
    }
    const m = (ta + tb) / 2
    fit(ta, m, depth + 1)
    fit(m, tb, depth + 1)
  }
  fit(0, 1, 0)
  return out
}

// ---------- mirrored hem corner ----------

/** Crossings of a segment with the infinite line ab: parameter on the segment and point. */
const lineCrossings = (s: Segment, a: Vec, b: Vec): { t: number; point: Vec }[] => {
  if (s.kind === 'cubic')
    return lineBezierIntersections(a, b, s).map((h) => ({ t: h.t, point: h.point }))
  const hit = lineLineParams(s.p0, s.p1, a, b)
  return hit && hit.u >= -1e-9 && hit.u <= 1 + 1e-9
    ? [{ t: Math.max(0, Math.min(1, hit.u)), point: hit.point }]
    : []
}

/**
 * Make the offset pieces of one edge end at `target`, a point on the tangent line at their end.
 * Ahead of the current end: a final line is extended (a curve gets a straight connector, returned
 * in `connectors`). Behind it: the pieces are trimmed where they cross the line `cut` (through the
 * target), so curves are cut at their true crossing. Returns the new end point.
 */
const endPiecesAt = (
  list: Segment[],
  target: Vec,
  cut: readonly [Vec, Vec],
  connectors: [Vec, Vec][],
): Vec => {
  const last = list[list.length - 1]
  const E = segEnd(last)
  if (dot(sub(target, E), segmentTangent(last, 1)) >= -1e-9) {
    if (last.kind === 'line') list[list.length - 1] = withEnd(last, target)
    else connectors.push([E, target])
    return target
  }
  for (let k = list.length - 1; k >= 0; k--) {
    const hits = lineCrossings(list[k], cut[0], cut[1])
    if (hits.length === 0) continue
    const h = hits.reduce((x, y) => (y.t > x.t ? y : x))
    list.splice(k, list.length - k, withEnd(subSegment(list[k], 0, h.t), h.point))
    return h.point
  }
  connectors.push([E, target])
  return target
}

/** Mirror image of endPiecesAt for the start of the pieces of an edge. */
const startPiecesAt = (
  list: Segment[],
  target: Vec,
  cut: readonly [Vec, Vec],
  connectors: [Vec, Vec][],
): Vec => {
  const first = list[0]
  const S = first.p0
  if (dot(sub(target, S), segmentTangent(first, 0)) <= 1e-9) {
    if (first.kind === 'line') list[0] = withStart(first, target)
    else connectors.push([target, S])
    return target
  }
  for (let k = 0; k < list.length; k++) {
    const hits = lineCrossings(list[k], cut[0], cut[1])
    if (hits.length === 0) continue
    const h = hits.reduce((x, y) => (y.t < x.t ? y : x))
    list.splice(0, k + 1, withStart(subSegment(list[k], h.t, 1), h.point))
    return h.point
  }
  connectors.push([target, S])
  return target
}

/**
 * Mirrored hem corner ("esquina espejo"). A hem allowance is folded up along the hem line before
 * the side seam is sewn, so its end must have the shape of the neighbouring seam allowance seen in
 * a mirror. Construction at the corner V between a seam edge S (allowance s) and a hem edge H
 * (allowance h > 0):
 *   1. F, the fold line: the tangent line of H at V.
 *   2. Ls, the seam allowance line: the tangent line of the offset of S at V (offset by s).
 *   3. P1 = Ls ∩ F: the seam allowance line runs down to the fold line.
 *   4. Ls' = Ls mirrored across F; P2 = Ls' ∩ Lh, where Lh is the hem allowance line (H offset
 *      by h).
 *   5. The cut line runs … S offset → P1 → P2 → H offset … (or the reverse when H comes first).
 * Folding the allowance up along F maps the segment P1 P2 onto Ls, i.e. the hem allowance edge
 * coincides with the seam allowance edge, whatever the angle between the seam and the hem (a
 * square corner for a perpendicular seam, an inward slant for a flared skirt). Returns false when
 * the construction degenerates (parallel lines, points beyond `reach`), so the caller mitres.
 */
const mirroredHemCorner = (
  hemFirst: boolean,
  seg: { readonly a: Segment; readonly b: Segment },
  pieces: { a: Segment[]; b: Segment[] },
  reach: number,
): [Vec, Vec][] | null => {
  const V = segEnd(seg.a)
  const Ta = segmentTangent(seg.a, 1)
  const Tb = segmentTangent(seg.b, 0)
  const lastA = pieces.a[pieces.a.length - 1]
  const firstB = pieces.b[0]
  // Hem edge H and seam edge S, with a point on each allowance line.
  const Th = hemFirst ? Ta : Tb
  const Ts = hemFirst ? Tb : Ta
  const onLs = hemFirst ? firstB.p0 : segEnd(lastA)
  const onLh = hemFirst ? segEnd(lastA) : firstB.p0
  const F: [Vec, Vec] = [V, add(V, Th)]
  const Ls: [Vec, Vec] = [onLs, add(onLs, Ts)]
  const p1 = lineLineParams(Ls[0], Ls[1], F[0], F[1])
  if (!p1) return null
  const LsM: [Vec, Vec] = [mirror(Ls[0], F[0], F[1]), mirror(Ls[1], F[0], F[1])]
  const p2 = lineLineParams(LsM[0], LsM[1], onLh, add(onLh, Th))
  if (!p2) return null
  const P1 = p1.point
  const P2 = p2.point
  if (distance(P1, V) > reach || distance(P2, V) > reach) return null
  // The hem side ends/starts at P2 (cut along Ls'), the seam side at P1 (cut along F); the two
  // meet at P1, which lies on both F and Ls'.
  const connectors: [Vec, Vec][] = []
  const tail: [Vec, Vec][] = []
  const A = endPiecesAt(pieces.a, hemFirst ? P2 : P1, hemFirst ? LsM : F, connectors)
  const B = startPiecesAt(pieces.b, hemFirst ? P1 : P2, hemFirst ? F : LsM, tail)
  connectors.push([A, P1], [P1, B], ...tail)
  return connectors
}

// ---------- path offset ----------

/**
 * Offset a closed path. `distances` is either one distance for every segment or a map from
 * segment id to distance (mm). Returns a new closed path with the same winding.
 */
export const offsetPath = (
  input: Path,
  distances: OffsetDistances,
  options: OffsetOptions = {},
): Path => {
  const { miterLimit = 4, tolerance = 0.02, defaultDistance = 0 } = options
  const hems = new Set(options.hemEdges ?? [])
  if (!input.closed) throw new Error('offsetPath: path must be closed')
  if (!isContinuous(input, 1e-3)) throw new Error('offsetPath: path is not continuous')
  const segs = input.segments.filter((s) => segmentLength(s) > TINY)
  if (segs.length === 0) throw new Error('offsetPath: empty path')

  const distOf = (id: string) =>
    typeof distances === 'number' ? distances : (distances[id] ?? defaultDistance)
  const sign = pathSignedArea(path(segs, true)) >= 0 ? 1 : -1
  const outward = (t: Vec): Vec => ({ x: sign * t.y, y: -sign * t.x })

  // 1. Offset every segment independently.
  const pieces: Segment[][] = segs.map((s) => {
    const d = distOf(s.id)
    if (s.kind === 'line') {
      const n = scale(outward(segmentTangent(s, 0)), d)
      return [line(`${s.id}~off`, add(s.p0, n), add(s.p1, n))]
    }
    if (d === 0) return [{ ...s, id: `${s.id}~off` }]
    const curves = offsetBezier(s, d, outward, tolerance)
    return curves.map((c, k) => ({
      ...c,
      id: curves.length === 1 ? `${s.id}~off` : `${s.id}~off.${k}`,
    }))
  })
  const joins: Segment[][] = segs.map(() => [])

  // 2. Resolve each corner between segment i and i+1.
  const n = segs.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const baseId = segs[i].id
    let k = 0
    const connector = (a: Vec, b: Vec) => {
      if (distance(a, b) > TINY) joins[i].push(line(`${baseId}~join.${k++}`, a, b))
    }
    const pi = pieces[i]
    const pj = pieces[j]
    const lastI = pi[pi.length - 1]
    const firstJ = pj[0]
    const E = segEnd(lastI)
    const S = firstJ.p0
    const V = segEnd(segs[i])
    const Ti = segmentTangent(segs[i], 1)
    const Tj = segmentTangent(segs[j], 0)
    const reach = miterLimit * Math.max(Math.abs(distOf(segs[i].id)), Math.abs(distOf(segs[j].id)))

    const hemI = hems.has(segs[i].id)
    const hemJ = hems.has(segs[j].id)
    if (hemI !== hemJ && distOf((hemI ? segs[i] : segs[j]).id) > 0) {
      const a = [...pi]
      const b = [...pj]
      const conns = mirroredHemCorner(hemI, { a: segs[i], b: segs[j] }, { a, b }, reach)
      if (conns) {
        pieces[i] = a
        pieces[j] = b
        for (const [p, q] of conns) connector(p, q)
        continue
      }
    }

    if (distance(E, S) < 1e-7) {
      pj[0] = withStart(firstJ, E)
      continue
    }
    const hit = lineLineParams(E, add(E, Ti), S, add(S, Tj))
    const nearlyParallel = !hit || Math.abs(Ti.x * Tj.y - Ti.y * Tj.x) < 1e-9
    if (nearlyParallel && dot(Ti, Tj) > 0) {
      connector(E, S) // smooth joint with a change of allowance: straight step
      continue
    }
    const tol = 1e-7
    const convex = nearlyParallel || (hit.u >= -tol && hit.v <= tol)
    if (convex) {
      const X = hit && !nearlyParallel ? hit.point : null
      if (X && distance(X, V) <= reach) {
        if (lastI.kind === 'line') pi[pi.length - 1] = withEnd(lastI, X)
        else connector(E, X)
        if (firstJ.kind === 'line') pj[0] = withStart(firstJ, X)
        else connector(X, S)
        continue
      }
      // Clipped mitre: cut square to the corner bisector at distance `reach` from V.
      const m = normalize(sub(Ti, Tj))
      const k1 = (reach - dot(sub(E, V), m)) / dot(Ti, m)
      const k2 = (reach - dot(sub(S, V), m)) / dot(Tj, m)
      if (length(m) === 0 || !(k1 >= 0) || !(k2 <= 0)) {
        connector(E, S) // bevel
        continue
      }
      const C1 = add(E, scale(Ti, k1))
      const C2 = add(S, scale(Tj, k2))
      if (lastI.kind === 'line') pi[pi.length - 1] = withEnd(lastI, C1)
      else connector(E, C1)
      connector(C1, C2)
      if (firstJ.kind === 'line') pj[0] = withStart(firstJ, C2)
      else connector(C2, S)
      continue
    }
    const concave = hit.u <= tol && hit.v >= -tol
    if (!concave) {
      connector(E, S)
      continue
    }
    // Concave: trim both neighbours at their intersection closest to the corner.
    let best: { a: number; b: number; t1: number; t2: number; point: Vec } | null = null
    for (let a = pi.length - 1; a >= 0; a--) {
      for (let b = 0; b < pj.length; b++) {
        for (const h of intersectSegments(pi[a], pj[b])) {
          const better =
            !best ||
            a + h.t1 > best.a + best.t1 + 1e-12 ||
            (Math.abs(a + h.t1 - (best.a + best.t1)) <= 1e-12 && b + h.t2 < best.b + best.t2)
          if (better) best = { a, b, t1: h.t1, t2: h.t2, point: h.point }
        }
      }
    }
    if (!best) {
      connector(E, S)
      continue
    }
    const headI = pi.slice(0, best.a)
    const cutI = withEnd(subSegment(pi[best.a], 0, best.t1), best.point)
    const tailJ = pj.slice(best.b + 1)
    const cutJ = withStart(subSegment(pj[best.b], best.t2, 1), best.point)
    pieces[i] = [...headI, cutI]
    pieces[j] = [cutJ, ...tailJ]
  }

  // 3. Assemble, drop degenerate pieces and enforce exact continuity.
  const raw: Segment[] = []
  for (let i = 0; i < n; i++) raw.push(...pieces[i], ...joins[i])
  const kept = raw.filter((s) => segmentLength(s) > 1e-7)
  const out: Segment[] = []
  kept.forEach((s, idx) => {
    if (idx === 0) {
      out.push(s)
      return
    }
    const prevEnd = segEnd(out[out.length - 1])
    if (distance(prevEnd, s.p0) > 1e-5) out.push(line(`${s.id}~gap`, prevEnd, s.p0))
    out.push(withStart(s, distance(prevEnd, s.p0) > 1e-5 ? s.p0 : prevEnd))
  })
  if (out.length > 1) {
    const end = segEnd(out[out.length - 1])
    if (distance(end, out[0].p0) > 1e-5) out.push(line(`${out[0].id}~gap`, end, out[0].p0))
    else out[out.length - 1] = withEnd(out[out.length - 1], out[0].p0)
  }
  return path(out, true)
}
