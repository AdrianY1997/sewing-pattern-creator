/**
 * Dart manipulation on pattern pieces (F4c), pivot method: close, transfer, convert to gathers and
 * shorten. Pure functions on a PatternPiece in its LOCAL frame; `fail` when not applicable.
 *
 * An edge dart opens on the outline: its legs end at two outline vertices and the outline runs
 * between them across the opening (a straight edge, or the dart cap). Closing or transferring cuts
 * the piece from the apex to a point Q of the outline and turns one side about the apex; the side
 * that turns is the one without the grainline (the smaller one when that does not decide), so the
 * main body (centre line, grain) stays where it was.
 */
import { curveWithTangents } from '../bezier'
import { stripMeta, type Dart, type DraftSegment, type OutlineRef, type PieceMark } from '../draft'
import { intersectSegments } from '../intersect'
import {
  distanceToPolyline,
  flattenSegment,
  line,
  mapSegment,
  pointInPolygon,
  polygonSignedArea,
  segEnd,
  segmentLength,
  segmentTangent,
} from '../path'
import {
  add,
  angleBetween,
  degToRad,
  distance,
  midpoint,
  normalize,
  perpendicularFoot,
  radToDeg,
  rotate,
  scale,
  sub,
  type Vec,
} from '../vec'
import {
  ON_EDGE_TOL,
  VERTEX_TOL,
  freshId,
  grainSegmentIds,
  moveSegmentEnd,
  moveVertexTo,
  orientedOutline,
  outlineVertex,
  reattachMarks,
  segOf,
  splitPieceSegment,
  storeOriented,
  vertexIndexAt,
  withGeometry,
} from './edit'
import { fail } from './errors'
import { projectOnSegment, segmentAt } from './marks'
import type { PatternPiece } from './types'

/** Suffix of the dart created by transferDart (`~t`, `~t2`…). */
export const TRANSFER_SUFFIX = '~t'
/** Suffix of the edge that bridges the spread opened by closeDart. */
export const GAP_SUFFIX = '~gap'
/** Suffix of a shortened dart's apex point. */
export const APEX_SUFFIX = '~apex'

/** Above this turn (degrees) two straight edges meet at a real corner and are not trued. */
const TRUE_MAX_TURN_DEG = 45

export const findDart = (piece: PatternPiece, dartId: unknown): Dart => {
  if (typeof dartId !== 'string' || !dartId) return fail('Falta la pinza')
  return (
    piece.darts.find((d) => d.id === dartId) ??
    fail(`La pinza "${dartId}" no existe en la pieza "${piece.id}"`)
  )
}

/** The end of a leg farther from the apex. */
const legFarEnd = (piece: PatternPiece, legId: string, apex: Vec): Vec => {
  const s = stripMeta(segOf(piece, legId))
  const a = s.p0
  const b = segEnd(s)
  return distance(a, apex) >= distance(b, apex) ? a : b
}

export interface DartFrame {
  readonly dart: Dart
  readonly apex: Vec
  /** Far ends of legs[0] and legs[1]. */
  readonly ends: readonly [Vec, Vec]
}

export function dartFrame(piece: PatternPiece, dartId: unknown): DartFrame {
  const dart = findDart(piece, dartId)
  const apex =
    piece.points[dart.apex] ?? fail(`Falta el vértice "${dart.apex}" de la pinza "${dart.id}"`)
  return {
    dart,
    apex,
    ends: [legFarEnd(piece, dart.legs[0], apex), legFarEnd(piece, dart.legs[1], apex)],
  }
}

/** Opening angle of a dart (degrees, between its legs at the apex). */
export const dartAngleDeg = (piece: PatternPiece, dartId: string): number => {
  const { apex, ends } = dartFrame(piece, dartId)
  return Math.abs(radToDeg(angleBetween(sub(ends[0], apex), sub(ends[1], apex))))
}

/** Width of a dart between the far ends of its legs (mm). */
export const dartWidth = (piece: PatternPiece, dartId: string): number => {
  const { ends } = dartFrame(piece, dartId)
  return distance(ends[0], ends[1])
}

/** Nearest outline vertex to `p` within ON_EDGE_TOL, or -1. */
const vertexNear = (piece: PatternPiece, p: Vec): number => vertexIndexAt(piece, p, ON_EDGE_TOL)

