/**
 * replaceSegmentCurve (F5): a segment of a piece takes the shape traced along a ruler. The curve is
 * stored in the chord frame of the segment (see ChordBezier), so in another size it is laid between
 * that size's endpoints with the same shape (rotated and scaled with the chord).
 */
import { cubic, type CubicBezier } from '../bezier'
import { stripMeta, type DraftSegment, type OutlineRef, type PieceMark } from '../draft'
import { segEnd, segmentLength, type Segment } from '../path'
import { add, distance, perp, scale, sub, type Vec } from '../vec'
import {
  dartLegIds,
  grainSegmentIds,
  ON_EDGE_TOL,
  orientedOutline,
  reattachMarks,
  resolvePoint,
  segOf,
  VERTEX_TOL,
  vertexIndexAt,
  withGeometry,
} from './edit'
import { fail } from './errors'
import type {
  ChordBezier,
  PatternPiece,
  ReplaceSegmentChainOp,
  ReplaceSegmentCurveOp,
} from './types'

/** Most cubics a replacement may have. */
export const MAX_REPLACEMENT_BEZIERS = 64

const finite = (v: unknown): v is Vec =>
  typeof v === 'object' &&
  v !== null &&
  Number.isFinite((v as Vec).x) &&
  Number.isFinite((v as Vec).y)

/** Chord-frame point → local point between `p0` and `p3`. */
export const fromChordFrame = (p0: Vec, p3: Vec, q: Vec): Vec => {
  const ch = sub(p3, p0)
  return add(p0, add(scale(ch, q.x), scale(perp(ch), q.y)))
}

/** Local point → chord frame of the chord p0 → p3 (inverse of fromChordFrame). */
export const toChordFrame = (p0: Vec, p3: Vec, q: Vec): Vec => {
  const ch = sub(p3, p0)
  const l2 = ch.x * ch.x + ch.y * ch.y
  const d = sub(q, p0)
  return { x: (d.x * ch.x + d.y * ch.y) / l2, y: (ch.x * d.y - ch.y * d.x) / l2 }
}

/** Chord-frame description of a Bézier chain running from its first point to its last. */
export const chainToChordFrame = (chain: readonly CubicBezier[]): ChordBezier[] => {
  if (chain.length === 0) return []
  const p0 = chain[0].p0
  const p3 = chain[chain.length - 1].p3
  return chain.map((b) => ({
    c1: toChordFrame(p0, p3, b.p1),
    c2: toChordFrame(p0, p3, b.p2),
    to: toChordFrame(p0, p3, b.p3),
  }))
}

