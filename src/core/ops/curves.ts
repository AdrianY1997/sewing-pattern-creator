/**
 * replaceSegmentCurve (F5): a segment of a piece takes the shape traced along a ruler. The curve is
 * stored in the chord frame of the segment (see ChordBezier), so in another size it is laid between
 * that size's endpoints with the same shape (rotated and scaled with the chord).
 */
import { cubic, type CubicBezier } from '../bezier'
import { stripMeta, type DraftSegment, type OutlineRef, type PieceMark } from '../draft'
import { segEnd, segmentLength } from '../path'
import { add, distance, perp, scale, sub, type Vec } from '../vec'
import { dartLegIds, grainSegmentIds, reattachMarks, segOf, withGeometry } from './edit'
import { fail } from './errors'
import type { ChordBezier, PatternPiece, ReplaceSegmentCurveOp } from './types'

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

export function replaceSegmentCurve(piece: PatternPiece, op: ReplaceSegmentCurveOp): PatternPiece {
  const s = segOf(piece, op.segmentId)
  const id = s.id
  if (grainSegmentIds(piece).has(id)) fail('El hilo es una recta')
  if (dartLegIds(piece).has(id)) fail(`"${id}" es una pierna de pinza: no se puede reemplazar`)
  const list = op.beziers
  if (!Array.isArray(list) || list.length === 0) fail('Falta la curva')
  if (list.length > MAX_REPLACEMENT_BEZIERS) fail('La curva tiene demasiados tramos')
  for (const b of list)
    if (!finite(b?.c1) || !finite(b?.c2) || !finite(b?.to)) fail('Curva no válida')
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