/** Make `p` (on the outline) a vertex, splitting the edge it lies on when needed. */
export function ensureVertex(piece: PatternPiece, p: Vec, what: string): PatternPiece {
  if (vertexNear(piece, p) >= 0) return piece
  let best: { id: string; len: number; distance: number } | null = null
  for (const r of piece.outline) {
    const hit = projectOnSegment(stripMeta(segOf(piece, r.segment)), p)
    if (!best || hit.distance < best.distance) best = { id: r.segment, ...hit }
  }
  if (!best || best.distance > ON_EDGE_TOL) return fail(`${what} no está sobre el contorno`)
  const len = segmentLength(stripMeta(piece.segments[best.id]))
  return splitPieceSegment(piece, best.id, best.len / len).piece
}

/** Indices of the outline from vertex `from` (inclusive) to vertex `to` (exclusive), forward. */
const run = (n: number, from: number, to: number): number[] => {
  const out: number[] = []
  for (let k = from; k !== to; k = (k + 1) % n) out.push(k)
  return out
}

const runLength = (piece: PatternPiece, ks: readonly number[]) =>
  ks.reduce((a, k) => a + segmentLength(orientedOutline(piece, k)), 0)

/** Polyline through outline segments `ks` (in traversal order). */
const runPoints = (piece: PatternPiece, ks: readonly number[]): Vec[] =>
  ks.flatMap((k, i) => {
    const pts = flattenSegment(orientedOutline(piece, k), 0.5)
    return i === 0 ? pts : pts.slice(1)
  })

/**
 * An edge dart on the outline: the opening runs forward from vertex `s` (end of leg `legS`) to
 * vertex `e` (end of leg `legE`); the body of the piece runs from `e` back round to `s`.
 */
interface DartTopology {
  readonly piece: PatternPiece
  readonly dart: Dart
  readonly apex: Vec
  readonly s: number
  readonly e: number
  readonly Es: Vec
  readonly Ee: Vec
  readonly legS: string
  readonly legE: string
  readonly opening: readonly number[]
  readonly body: readonly number[]
}

function topology(piece: PatternPiece, frame: DartFrame): DartTopology {
  const { dart, apex, ends } = frame
  const i0 = vertexNear(piece, ends[0])
  const i1 = vertexNear(piece, ends[1])
  if (i0 < 0 || i1 < 0) return fail(`Las piernas de la pinza "${dart.id}" no llegan al contorno`)
  if (i0 === i1) return fail(`La pinza "${dart.id}" está cerrada`)
  const n = piece.outline.length
  const f = run(n, i0, i1)
  const g = run(n, i1, i0)
  const forward = runLength(piece, f) <= runLength(piece, g)
  const [s, e, legS, legE] = forward
    ? [i0, i1, dart.legs[0], dart.legs[1]]
    : [i1, i0, dart.legs[1], dart.legs[0]]
  return {
    piece,
    dart,
    apex,
    s,
    e,
    Es: outlineVertex(piece, s),
    Ee: outlineVertex(piece, e),
    legS,
    legE,
    opening: forward ? f : g,
    body: forward ? g : f,
  }
}

/** Topology of an edge dart, splitting the edges its legs end on so both ends are vertices. */
function edgeDart(piece: PatternPiece, dartId: unknown): DartTopology {
  const frame = dartFrame(piece, dartId)
  if (frame.dart.type !== 'edge')
    fail(`La pinza "${frame.dart.id}" es interna (de rombo): solo se puede acortar`)
  let p = ensureVertex(piece, frame.ends[0], `La pierna "${frame.dart.legs[0]}"`)
  p = ensureVertex(p, frame.ends[1], `La pierna "${frame.dart.legs[1]}"`)
  return topology(p, frame)
}

/** Midpoint of the piece's grainline (local), or null. */
const grainMidpoint = (piece: PatternPiece): Vec | null => {
  const [id] = grainSegmentIds(piece)
  const s = id ? piece.segments[id] : undefined
  return s ? midpoint(s.p0, segEnd(stripMeta(s))) : null
}

const rotateStored = (s: DraftSegment, f: (p: Vec) => Vec): DraftSegment => ({
  ...s,
  ...mapSegment(stripMeta(s), f),
})

/** Rebuild a loop so that it starts with the segment that started the old outline, if present. */
const keepStart = (outline: OutlineRef[], first: string): OutlineRef[] => {
  const k = outline.findIndex((r) => r.segment === first)
  return k > 0 ? [...outline.slice(k), ...outline.slice(0, k)] : outline
}

/**
 * True the outline at vertex k (the join of segments k−1 and k): two straight edges that meet at a
 * small angle become collinear (the vertex moves onto the chord of their far ends); curves get
 * their handles aligned on a common tangent.
 */
