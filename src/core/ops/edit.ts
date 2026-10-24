/**
 * Geometry editing of pattern pieces (F4c): vertices, curve handles, splitting and merging
 * segments. Pure functions on a PatternPiece in its LOCAL frame; an edit that cannot be applied
 * throws through `fail` (replay turns it into an issue).
 *
 * Seam allowances, notches and marks stay attached: allowance maps and mark references follow the
 * derived segment ids (`${id}~1` / `${id}~2` after a split, the merged id after a merge), and
 * notches / anchored marks are re-placed from their ratio on the edited segments (reattachMarks).
 */
import { bezierTAtLength, cubic, splitBezier, type CubicBezier } from '../bezier'
import { stripMeta, type DraftSegment, type OutlineRef, type PieceMark } from '../draft'
import {
  line,
  reverseSegment,
  segEnd,
  segmentLength,
  segmentPointAtLength,
  type Segment,
} from '../path'
import { add, distance, lerp, scale, sub, type Vec } from '../vec'
import { fail } from './errors'
import { anchorPoint, projectOnSegment, segmentAt } from './marks'
import type {
  ConvertSegmentOp,
  MarkAnchor,
  PatternPiece,
  PointRef,
  SetCurveHandlesOp,
} from './types'

export type MutablePiece = { -readonly [K in keyof PatternPiece]: PatternPiece[K] }

/** Distance (mm) under which two points are the same vertex. */
export const VERTEX_TOL = 1e-3
/** Distance (mm) under which a point counts as lying on an outline edge. */
export const ON_EDGE_TOL = 0.05

/** Suffixes of the halves of a split segment and of the point between them. */
export const SPLIT_SUFFIXES = ['~1', '~2'] as const
export const SPLIT_POINT_SUFFIX = '~p'
/** Suffix of a segment merged from two that were not the halves of one split. */
export const JOIN_SUFFIX = '~join'

export const segOf = (piece: PatternPiece, id: unknown): DraftSegment => {
  if (typeof id !== 'string' || !id) return fail('Falta el segmento')
  return piece.segments[id] ?? fail(`El segmento "${id}" no existe en la pieza "${piece.id}"`)
}

/** A stored segment with new geometry (and possibly a new id), keeping its from/to/role tags. */
export const withGeometry = (meta: DraftSegment, s: Segment): DraftSegment =>
  ({
    ...s,
    ...(meta.from !== undefined && { from: meta.from }),
    ...(meta.to !== undefined && { to: meta.to }),
    ...(meta.role !== undefined && { role: meta.role }),
  }) as DraftSegment

/** A plain segment as a cubic (a straight segment gets its handles at 1/3 and 2/3). */
export const asCubic = (s: Segment): CubicBezier =>
  s.kind === 'cubic' ? s : cubic(s.id, s.p0, lerp(s.p0, s.p1, 1 / 3), lerp(s.p0, s.p1, 2 / 3), s.p1)

/** Outline segment k in traversal direction (its id kept). */
export const orientedOutline = (piece: PatternPiece, k: number): Segment => {
  const r = piece.outline[k]
  const s = stripMeta(segOf(piece, r.segment))
  return r.reversed ? reverseSegment(s) : s
}

/** Store a segment given in traversal direction back into outline slot `ref`. */
export const storeOriented = (
  meta: DraftSegment,
  ref: OutlineRef,
  oriented: Segment,
): DraftSegment => withGeometry(meta, ref.reversed ? reverseSegment(oriented) : oriented)

/** Start of outline segment k in traversal order (the k-th vertex). */
export const outlineVertex = (piece: PatternPiece, k: number): Vec => orientedOutline(piece, k).p0

/** Index of the outline vertex nearest to `p` within `tol`, or -1. */
export const vertexIndexAt = (piece: PatternPiece, p: Vec, tol = VERTEX_TOL): number => {
  let best = -1
  let bestD = tol
  piece.outline.forEach((_, k) => {
    const d = distance(outlineVertex(piece, k), p)
    if (d <= bestD) {
      best = k
      bestD = d
    }
  })
  return best
}

/** Segment ids of the grainline(s) of the piece. */
export const grainSegmentIds = (piece: PatternPiece): Set<string> =>
  new Set(
    piece.marks
      .filter((m) => m.kind === 'grainline' && typeof m.data?.segment === 'string')
      .map((m) => m.data?.segment as string),
  )

/** Segment ids of every dart leg of the piece. */
export const dartLegIds = (piece: PatternPiece): Set<string> =>
  new Set(piece.darts.flatMap((d) => [...d.legs, ...(d.legs2 ?? [])]))