/** The cubics of a chord-frame chain laid between p0 and p3 (last end exactly p3). */
export const chordFrameToChain = (
  p0: Vec,
  p3: Vec,
  beziers: readonly ChordBezier[],
  ids: readonly string[],
): CubicBezier[] => {
  let start = p0
  return beziers.map((b, i) => {
    const end = i === beziers.length - 1 ? p3 : fromChordFrame(p0, p3, b.to)
    const c = cubic(ids[i], start, fromChordFrame(p0, p3, b.c1), fromChordFrame(p0, p3, b.c2), end)
    start = end
    return c
  })
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** Sub-segment and local length for a length along the chain. */
const locate = (lens: readonly number[], at: number): { i: number; len: number } => {
  let rest = Math.max(0, at)
  for (let i = 0; i < lens.length; i++) {
    if (rest <= lens[i] || i === lens.length - 1) return { i, len: Math.min(rest, lens[i]) }
    rest -= lens[i]
  }
  return { i: 0, len: 0 }
}

/** The replacement curve of an operation, checked (throws through `fail`). */
const checkedBeziers = (list: unknown): readonly ChordBezier[] => {
  if (!Array.isArray(list) || list.length === 0) return fail('Falta la curva')
  if (list.length > MAX_REPLACEMENT_BEZIERS) fail('La curva tiene demasiados tramos')
  for (const b of list as ChordBezier[])
    if (!finite(b?.c1) || !finite(b?.c2) || !finite(b?.to)) fail('Curva no válida')
  return list as ChordBezier[]
}

export function replaceSegmentCurve(piece: PatternPiece, op: ReplaceSegmentCurveOp): PatternPiece {
  const s = segOf(piece, op.segmentId)
  const id = s.id
  if (grainSegmentIds(piece).has(id)) fail('El hilo es una recta')
  if (dartLegIds(piece).has(id)) fail(`"${id}" es una pierna de pinza: no se puede reemplazar`)
  const list = checkedBeziers(op.beziers)
  const plain = stripMeta(s)
  const p0 = plain.p0
  const p3 = segEnd(plain)
  if (distance(p0, p3) < 1e-6) fail(`El segmento "${id}" no tiene cuerda: no se puede trazar`)

  if (list.length === 1) {
    const [c] = chordFrameToChain(p0, p3, list, [id])
    const next: PatternPiece = {
      ...piece,
      segments: { ...piece.segments, [id]: withGeometry(s, c) },
    }
    return { ...next, marks: reattachMarks(next) }
  }

  const n = list.length
  const ids = Array.from({ length: n }, (_, i) => `${id}~${i + 1}`)
  const names = Array.from({ length: n - 1 }, (_, i) => `${id}~p${i + 1}`)
  for (const x of ids) if (piece.segments[x]) fail(`Ya existe el segmento "${x}"`)
  for (const x of names) if (piece.points[x]) fail(`Ya existe el punto "${x}"`)
  const chain = chordFrameToChain(p0, p3, list, ids)
  const segments: Record<string, DraftSegment> = { ...piece.segments }
  delete segments[id]
  chain.forEach((c, i) => {
    const from = i === 0 ? s.from : names[i - 1]
    const to = i === n - 1 ? s.to : names[i]
    segments[c.id] = {
      ...c,
      ...(from !== undefined && { from }),
      ...(to !== undefined && { to }),
      ...(s.role !== undefined && { role: s.role }),
    } as DraftSegment
  })
  const points = { ...piece.points }
  names.forEach((name, i) => (points[name] = chain[i].p3))
  const outline = piece.outline.flatMap((r): OutlineRef[] =>
    r.segment !== id
      ? [r]
      : r.reversed
        ? [...ids].reverse().map((x) => ({ segment: x, reversed: true }))
        : ids.map((x) => ({ segment: x, reversed: false })),
  )
  const internalLines = piece.internalLines.flatMap((l) => (l === id ? ids : [l]))
  const allowance = { ...piece.allowance }
  if (id in allowance) {
    for (const x of ids) allowance[x] = allowance[id]
    delete allowance[id]
  }

  // Marks keep their relative place along the whole chain.
  const lens = chain.map((c) => segmentLength(c))
  const total = lens.reduce((a, b) => a + b, 0)
  const marks = piece.marks.map((m): PieceMark => {
    const d = m.data
    if (!d) return m
    let data: Record<string, unknown> = { ...d }
    if (d.segment === id && m.kind !== 'grainline') {
      if (typeof d.atRatio === 'number') {
        const at = locate(lens, clamp01(d.atRatio) * total)
        data = { ...data, segment: ids[at.i], atRatio: lens[at.i] > 0 ? at.len / lens[at.i] : 0 }
      } else if (typeof d.atMm === 'number') {
        // A typed distance stays a distance from the start of the edge.
        const at = locate(lens, Math.min(d.atMm, total))
        data = { ...data, segment: ids[at.i], atMm: at.len }
      } else data = { ...data, segment: ids[0] }
    }
    const anchor = d.anchor as { segmentId?: unknown; ratio?: unknown } | undefined
    if (anchor && anchor.segmentId === id && typeof anchor.ratio === 'number') {
      const at = locate(lens, clamp01(anchor.ratio) * total)
      data = {
        ...data,
        anchor: {
          ...anchor,
          segmentId: ids[at.i],
          ratio: lens[at.i] > 0 ? at.len / lens[at.i] : 0,
        },
      }
    }
    if (Array.isArray(d.segments) && d.segments.includes(id))
      data.segments = (d.segments as string[]).flatMap((x) => (x === id ? ids : [x]))
    return { ...m, data }
  })
  const next: PatternPiece = {
    ...piece,
    segments,
    outline,
    internalLines,
    allowance,
    points,
    marks,
  }
  return { ...next, marks: reattachMarks(next) }
}

// ---------- replaceSegmentChain ----------

/** Suffix of the edges (`~c1`…) and join points (`~cp1`…) made by replaceSegmentChain. */
export const CHAIN_SUFFIX = '~c'
export const CHAIN_POINT_SUFFIX = '~cp'

/** Outline indices from vertex `from` (inclusive) forward to vertex `to` (exclusive). */
const outlineRun = (n: number, from: number, to: number): number[] => {
  const out: number[] = []
  for (let k = from; k !== to; k = (k + 1) % n) out.push(k)
  return out
}

const reverseOriented = (s: Segment): Segment =>
  s.kind === 'line'
    ? { ...s, p0: s.p1, p1: s.p0 }
    : { ...s, p0: s.p3, p1: s.p2, p2: s.p1, p3: s.p0 }

/** One edge of an outline run, oriented from → to. */
export interface ChainLink {
  readonly id: string
  readonly seg: DraftSegment
  /** The stored segment runs from → to (else it is stored the other way round). */
  readonly sameDir: boolean
  readonly oriented: Segment
  readonly length: number
}

export interface OutlineChain {
  /** The edges in from → to order. */
  readonly links: readonly ChainLink[]
  /** Their outline indices, in traversal order. */
  readonly indices: readonly number[]
  /** The run follows the outline's traversal order from `from`. */
  readonly forward: boolean
}

/**
 * The run of outline edges from vertex `ia` to vertex `ib` (outline indices): the shorter way round
 * (by arc length) unless `direction` is given ('forward' = the outline's traversal order).
 */
export function outlineChainBetween(
  piece: PatternPiece,
  ia: number,
  ib: number,
  direction?: 'forward' | 'backward',
): OutlineChain {
  const n = piece.outline.length
  const fwd = outlineRun(n, ia, ib)
  const bwd = outlineRun(n, ib, ia)
  const len = (ks: readonly number[]) =>
    ks.reduce((a, k) => a + segmentLength(orientedOutline(piece, k)), 0)
  const forward = direction ? direction === 'forward' : len(fwd) <= len(bwd)
  const indices = forward ? fwd : bwd
  const ordered = forward ? indices : [...indices].reverse()
  const links = ordered.map((k): ChainLink => {
    const ref = piece.outline[k]
    const along = orientedOutline(piece, k)
    const oriented = forward ? along : reverseOriented(along)
    // The traversal runs along the stored segment unless the ref is reversed.
    const sameDir = forward ? !ref.reversed : ref.reversed
    return {
      id: ref.segment,
      seg: piece.segments[ref.segment],
      sameDir,
      oriented,
      length: segmentLength(oriented),
    }
  })
  return { links, indices, forward }
}

/**
 * replaceSegmentChain (F5b): the run of outline edges between two vertices becomes the traced
 * curve (see ReplaceSegmentChainOp).
 */
export function replaceSegmentChain(piece: PatternPiece, op: ReplaceSegmentChainOp): PatternPiece {
  const list = checkedBeziers(op.beziers)
  if (op.direction !== undefined && op.direction !== 'forward' && op.direction !== 'backward')
    fail('Sentido no válido')
  const ia = vertexIndexAt(piece, resolvePoint(piece, op.from), ON_EDGE_TOL)
  const ib = vertexIndexAt(piece, resolvePoint(piece, op.to), ON_EDGE_TOL)
  if (ia < 0 || ib < 0) fail('Los dos puntos deben ser vértices del contorno de la pieza')
  if (ia === ib) fail('Los dos puntos son el mismo vértice')
  const { links, indices, forward } = outlineChainBetween(piece, ia, ib, op.direction)
  const oldIds = links.map((l) => l.id)
  const old = new Set(oldIds)
  const pa = orientedOutline(piece, ia).p0
  const pb = orientedOutline(piece, ib).p0
  if (distance(pa, pb) < 1e-6) fail('Los dos puntos coinciden: no se puede trazar')
  // The inner vertices of the run disappear: none may hold a dart leg.
  const inner = links.slice(1).map((l) => l.oriented.p0)
  for (const leg of dartLegIds(piece)) {
    const s = stripMeta(segOf(piece, leg))
    for (const v of inner)
      if (distance(s.p0, v) <= ON_EDGE_TOL || distance(segEnd(s), v) <= ON_EDGE_TOL)
        fail('El tramo pasa por una pinza: traza a cada lado de ella')
  }

  const first = oldIds[0]
  const n = list.length
  const ids = Array.from({ length: n }, (_, i) => `${first}${CHAIN_SUFFIX}${i + 1}`)
  const names = Array.from({ length: n - 1 }, (_, i) => `${first}${CHAIN_POINT_SUFFIX}${i + 1}`)
  for (const x of ids) if (piece.segments[x] && !old.has(x)) fail(`Ya existe el segmento "${x}"`)
  for (const x of names) if (piece.points[x]) fail(`Ya existe el punto "${x}"`)
  const chain = chordFrameToChain(pa, pb, list, ids)

  // Role and seam allowance: the common value of the run, else the first edge's.
  const role = links[0].seg.role
  const allow = piece.allowance[first]
  // Point names of the run's ends.
  const end = links[links.length - 1]
  const fromName =
    typeof op.from === 'string' ? op.from : links[0].sameDir ? links[0].seg.from : links[0].seg.to
  const toName = typeof op.to === 'string' ? op.to : end.sameDir ? end.seg.to : end.seg.from

  const segments: Record<string, DraftSegment> = { ...piece.segments }
  for (const id of oldIds) delete segments[id]
  chain.forEach((c, i) => {
    const from = i === 0 ? fromName : names[i - 1]
    const to = i === n - 1 ? toName : names[i]
    segments[c.id] = {
      ...c,
      ...(from !== undefined && { from }),
      ...(to !== undefined && { to }),
      ...(role !== undefined && { role }),
    } as DraftSegment
  })

  // Outline: the run is replaced in place (moved to the start when it wraps round the end).
  const refs: OutlineRef[] = forward
    ? ids.map((x) => ({ segment: x, reversed: false }))
    : [...ids].reverse().map((x) => ({ segment: x, reversed: true }))
  const inRun = new Set(indices)
  const wraps = indices.some((k, i) => i > 0 && k !== indices[i - 1] + 1)
  const outline: OutlineRef[] = wraps ? [...refs] : []
  piece.outline.forEach((r, k) => {
    if (!inRun.has(k)) outline.push(r)
    else if (!wraps && k === indices[0]) outline.push(...refs)
  })

  const allowance = { ...piece.allowance }
  for (const id of oldIds) delete allowance[id]
  if (allow !== undefined) for (const x of ids) allowance[x] = allow

  // Points: the joins of the new curve; points at the vanished vertices go (dart apexes stay).
  const apexes = new Set(piece.darts.flatMap((d) => [d.apex, d.apex2 ?? '']))
  const ends = Object.values(segments).flatMap((s) => [s.p0, segEnd(stripMeta(s))])
  const points: Record<string, Vec> = {}
  for (const [name, at] of Object.entries(piece.points)) {
    const gone = inner.some((v) => distance(v, at) <= VERTEX_TOL)
    if (!gone || apexes.has(name) || ends.some((e) => distance(e, at) <= VERTEX_TOL))
      points[name] = at
  }
  names.forEach((name, i) => (points[name] = chain[i].p3))

  // Marks on the run keep their place by arc-length ratio along it.
  const oldLens = links.map((l) => l.length)
  const oldTotal = oldLens.reduce((a, b) => a + b, 0)
  const offsets = oldLens.map((_, i) => oldLens.slice(0, i).reduce((a, b) => a + b, 0))
  const newLens = chain.map((c) => segmentLength(c))
  const newTotal = newLens.reduce((a, b) => a + b, 0)
  /** `len` mm along old edge `id` (its stored direction) → a place on the new chain. */
  const remap = (id: string, len: number) => {
    const i = oldIds.indexOf(id)
    const along = offsets[i] + (links[i].sameDir ? len : oldLens[i] - len)
    const at = locate(newLens, oldTotal > 0 ? (along / oldTotal) * newTotal : 0)
    return { id: ids[at.i], len: at.len, ratio: newLens[at.i] > 0 ? at.len / newLens[at.i] : 0 }
  }
  const lengthOf = (id: string) => oldLens[oldIds.indexOf(id)]
  const marks = piece.marks.map((m): PieceMark => {
    const d = m.data
    if (!d) return m
    let data: Record<string, unknown> = { ...d }
    if (typeof d.segment === 'string' && old.has(d.segment) && m.kind !== 'grainline') {
      const L = lengthOf(d.segment)
      const len =
        typeof d.atRatio === 'number'
          ? clamp01(d.atRatio) * L
          : typeof d.atMm === 'number'
            ? Math.max(0, Math.min(L, d.atMm))
            : 0
      const at = remap(d.segment, len)
      data = { ...data, segment: at.id }
      if (typeof d.atRatio === 'number') data.atRatio = at.ratio
      else if (typeof d.atMm === 'number') data.atMm = at.len
    }
    const anchor = d.anchor as { segmentId?: unknown; ratio?: unknown } | undefined
    if (
      anchor &&
      typeof anchor.segmentId === 'string' &&
      old.has(anchor.segmentId) &&
      typeof anchor.ratio === 'number'
    ) {
      const at = remap(anchor.segmentId, clamp01(anchor.ratio) * lengthOf(anchor.segmentId))
      data = { ...data, anchor: { ...anchor, segmentId: at.id, ratio: at.ratio } }
    }
    if (Array.isArray(d.segments) && d.segments.some((x) => old.has(x as string)))
      data.segments = [
        ...new Set((d.segments as string[]).flatMap((x) => (old.has(x) ? ids : [x]))),
      ]
    return { ...m, data }
  })

  const next: PatternPiece = { ...piece, segments, outline, allowance, points, marks }
  return { ...next, marks: reattachMarks(next) }
}