export function trueJoin(piece: PatternPiece, k: number): PatternPiece {
  const n = piece.outline.length
  const kp = (k - 1 + n) % n
  const A = orientedOutline(piece, kp)
  const B = orientedOutline(piece, k)
  const J = B.p0
  if (A.kind === 'line' && B.kind === 'line') {
    const turn = Math.abs(angleBetween(sub(A.p1, A.p0), sub(B.p1, B.p0)))
    if (turn > degToRad(TRUE_MAX_TURN_DEG) || distance(A.p0, B.p1) < 1e-6) return piece
    return moveVertexTo(piece, J, perpendicularFoot(J, A.p0, B.p1))
  }
  const tA = segmentTangent(A, 1)
  const tB = segmentTangent(B, 0)
  const d = A.kind === 'line' ? tA : B.kind === 'line' ? tB : normalize(add(tA, tB))
  const segments = { ...piece.segments }
  const rA = piece.outline[kp]
  const rB = piece.outline[k]
  if (A.kind === 'cubic') {
    const h = distance(A.p2, J)
    const a = { ...A, p2: sub(J, scale(d, h)) }
    segments[rA.segment] = storeOriented(piece.segments[rA.segment], rA, a)
  }
  if (B.kind === 'cubic') {
    const h = distance(B.p1, J)
    const b = { ...B, p1: add(J, scale(d, h)) }
    segments[rB.segment] = storeOriented(piece.segments[rB.segment], rB, b)
  }
  const next = { ...piece, segments }
  return { ...next, marks: reattachMarks(next) }
}

/** Remove segments, their allowance and the marks attached to them, and orphan points. */
function dropSegments(
  piece: PatternPiece,
  ids: ReadonlySet<string>,
  keepPoints: readonly Vec[],
): PatternPiece {
  if (ids.size === 0) return piece
  const ends = [...ids].flatMap((id) => {
    const s = stripMeta(piece.segments[id])
    return [s.p0, segEnd(s)]
  })
  const segments = Object.fromEntries(Object.entries(piece.segments).filter(([id]) => !ids.has(id)))
  const allowance = Object.fromEntries(
    Object.entries(piece.allowance).filter(([id]) => !ids.has(id)),
  )
  const stillUsed = (p: Vec) =>
    Object.values(segments).some((s) => {
      const q = stripMeta(s)
      return distance(q.p0, p) <= VERTEX_TOL || distance(segEnd(q), p) <= VERTEX_TOL
    })
  const points = Object.fromEntries(
    Object.entries(piece.points).filter(
      ([, p]) =>
        keepPoints.some((k) => distance(k, p) <= VERTEX_TOL) ||
        stillUsed(p) ||
        !ends.some((e) => distance(e, p) <= VERTEX_TOL),
    ),
  )
  const marks = piece.marks.filter(
    (m) => !(typeof m.data?.segment === 'string' && ids.has(m.data.segment)),
  )
  return {
    ...piece,
    segments,
    allowance,
    points,
    marks,
    internalLines: piece.internalLines.filter((l) => !ids.has(l)),
  }
}

/** What opens at the cut point Q: a new dart (transfer) or a spread bridged by an edge (close). */
type Bridge = { readonly kind: 'dart'; readonly newId: string } | { readonly kind: 'spread' }

/**
 * Pivot: cut from the apex to Q, turn one side about the apex by `fraction` of the dart angle
 * (1 closes the dart) and bridge the opening at Q.
 */