/** Local position of a vertex reference. */
export function resolvePoint(piece: PatternPiece, ref: PointRef): Vec {
  if (typeof ref === 'string')
    return piece.points[ref] ?? fail(`El punto "${ref}" no existe en la pieza "${piece.id}"`)
  if (typeof ref !== 'object' || ref === null) return fail('Falta el punto')
  const s = stripMeta(segOf(piece, ref.segmentId))
  if (ref.end !== 'start' && ref.end !== 'end') return fail('Extremo de segmento no válido')
  return ref.end === 'start' ? s.p0 : segEnd(s)
}

/** Moves one end of a segment to `to`; the control point next to it moves alike (same tangent). */
export const moveSegmentEnd = (s: DraftSegment, end: 'start' | 'end', to: Vec): DraftSegment => {
  if (s.kind === 'line') return end === 'start' ? { ...s, p0: to } : { ...s, p1: to }
  const from = end === 'start' ? s.p0 : s.p3
  const d = sub(to, from)
  return end === 'start' ? { ...s, p0: to, p1: add(s.p1, d) } : { ...s, p3: to, p2: add(s.p2, d) }
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** Point at `ratio` of a chain of segments' total arc length. */
const chainPoint = (segs: readonly Segment[], ratio: number): Vec | null => {
  const total = segs.reduce((a, s) => a + segmentLength(s), 0)
  let rest = ratio * total
  for (const s of segs) {
    const l = segmentLength(s)
    if (rest <= l) return segmentPointAtLength(s, rest).point
    rest -= l
  }
  return segs.length ? segEnd(segs[segs.length - 1]) : null
}

/**
 * Re-place the marks that are attached to segments after the geometry changed: notches from their
 * ratio (or mm) on their edge, text/button marks from their anchor, gather marks at the middle of
 * their edges. Other marks keep their position.
 */
export function reattachMarks(piece: PatternPiece): PieceMark[] {
  return piece.marks.map((m) => {
    const d = m.data
    if (!d) return m
    if (m.kind === 'notch' && typeof d.segment === 'string' && piece.segments[d.segment]) {
      const s = piece.segments[d.segment]
      const len = segmentLength(stripMeta(s))
      const at =
        typeof d.atRatio === 'number'
          ? clamp01(d.atRatio) * len
          : typeof d.atMm === 'number'
            ? Math.max(0, Math.min(len, d.atMm))
            : null
      return at === null ? m : { ...m, at: segmentAt(s, at).point }
    }
    if (typeof d.anchor === 'object' && d.anchor !== null) {
      try {
        return { ...m, at: anchorPoint(piece, d.anchor as MarkAnchor) }
      } catch {
        return m
      }
    }
    if (m.kind === 'gather' && Array.isArray(d.segments)) {
      const segs = (d.segments as unknown[])
        .filter((id): id is string => typeof id === 'string' && !!piece.segments[id])
        .map((id) => stripMeta(piece.segments[id]))
      const at = chainPoint(segs, 0.5)
      return at ? { ...m, at } : m
    }
    return m
  })
}

/** Marks attached to segment `id`, moved onto its halves after splitting it at `ratio`. */
function remapOnSplit(
  m: PieceMark,
  id: string,
  ratio: number,
  ids: readonly [string, string],
  len: number,
): PieceMark {
  const d = m.data
  if (!d) return m
  let data: Record<string, unknown> = { ...d }
  if (d.segment === id && m.kind !== 'grainline') {
    const r =
      typeof d.atRatio === 'number'
        ? d.atRatio
        : typeof d.atMm === 'number' && len > 0
          ? d.atMm / len
          : 0
    const first = r <= ratio
    data.segment = first ? ids[0] : ids[1]
    if (typeof d.atRatio === 'number')
      data.atRatio = clamp01(first ? r / ratio : (r - ratio) / (1 - ratio))
    else if (typeof d.atMm === 'number') data.atMm = first ? d.atMm : d.atMm - ratio * len
  }
  const anchor = d.anchor as { segmentId?: unknown; ratio?: unknown } | undefined
  if (anchor && anchor.segmentId === id && typeof anchor.ratio === 'number') {
    const r = anchor.ratio
    const first = r <= ratio
    data = {
      ...data,
      anchor: {
        ...anchor,
        segmentId: first ? ids[0] : ids[1],
        ratio: clamp01(first ? r / ratio : (r - ratio) / (1 - ratio)),
      },
    }
  }
  if (Array.isArray(d.segments) && d.segments.includes(id))
    data.segments = (d.segments as string[]).flatMap((s) => (s === id ? [...ids] : [s]))
  return { ...m, data }
}

export interface SplitResult {
  readonly piece: PatternPiece
  /** Ids of the two halves, in the segment's own direction. */
  readonly ids: readonly [string, string]
  readonly point: Vec
  readonly pointName: string
}

/**
 * Split segment `id` at `ratio` (0–1, exclusive) of its arc length into `${id}~1` and `${id}~2`
 * (same direction, role and allowance) with the point `${id}~p` between them.
 */
export function splitPieceSegment(piece: PatternPiece, id: string, ratio: number): SplitResult {
  const s = segOf(piece, id)
  if (grainSegmentIds(piece).has(id)) fail('El hilo no se puede dividir')
  if (dartLegIds(piece).has(id)) fail(`"${id}" es una pierna de pinza: no se puede dividir`)
  if (!Number.isFinite(ratio) || ratio <= 1e-6 || ratio >= 1 - 1e-6)
    fail('Posición no válida: el punto debe quedar dentro del segmento')
  const ids = [`${id}${SPLIT_SUFFIXES[0]}`, `${id}${SPLIT_SUFFIXES[1]}`] as const
  const pointName = `${id}${SPLIT_POINT_SUFFIX}`
  for (const x of ids) if (piece.segments[x]) fail(`Ya existe el segmento "${x}"`)
  const plain = stripMeta(s)
  const len = segmentLength(plain)
  let a: Segment
  let b: Segment
  if (plain.kind === 'line') {
    const p = lerp(plain.p0, plain.p1, ratio)
    a = line(ids[0], plain.p0, p)
    b = line(ids[1], p, plain.p1)
  } else [a, b] = splitBezier(plain, bezierTAtLength(plain, ratio * len), ids)
  const point = segEnd(a)
  const role = s.role !== undefined ? { role: s.role } : {}
  const segA = { ...a, ...(s.from !== undefined && { from: s.from }), to: pointName, ...role }
  const segB = { ...b, from: pointName, ...(s.to !== undefined && { to: s.to }), ...role }
  const segments: Record<string, DraftSegment> = { ...piece.segments }
  delete segments[id]
  segments[ids[0]] = segA as DraftSegment
  segments[ids[1]] = segB as DraftSegment
  const outline = piece.outline.flatMap((r): OutlineRef[] =>
    r.segment !== id
      ? [r]
      : r.reversed
        ? [
            { segment: ids[1], reversed: true },
            { segment: ids[0], reversed: true },
          ]
        : [
            { segment: ids[0], reversed: false },
            { segment: ids[1], reversed: false },
          ],
  )
  const internalLines = piece.internalLines.flatMap((l) => (l === id ? [...ids] : [l]))
  const allowance = { ...piece.allowance }
  if (id in allowance) {
    allowance[ids[0]] = allowance[id]
    allowance[ids[1]] = allowance[id]
    delete allowance[id]
  }
  const next: PatternPiece = {
    ...piece,
    segments,
    outline,
    internalLines,
    allowance,
    points: { ...piece.points, [pointName]: point },
    marks: piece.marks.map((m) => remapOnSplit(m, id, ratio, ids, len)),
  }
  return { piece: { ...next, marks: reattachMarks(next) }, ids, point, pointName }
}

/**
 * One cubic replacing two that meet at a vertex. When they are the halves of a de Casteljau split
 * the original curve comes back exactly (the split parameter is recovered from the handles at the
 * join); otherwise the end tangents are kept and the handles extended alike. Straight segments
 * count as cubics with handles at 1/3 and 2/3.
 */
export function mergeCurves(A: Segment, B: Segment, id = A.id): CubicBezier {
  const a = asCubic(A)
  const b = asCubic(B)
  const v = a.p3
  const hA = distance(a.p2, v)
  const hB = distance(b.p1, v)
  const lA = segmentLength(A)
  const lB = segmentLength(B)
  let t = hA + hB > 1e-9 ? hA / (hA + hB) : lA / Math.max(lA + lB, 1e-9)
  t = Math.max(0.02, Math.min(0.98, t))
  const chord = distance(a.p0, b.p3)
  const cap = (from: Vec, h: Vec) => {
    const l = Math.hypot(h.x, h.y)
    return l > 1.5 * chord && l > 0 ? add(from, scale(h, (1.5 * chord) / l)) : add(from, h)
  }
  const p1 = cap(a.p0, scale(sub(a.p1, a.p0), 1 / t))
  const p2 = cap(b.p3, scale(sub(b.p2, b.p3), 1 / (1 - t)))
  return cubic(id, a.p0, p1, p2, b.p3)
}

const baseOf = (id: string, suffix: string): string | null =>
  id.endsWith(suffix) && id.length > suffix.length ? id.slice(0, -suffix.length) : null

/**
 * "Eliminar punto": merge the two outline segments meeting at vertex `v` into one (a line when
 * both are straight, else a refitted curve). `${id}~1` + `${id}~2` give `${id}` back.
 */
export function removeVertex(piece: PatternPiece, v: Vec): PatternPiece {
  const n = piece.outline.length
  const k = vertexIndexAt(piece, v)
  if (k < 0) fail('El punto no es un vértice del contorno')
  if (n < 3) fail('La pieza necesita al menos dos bordes')
  for (const leg of dartLegIds(piece)) {
    const s = stripMeta(segOf(piece, leg))
    if (distance(s.p0, v) <= VERTEX_TOL || distance(segEnd(s), v) <= VERTEX_TOL)
      fail('El punto pertenece a una pinza: no se puede eliminar')
  }
  const kp = (k - 1 + n) % n
  const rA = piece.outline[kp]
  const rB = piece.outline[k]
  const A = orientedOutline(piece, kp)
  const B = orientedOutline(piece, k)
  const sA = piece.segments[rA.segment]
  const sB = piece.segments[rB.segment]
  const merged: Segment =
    A.kind === 'line' && B.kind === 'line' ? line('', A.p0, B.p1) : mergeCurves(A, B, '')

  const [s1, s2] = SPLIT_SUFFIXES
  const fwd = baseOf(rA.segment, s1)
  const bwd = baseOf(rA.segment, s2)
  let id: string
  let reversed: boolean
  if (fwd !== null && fwd === baseOf(rB.segment, s2) && !rA.reversed && !rB.reversed) {
    id = fwd
    reversed = false
  } else if (bwd !== null && bwd === baseOf(rB.segment, s1) && rA.reversed && rB.reversed) {
    id = bwd
    reversed = true
  } else {
    id = `${rA.segment}${JOIN_SUFFIX}`
    reversed = false
  }
  if (piece.segments[id] && id !== rA.segment && id !== rB.segment)
    fail(`Ya existe el segmento "${id}"`)
  const geometry = { ...(reversed ? reverseSegment(merged) : merged), id } as Segment
  // Names of the stored ends: traversal start/end names, swapped when stored reversed.
  const startName = rA.reversed ? sA.to : sA.from
  const endName = rB.reversed ? sB.from : sB.to
  const [from, to] = reversed ? [endName, startName] : [startName, endName]
  const role = sA.role ?? sB.role
  const seg = {
    ...geometry,
    ...(from !== undefined && { from }),
    ...(to !== undefined && { to }),
    ...(role !== undefined && { role }),
  } as DraftSegment

  const segments: Record<string, DraftSegment> = { ...piece.segments }
  delete segments[rA.segment]
  delete segments[rB.segment]
  segments[id] = seg
  const outline = piece.outline
    .map((r, i) => (i === kp ? { segment: id, reversed } : r))
    .filter((_, i) => i !== k)
  const allowance = { ...piece.allowance }
  const allow = piece.allowance[rA.segment] ?? piece.allowance[rB.segment]
  delete allowance[rA.segment]
  delete allowance[rB.segment]
  if (allow !== undefined) allowance[id] = allow

  const plain = stripMeta(seg)
  const len = segmentLength(plain)
  const old = new Set([rA.segment, rB.segment])
  const ratioOf = (p: Vec) => (len > 0 ? clamp01(projectOnSegment(plain, p).len / len) : 0)
  const marks = piece.marks.map((m): PieceMark => {
    const d = m.data
    if (!d) return m
    let data: Record<string, unknown> = { ...d }
    if (typeof d.segment === 'string' && old.has(d.segment)) {
      const r = ratioOf(m.at)
      data.segment = id
      if (typeof d.atRatio === 'number') data.atRatio = r
      else if (typeof d.atMm === 'number') data.atMm = r * len
    }
    const anchor = d.anchor as { segmentId?: unknown; ratio?: unknown } | undefined
    if (anchor && typeof anchor.segmentId === 'string' && old.has(anchor.segmentId)) {
      const s = stripMeta(piece.segments[anchor.segmentId])
      const r = typeof anchor.ratio === 'number' ? anchor.ratio : 0
      const on = segmentPointAtLength(s, r * segmentLength(s)).point
      data = { ...data, anchor: { ...anchor, segmentId: id, ratio: ratioOf(on) } }
    }
    if (Array.isArray(d.segments))
      data.segments = [...new Set((d.segments as string[]).map((s) => (old.has(s) ? id : s)))]
    return { ...m, data }
  })
  const apexes = new Set(piece.darts.flatMap((d) => [d.apex, d.apex2 ?? '']))
  const points = Object.fromEntries(
    Object.entries(piece.points).filter(
      ([name, at]) => apexes.has(name) || distance(at, v) > VERTEX_TOL,
    ),
  )
  const next: PatternPiece = { ...piece, segments, outline, allowance, marks, points }
  return { ...next, marks: reattachMarks(next) }
}

/**
 * Move every segment end, point and mark at `v` to `to`. Curves keep their tangent direction at
 * the vertex (the control point next to it moves alike). The grainline never moves.
 */
export function moveVertexTo(piece: PatternPiece, v: Vec, to: Vec): PatternPiece {
  const grain = grainSegmentIds(piece)
  const at = (q: Vec) => distance(q, v) <= VERTEX_TOL
  const segments: Record<string, DraftSegment> = {}
  for (const [id, s0] of Object.entries(piece.segments)) {
    let s = s0
    if (!grain.has(id)) {
      if (at(s.p0)) s = moveSegmentEnd(s, 'start', to)
      if (at(segEnd(stripMeta(s0)))) s = moveSegmentEnd(s, 'end', to)
      if (s !== s0 && distance(s.p0, segEnd(stripMeta(s))) < VERTEX_TOL)
        fail(`El segmento "${id}" quedaría sin longitud`)
    }
    segments[id] = s
  }
  const points = Object.fromEntries(
    Object.entries(piece.points).map(([name, p]) => [name, at(p) ? to : p]),
  )
  const fold = piece.fold && {
    from: at(piece.fold.from) ? to : piece.fold.from,
    to: at(piece.fold.to) ? to : piece.fold.to,
  }
  const marks = piece.marks.map((m) =>
    m.kind !== 'grainline' && at(m.at) && typeof m.data?.segment !== 'string'
      ? { ...m, at: to }
      : m,
  )
  const next: PatternPiece = { ...piece, segments, points, fold, marks }
  return { ...next, marks: reattachMarks(next) }
}

export function setCurveHandles(piece: PatternPiece, op: SetCurveHandlesOp): PatternPiece {
  const s = segOf(piece, op.segmentId)
  if (grainSegmentIds(piece).has(op.segmentId)) fail('El hilo es una recta')
  const finite = (v: Vec | undefined) =>
    v === undefined || (Number.isFinite(v?.x) && Number.isFinite(v?.y))
  if (!finite(op.c1) || !finite(op.c2)) fail('Asas no válidas')
  if (op.c1 === undefined && op.c2 === undefined) fail('Faltan las asas de la curva')
  const c = asCubic(stripMeta(s))
  const p1 = op.c1 ? add(c.p0, op.c1) : c.p1
  const p2 = op.c2 ? add(c.p3, op.c2) : c.p2
  const next: PatternPiece = {
    ...piece,
    segments: { ...piece.segments, [s.id]: withGeometry(s, cubic(s.id, c.p0, p1, p2, c.p3)) },
  }
  return { ...next, marks: reattachMarks(next) }
}

export function convertSegment(piece: PatternPiece, op: ConvertSegmentOp): PatternPiece {
  const s = segOf(piece, op.segmentId)
  if (grainSegmentIds(piece).has(op.segmentId)) fail('El hilo es una recta')
  if (op.to !== 'line' && op.to !== 'curve') fail('Tipo de segmento no válido')
  const plain = stripMeta(s)
  const geometry: Segment = op.to === 'line' ? line(s.id, plain.p0, segEnd(plain)) : asCubic(plain)
  const next: PatternPiece = {
    ...piece,
    segments: { ...piece.segments, [s.id]: withGeometry(s, geometry) },
  }
  return { ...next, marks: reattachMarks(next) }
}

/** Free id `${base}${suffix}`, `${base}${suffix}2`… among `taken`. */
export const freshId = (taken: (id: string) => boolean, base: string, suffix: string): string => {
  let id = `${base}${suffix}`
  for (let n = 2; taken(id); n++) id = `${base}${suffix}${n}`
  return id
}