function pivot(t0: DartTopology, Q: Vec, fraction: number, bridge: Bridge): PatternPiece {
  const frame: DartFrame = { dart: t0.dart, apex: t0.apex, ends: [t0.Es, t0.Ee] }
  const withQ = ensureVertex(t0.piece, Q, 'El punto de destino')
  // Legs[0]/[1] of the frame are now (Es, Ee): recompute indices on the split outline.
  const t = topology(withQ, frame)
  const piece = t.piece
  const legS = t0.legS
  const legE = t0.legE
  const P = t.apex
  const iq = vertexNear(piece, Q)
  const pos = t.body.indexOf(iq)
  if (iq < 0 || pos <= 0) fail('El destino debe estar en un borde de la pieza fuera de la pinza')
  const Qv = outlineVertex(piece, iq)
  const r1 = t.body.slice(0, pos) // Ee → Q
  const r2 = t.body.slice(pos) // Q → Es
  const poly1 = [P, ...runPoints(piece, r1)]
  const poly2 = [P, ...runPoints(piece, r2)]
  const theta = angleBetween(sub(t.Ee, P), sub(t.Es, P))
  const gm = grainMidpoint(piece)
  const in1 = gm !== null && pointInPolygon(gm, poly1)
  const in2 = gm !== null && pointInPolygon(gm, poly2)
  const turnR1 =
    in1 !== in2 ? in2 : Math.abs(polygonSignedArea(poly1)) <= Math.abs(polygonSignedArea(poly2))
  const phi = (turnR1 ? theta : -theta) * fraction
  const R = (p: Vec) => rotate(p, phi, P)
  const turned = turnR1 ? r1 : r2
  const turnedPoly = turnR1 ? poly1 : poly2
  const turnedPath = runPoints(piece, turned)
  const turnedIds = new Set(turned.map((k) => piece.outline[k].segment))
  const full = fraction >= 1 - 1e-9
  const inRegion = (p: Vec) =>
    distance(p, P) > VERTEX_TOL &&
    distance(p, Qv) > VERTEX_TOL &&
    (pointInPolygon(p, turnedPoly) || distanceToPolyline(p, turnedPath) <= VERTEX_TOL)
  const grain = grainSegmentIds(piece)
  const turnGrain = gm !== null && inRegion(gm)
  const legTurned = turnR1 ? legE : legS
  const legKept = turnR1 ? legS : legE

  // ---- segments: the turned side of the outline, internal lines on that side ----
  const segments: Record<string, DraftSegment> = { ...piece.segments }
  for (const id of turnedIds) segments[id] = rotateStored(segments[id], R)
  for (const id of piece.internalLines) {
    if (id === legKept) continue
    if (id === legTurned || (grain.has(id) && turnGrain)) {
      segments[id] = rotateStored(segments[id], R)
      continue
    }
    if (grain.has(id)) continue
    const s = stripMeta(segments[id])
    const mid = segmentAt(segments[id], segmentLength(s) / 2).point
    if (inRegion(mid)) segments[id] = rotateStored(segments[id], R)
  }
  const points = Object.fromEntries(
    Object.entries(piece.points).map(([name, p]) => [name, inRegion(p) ? R(p) : p]),
  )
  const marks = piece.marks.map((m): PieceMark => {
    if (m.kind === 'grainline') return turnGrain ? { ...m, at: R(m.at) } : m
    return inRegion(m.at) ? { ...m, at: R(m.at) } : m
  })
  const fold = piece.fold && {
    from: inRegion(piece.fold.from) ? R(piece.fold.from) : piece.fold.from,
    to: inRegion(piece.fold.to) ? R(piece.fold.to) : piece.fold.to,
  }

  // ---- the new outline ----
  const ref = (k: number) => piece.outline[k]
  const openingIds = t.opening.map((k) => ref(k).segment)
  const QR = R(Qv)
  const allowance: Record<string, number> = { ...piece.allowance }
  let bridgeRef: OutlineRef
  // The edge on the fixed side at Q gives the bridge its role and allowance.
  const fixedAtQ = ref(turnR1 ? r2[0] : r1[r1.length - 1]).segment
  const [bFrom, bTo] = turnR1 ? [QR, Qv] : [Qv, QR]
  const newDarts: Dart[] = []
  const internalLines = [...piece.internalLines]
  if (bridge.kind === 'dart') {
    const id = `${bridge.newId}.open`
    const legA = `${bridge.newId}.a`
    const legB = `${bridge.newId}.b`
    for (const x of [id, legA, legB]) if (segments[x]) fail(`Ya existe el segmento "${x}"`)
    segments[id] = { ...line(id, bFrom, bTo), role: 'dart' }
    segments[legA] = { ...line(legA, P, Qv), role: 'dart' }
    segments[legB] = { ...line(legB, P, QR), role: 'dart' }
    allowance[id] = piece.allowance[fixedAtQ] ?? 0
    internalLines.push(legA, legB)
    points[`${bridge.newId}.q1`] = Qv
    points[`${bridge.newId}.q2`] = QR
    newDarts.push({ id: bridge.newId, apex: t.dart.apex, legs: [legA, legB], type: 'edge' })
    bridgeRef = { segment: id, reversed: false }
  } else {
    const id = freshId((x) => !!segments[x], t.dart.id, GAP_SUFFIX)
    const role = piece.segments[fixedAtQ]?.role
    segments[id] = { ...line(id, bFrom, bTo), ...(role !== undefined && { role }) }
    allowance[id] = piece.allowance[fixedAtQ] ?? 0
    bridgeRef = { segment: id, reversed: false }
  }
  // Opening of the old dart: gone when fully closed, else one straight edge across what is left.
  let openingRef: OutlineRef[] = []
  if (!full) {
    const id = openingIds[0]
    const [oFrom, oTo] = turnR1 ? [t.Es, R(t.Ee)] : [R(t.Es), t.Ee]
    segments[id] = { ...line(id, oFrom, oTo), role: 'dart' }
    openingRef = [{ segment: id, reversed: false }]
  }
  const fixedRefs = (turnR1 ? r2 : r1).map(ref)
  const turnedRefs = turned.map(ref)
  let outline = turnR1
    ? [...fixedRefs, ...openingRef, ...turnedRefs, bridgeRef]
    : [...fixedRefs, bridgeRef, ...turnedRefs, ...openingRef]

  // Fully closed: the turned leg end lands on the fixed one; make the join exact.
  if (full) {
    if (turnR1) {
      // First turned segment starts (in traversal) at R(Ee): move it onto Es.
      const r = outline[fixedRefs.length]
      segments[r.segment] = moveSegmentEnd(segments[r.segment], r.reversed ? 'end' : 'start', t.Es)
    } else {
      // Last turned segment ends at R(Es): move it onto Ee.
      const last = outline[fixedRefs.length + 1 + turnedRefs.length - 1]
      segments[last.segment] = moveSegmentEnd(
        segments[last.segment],
        last.reversed ? 'start' : 'end',
        t.Ee,
      )
    }
  }
  outline = keepStart(outline, piece.outline[0].segment)

  let next: PatternPiece = {
    ...piece,
    segments,
    outline,
    internalLines,
    allowance,
    points,
    marks,
    fold,
    darts: piece.darts.flatMap((d) => (d.id === t.dart.id ? (full ? [] : [d]) : [d])),
  }
  if (newDarts.length) {
    const at = piece.darts.findIndex((d) => d.id === t.dart.id)
    const darts = [...next.darts]
    darts.splice(full ? at : at + 1, 0, ...newDarts)
    next = { ...next, darts }
  }
  if (full) {
    // Opening edges and both legs go; the join is trued.
    const gone = new Set([...openingIds, legS, legE])
    next = dropSegments(next, gone, [t.Es, t.Ee, P])
    const join = turnR1 ? t.Es : t.Ee
    const k = vertexIndexAt(next, join)
    if (k >= 0) next = trueJoin(next, k)
  } else {
    next = dropSegments(next, new Set(openingIds.slice(1)), [t.Es, t.Ee, R(t.Es), R(t.Ee)])
  }
  return { ...next, marks: reattachMarks(next) }
}

/**
 * closeDart: the dart closes about its apex; the cut runs along the dart's centre line prolonged
 * past the apex to the opposite edge, where the angle opens as a spread bridged by a straight edge
 * (`${dartId}~gap`, with the role and allowance of that edge).
 */
export function closeDart(piece: PatternPiece, dartId: unknown): PatternPiece {
  const t = edgeDart(piece, dartId)
  const P = t.apex
  const bis = normalize(add(normalize(sub(t.Es, P)), normalize(sub(t.Ee, P))))
  const far = add(P, scale(bis, -1e5))
  let Q: Vec | null = null
  for (const k of t.body) {
    for (const h of intersectSegments(line('ray', P, far), orientedOutline(t.piece, k)))
      if (!Q || distance(h.point, P) < distance(Q, P)) Q = h.point
  }
  if (!Q) return fail(`No se encontró el borde opuesto a la pinza "${t.dart.id}"`)
  return pivot(t, Q, 1, { kind: 'spread' })
}

/** transferDart: pivot method towards the point at `atRatio` of `toSegmentId`. */
export function transferDart(
  piece: PatternPiece,
  dartId: unknown,
  toSegmentId: unknown,
  atRatio: unknown,
  keepPercent: unknown = 0,
): PatternPiece {
  const target = segOf(piece, toSegmentId)
  if (!piece.outline.some((r) => r.segment === toSegmentId))
    fail(`"${String(toSegmentId)}" no es un borde de la pieza "${piece.id}"`)
  if (typeof atRatio !== 'number' || !Number.isFinite(atRatio) || atRatio < 0 || atRatio > 1)
    fail('Posición de destino no válida')
  const keep = keepPercent ?? 0
  if (typeof keep !== 'number' || !Number.isFinite(keep) || keep < 0 || keep >= 100)
    fail('Porcentaje a conservar no válido (0–99 %)')
  // Q from the edge as it is now: making the leg ends vertices may split that edge.
  const Q = segmentAt(target, (atRatio as number) * segmentLength(stripMeta(target))).point
  const t = edgeDart(piece, dartId)
  const newId = freshId((x) => t.piece.darts.some((d) => d.id === x), t.dart.id, TRANSFER_SUFFIX)
  return pivot(t, Q, 1 - (keep as number) / 100, { kind: 'dart', newId })
}

/**
 * dartToGather: the dart's legs go and the edge is trued across the opening (one smooth edge
 * tangent to its neighbours, keeping the dart's width as fullness); a gather mark "fruncir"
 * (mark id = operation id) spans that edge.
 */
export function dartToGather(piece: PatternPiece, dartId: unknown, markId: string): PatternPiece {
  const t = edgeDart(piece, dartId)
  const p = t.piece
  const n = p.outline.length
  if (p.marks.some((m) => m.id === markId)) fail(`Ya existe una marca "${markId}"`)
  const prevK = (t.s - 1 + n) % n
  const prev = orientedOutline(p, prevK)
  const next = orientedOutline(p, t.e)
  const id = p.outline[t.opening[0]].segment
  const prevSeg = p.segments[p.outline[prevK].segment]
  const nextSeg = p.segments[p.outline[t.e].segment]
  const bridge = curveWithTangents(id, t.Es, segmentTangent(prev, 1), t.Ee, segmentTangent(next, 0))
  const role = prevSeg.role !== 'dart' ? prevSeg.role : nextSeg.role
  const segments = {
    ...p.segments,
    [id]: withGeometry({ ...bridge, ...(role !== undefined && { role }) }, bridge),
  }
  const allowance = { ...p.allowance, [id]: p.allowance[prevSeg.id] ?? p.allowance[id] ?? 0 }
  const outline = keepStart(
    [...t.body.map((k) => p.outline[k]), { segment: id, reversed: false }],
    p.outline[0].segment,
  )
  const mark: PieceMark = {
    id: markId,
    kind: 'gather',
    at: segmentAt(segments[id], segmentLength(bridge) / 2).point,
    data: { segments: [id], text: 'fruncir', widthMm: distance(t.Es, t.Ee) },
  }
  let out: PatternPiece = {
    ...p,
    segments,
    allowance,
    outline,
    darts: p.darts.filter((d) => d.id !== t.dart.id),
    marks: [...p.marks, mark],
  }
  out = dropSegments(
    out,
    new Set([...t.opening.slice(1).map((k) => p.outline[k].segment), t.legS, t.legE]),
    [t.Es, t.Ee, t.apex],
  )
  return { ...out, marks: reattachMarks(out) }
}

/**
 * setDartApex: shorten the dart by `shortenMm` from its apex along its centre line; the legs end
 * at the new apex point `${dartId}~apex`.
 */
export function setDartApex(
  piece: PatternPiece,
  dartId: unknown,
  shortenMm: unknown,
): PatternPiece {
  const { dart, apex, ends } = dartFrame(piece, dartId)
  if (typeof shortenMm !== 'number' || !Number.isFinite(shortenMm) || shortenMm <= 0)
    fail('Longitud a acortar no válida')
  const minLeg = Math.min(distance(apex, ends[0]), distance(apex, ends[1]))
  if ((shortenMm as number) >= minLeg - 1)
    fail(`La pinza "${dart.id}" mide ${minLeg.toFixed(1)} mm: no se puede acortar tanto`)
  const u = normalize(add(normalize(sub(ends[0], apex)), normalize(sub(ends[1], apex))))
  const to = add(apex, scale(u, shortenMm as number))
  const name = dart.apex.endsWith(APEX_SUFFIX) ? dart.apex : `${dart.id}${APEX_SUFFIX}`
  const segments = { ...piece.segments }
  for (const leg of dart.legs) {
    const s = segments[leg]
    const plain = stripMeta(s)
    const end = distance(plain.p0, apex) <= distance(segEnd(plain), apex) ? 'start' : 'end'
    segments[leg] = moveSegmentEnd(s, end, to)
  }
  return {
    ...piece,
    segments,
    points: { ...piece.points, [name]: to },
    darts: piece.darts.map((d) => (d.id === dart.id ? { ...d, apex: name } : d)),
  }
}
