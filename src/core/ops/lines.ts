/**
 * Internal lines and piece splitting (F4c): "Recta" / "Curva" draw internal lines; splitPiece cuts
 * a piece along one that runs from outline to outline (princess seams, yokes). Pure, LOCAL frame.
 */
import { cubic } from '../bezier'
import { stripMeta, type Dart, type DraftSegment, type OutlineRef, type PieceMark } from '../draft'
import { intersectSegments } from '../intersect'
import {
  distanceToPolyline,
  flattenPath,
  line,
  path,
  pointInPolygon,
  polygonSignedArea,
  segEnd,
  segmentLength,
  type Segment,
} from '../path'
import {
  add,
  degToRad,
  distance,
  dot,
  midpoint,
  normalize,
  rotate,
  scale,
  sub,
  type Vec,
} from '../vec'
import { applyAffine } from './affine'
import { ensureVertex } from './darts'
import {
  dartLegIds,
  grainSegmentIds,
  moveSegmentEnd,
  orientedOutline,
  reattachMarks,
  segOf,
  SPLIT_SUFFIXES,
  VERTEX_TOL,
  vertexIndexAt,
} from './edit'
import { fail } from './errors'
import { projectOnSegment, segmentAt } from './marks'
import { KEY_SEP } from './pattern'
import type { AddInternalLineOp, LineAnchor, PatternPiece } from './types'

/** Suffixes of the two pieces made by splitPiece. */
export const SPLIT_PIECE_SUFFIXES = ['~a', '~b'] as const

/** Ends of a line farther than this (mm) from the outline cannot split the piece. */
const SPLIT_REACH_MM = 1

const finiteVec = (v: unknown): v is Vec =>
  typeof v === 'object' &&
  v !== null &&
  Number.isFinite((v as Vec).x) &&
  Number.isFinite((v as Vec).y)

/** Local position (and point name, when it is one) of a line anchor. */
export function resolveLineAnchor(piece: PatternPiece, a: LineAnchor): { at: Vec; name?: string } {
  if (typeof a === 'string') {
    const at = piece.points[a] ?? fail(`El punto "${a}" no existe en la pieza "${piece.id}"`)
    return { at, name: a }
  }
  if (typeof a !== 'object' || a === null) return fail('Falta el extremo de la línea')
  if ('piecePointMm' in a) {
    if (!finiteVec(a.piecePointMm)) fail('Punto no válido')
    return { at: { x: a.piecePointMm.x, y: a.piecePointMm.y } }
  }
  const s = segOf(piece, a.segmentId)
  if (!Number.isFinite(a.atRatio) || a.atRatio < 0 || a.atRatio > 1) fail('Posición no válida')
  return { at: segmentAt(s, a.atRatio * segmentLength(stripMeta(s))).point }
}

/** addInternalLine: a straight or curved internal line, id = operation id, role 'seam'. */
export function addInternalLine(piece: PatternPiece, op: AddInternalLineOp): PatternPiece {
  const id = op.id
  if (!id || id.includes(KEY_SEP)) fail(`Id de línea no válido: "${id}"`)
  if (piece.segments[id]) fail(`Ya existe el segmento "${id}"`)
  const a = resolveLineAnchor(piece, op.from)
  const b = resolveLineAnchor(piece, op.to)
  if (distance(a.at, b.at) < 1) fail('La línea es demasiado corta')
  let s: Segment
  if (op.kind === 'line') s = line(id, a.at, b.at)
  else if (op.kind === 'curve') {
    const h = op.handles
    if (h !== undefined && (!finiteVec(h.c1) || !finiteVec(h.c2))) fail('Asas no válidas')
    const c1 = h?.c1 ?? scale(sub(b.at, a.at), 1 / 3)
    const c2 = h?.c2 ?? scale(sub(a.at, b.at), 1 / 3)
    s = cubic(id, a.at, add(a.at, c1), add(b.at, c2), b.at)
  } else return fail('Tipo de línea no válido')
  const seg = {
    ...s,
    ...(a.name !== undefined && { from: a.name }),
    ...(b.name !== undefined && { to: b.name }),
    role: 'seam',
  } as DraftSegment
  return {
    ...piece,
    segments: { ...piece.segments, [id]: seg },
    internalLines: [...piece.internalLines, id],
  }
}

/** Nearest point of the outline to `p`. */
const nearestOnOutline = (piece: PatternPiece, p: Vec): { at: Vec; distance: number } => {
  let best: { at: Vec; distance: number } | null = null
  for (const r of piece.outline) {
    const s = segOf(piece, r.segment)
    const hit = projectOnSegment(stripMeta(s), p)
    if (!best || hit.distance < best.distance)
      best = { at: segmentAt(s, hit.len).point, distance: hit.distance }
  }
  return best ?? fail('La pieza no tiene contorno')
}

const outlinePoly = (piece: PatternPiece, refs: readonly OutlineRef[]): Vec[] =>
  flattenPath(
    path(
      refs.map((_, k) => orientedOutline({ ...piece, outline: refs }, k)),
      true,
    ),
    0.5,
  )

export interface SplitPieceDefaults {
  /** Seam allowance of the new edges (mm). */
  readonly seamMm: number
  /** Gap (mm) the second piece moves away from the first. */
  readonly gapMm: number
}

/**
 * The internal line `lineId` as a chain of segments in order (a traced line made of several cubics,
 * `${id}~1`…`${id}~N`): `lineId` is one of the segments, or the base id of such a chain. The chain
 * grows through the internal lines that continue it end to end (exactly one at each join), until
 * its ends reach the outline.
 */
export function internalLineChain(piece: PatternPiece, lineId: unknown): OutlineRef[] {
  if (typeof lineId !== 'string' || !lineId) return fail('Falta la línea')
  const grain = grainSegmentIds(piece)
  const legs = dartLegIds(piece)
  const isLine = (x: string) => piece.internalLines.includes(x) && !!piece.segments[x]
  const start = isLine(lineId)
    ? lineId
    : isLine(`${lineId}${SPLIT_SUFFIXES[0]}`)
      ? `${lineId}${SPLIT_SUFFIXES[0]}`
      : piece.segments[lineId]
        ? fail(`"${lineId}" no es una línea interna de la pieza`)
        : fail(`El segmento "${lineId}" no existe en la pieza "${piece.id}"`)
  if (grain.has(start)) fail('El hilo no puede separar la pieza')
  if (legs.has(start)) fail('Una pierna de pinza no puede separar la pieza')
  const ends = (x: string) => {
    const g = stripMeta(piece.segments[x])
    return [g.p0, segEnd(g)] as const
  }
  const free = piece.internalLines.filter(
    (x) => !grain.has(x) && !legs.has(x) && !!piece.segments[x],
  )
  const onOutline = (q: Vec) => nearestOnOutline(piece, q).distance <= SPLIT_REACH_MM
  const chain: OutlineRef[] = [{ segment: start, reversed: false }]
  const used = new Set([start])
  /** The one unused line with an end at `q`, oriented away from it (null when none or several). */
  const next = (q: Vec): OutlineRef | null => {
    const hits = free.flatMap((x) => {
      if (used.has(x)) return []
      const [a, b] = ends(x)
      if (distance(a, q) <= VERTEX_TOL) return [{ segment: x, reversed: false }]
      if (distance(b, q) <= VERTEX_TOL) return [{ segment: x, reversed: true }]
      return []
    })
    return hits.length === 1 ? hits[0] : null
  }
  const head = () => {
    const r = chain[0]
    return ends(r.segment)[r.reversed ? 1 : 0]
  }
  const tail = () => {
    const r = chain[chain.length - 1]
    return ends(r.segment)[r.reversed ? 0 : 1]
  }
  for (let q = tail(); !onOutline(q); q = tail()) {
    const r = next(q)
    if (!r) break
    chain.push(r)
    used.add(r.segment)
  }
  for (let q = head(); !onOutline(q); q = head()) {
    const r = next(q)
    if (!r) break
    // Prepended: it runs towards q.
    chain.unshift({ segment: r.segment, reversed: !r.reversed })
    used.add(r.segment)
  }
  return chain
}

const reverseRefs = (refs: readonly OutlineRef[]): OutlineRef[] =>
  [...refs].reverse().map((r) => ({ segment: r.segment, reversed: !r.reversed }))

/**
 * splitPiece: cut `piece` along internal line `lineId` (outline to outline; one segment, or a
 * traced chain of them, see internalLineChain) into `${id}~a` (the outline from the line's start
 * forward to its end, closed by the line) and `${id}~b` (the rest). The line's ends may lie on an
 * outline edge or on a vertex. Marks, darts, points and internal lines go to the piece they lie in;
 * notches follow their edge; the piece without the grainline gets a copy of it at its centre. The
 * cut is an edge of both pieces (same segment ids, role 'seam', default allowance). `~b` moves
 * `gapMm` away from `~a`.
 */
export function splitPiece(
  piece: PatternPiece,
  lineId: unknown,
  d: SplitPieceDefaults,
): [PatternPiece, PatternPiece] {
  const cut = internalLineChain(piece, lineId)
  const id = typeof lineId === 'string' ? lineId : ''
  const cutIds = new Set(cut.map((r) => r.segment))
  // Snap both ends onto the outline and make them vertices.
  let p = piece
  const ends: Vec[] = []
  const first = cut[0]
  const last = cut[cut.length - 1]
  for (const [ref, atStart] of [
    [first, true],
    [last, false],
  ] as const) {
    // The stored end of the segment that is the chain's start (or end).
    const end: 'start' | 'end' = atStart === !ref.reversed ? 'start' : 'end'
    const g = stripMeta(p.segments[ref.segment])
    const at = end === 'start' ? g.p0 : segEnd(g)
    const hit = nearestOnOutline(p, at)
    if (hit.distance > SPLIT_REACH_MM)
      fail(`La línea "${id}" no llega al contorno (${hit.distance.toFixed(1)} mm)`)
    p = ensureVertex(p, hit.at, `El extremo de "${id}"`)
    const k = vertexIndexAt(p, hit.at, 0.05)
    const v = orientedOutline(p, k).p0
    p = {
      ...p,
      segments: { ...p.segments, [ref.segment]: moveSegmentEnd(p.segments[ref.segment], end, v) },
    }
    ends.push(v)
  }
  const i1 = vertexIndexAt(p, ends[0])
  const i2 = vertexIndexAt(p, ends[1])
  if (i1 < 0 || i2 < 0 || i1 === i2) fail(`La línea "${id}" no separa la pieza en dos`)
  const n = p.outline.length
  const runOf = (from: number, to: number) => {
    const out: OutlineRef[] = []
    for (let k = from; k !== to; k = (k + 1) % n) out.push(p.outline[k])
    return out
  }
  const outlines: [OutlineRef[], OutlineRef[]] = [
    [...runOf(i1, i2), ...reverseRefs(cut)],
    [...runOf(i2, i1), ...cut],
  ]
  const cutSegments: Record<string, DraftSegment> = Object.fromEntries(
    cut.map((r) => [r.segment, { ...p.segments[r.segment], role: 'seam' } as DraftSegment]),
  )
  const grainIds = grainSegmentIds(p)
  const grainMark = p.marks.find(
    (m) => m.kind === 'grainline' && grainIds.has(m.data?.segment as string),
  )
  const grainId = grainMark?.data?.segment as string | undefined
  const grainSeg = grainId ? p.segments[grainId] : undefined
  const grainMid = grainSeg ? midpoint(grainSeg.p0, segEnd(stripMeta(grainSeg))) : null
  const legs = dartLegIds(p)

  const make = (k: 0 | 1): PatternPiece => {
    const suffix = SPLIT_PIECE_SUFFIXES[k]
    const outline = outlines[k]
    const poly = outlinePoly(p, outline)
    const inside = (q: Vec) => pointInPolygon(q, poly) || distanceToPolyline(q, poly, true) <= 0.01
    const own = new Set(outline.map((r) => r.segment))
    const darts: Dart[] = p.darts.filter((dt) => {
      const apex = p.points[dt.apex]
      return apex !== undefined && inside(apex)
    })
    const dartLegs = new Set(darts.flatMap((dt) => [...dt.legs, ...(dt.legs2 ?? [])]))
    const internalLines = p.internalLines.filter((l) => {
      if (cutIds.has(l) || grainIds.has(l)) return false
      if (legs.has(l)) return dartLegs.has(l)
      const s = p.segments[l]
      return inside(segmentAt(s, segmentLength(stripMeta(s)) / 2).point)
    })
    const segments: Record<string, DraftSegment> = { ...cutSegments }
    for (const r of outline) if (!cutIds.has(r.segment)) segments[r.segment] = p.segments[r.segment]
    for (const l of internalLines) segments[l] = p.segments[l]
    const points = Object.fromEntries(Object.entries(p.points).filter(([, at]) => inside(at)))
    const marks: PieceMark[] = []
    for (const m of p.marks) {
      if (m.kind === 'grainline') continue
      const seg = m.data?.segment
      const anchorSeg = (m.data?.anchor as { segmentId?: unknown } | undefined)?.segmentId
      const segs = m.data?.segments
      const keep =
        typeof seg === 'string'
          ? own.has(seg) || !!segments[seg]
          : typeof anchorSeg === 'string'
            ? !!segments[anchorSeg]
            : Array.isArray(segs)
              ? segs.some((s) => typeof s === 'string' && !!segments[s])
              : inside(m.at)
      if (keep) marks.push(m)
    }
    let grain = p.grain
    if (grainMark && grainSeg && grainId && grainMid) {
      if (inside(grainMid)) {
        marks.unshift(grainMark)
        segments[grainId] = grainSeg
        internalLines.push(grainId)
      } else {
        // A copy of the grainline at the centre of this piece, as long as fits (≤ 60 % across).
        const gid = `${grainId}${suffix}`
        const g = stripMeta(grainSeg)
        const dir = normalize(sub(segEnd(g), g.p0))
        const proj = poly.map((q) => dot(q, dir))
        const across = Math.max(...proj) - Math.min(...proj)
        const len = Math.min(segmentLength(g), 0.6 * across)
        const c = polygonCentre(poly)
        const g0 = add(c, scale(dir, -len / 2))
        const g1 = add(c, scale(dir, len / 2))
        // Base (absolute reference of setGrainline): the copy turned back to the block's angle.
        const back = degToRad(-p.grain.angleDeg)
        const base = { p0: rotate(g0, back, c), p1: rotate(g1, back, c) }
        segments[gid] = { ...line(gid, g0, g1) }
        internalLines.push(gid)
        marks.unshift({
          ...grainMark,
          id: `${grainMark.id}${suffix}`,
          at: c,
          data: { ...grainMark.data, segment: gid, base },
        })
        grain = { angleDeg: p.grain.angleDeg, offset: { x: 0, y: 0 } }
      }
    }
    const allowance: Record<string, number> = {}
    for (const x of cutIds) allowance[x] = d.seamMm
    for (const r of outline)
      if (!cutIds.has(r.segment) && p.allowance[r.segment] !== undefined)
        allowance[r.segment] = p.allowance[r.segment]
    const centre = (r: OutlineRef) => {
      const role = segments[r.segment]?.role
      return role === 'centerFront' || role === 'centerBack'
    }
    let fold = p.fold
    if (fold) {
      const axis = line('fold', fold.from, fold.to)
      const hits = Object.values(cutSegments).flatMap((c) => intersectSegments(axis, stripMeta(c)))
      if (hits.length) {
        const x = hits[0].point
        fold = inside(midpoint(fold.from, x))
          ? { from: fold.from, to: x }
          : inside(midpoint(x, fold.to))
            ? { from: x, to: fold.to }
            : null
      } else fold = inside(midpoint(fold.from, fold.to)) ? fold : null
    }
    const next: PatternPiece = {
      ...p,
      id: `${p.id}${suffix}`,
      name: `${p.name} (${suffix.slice(1)})`,
      onFold: p.onFold && outline.some(centre),
      segments,
      outline,
      internalLines,
      marks,
      darts,
      points,
      allowance,
      fold,
      grain,
    }
    return { ...next, marks: reattachMarks(next) }
  }

  const a = make(0)
  let b = make(1)
  // Move ~b away from ~a so their seam allowances do not overlap.
  const ca = applyAffine(a.transform, polygonCentre(outlinePoly(a, a.outline)))
  const cb = applyAffine(b.transform, polygonCentre(outlinePoly(b, b.outline)))
  const away = normalize(sub(cb, ca))
  if (Math.hypot(away.x, away.y) > 0) {
    const t = scale(away, d.gapMm)
    b = { ...b, transform: { ...b.transform, e: b.transform.e + t.x, f: b.transform.f + t.y } }
  }
  return [a, b]
}

/** Area centroid of a polygon (vertex average when degenerate). */
export const polygonCentre = (pts: readonly Vec[]): Vec => {
  const a = polygonSignedArea(pts)
  if (Math.abs(a) < 1e-9) {
    const k = Math.max(pts.length, 1)
    return { x: pts.reduce((s, q) => s + q.x, 0) / k, y: pts.reduce((s, q) => s + q.y, 0) / k }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i]
    const r = pts[(i + 1) % pts.length]
    const f = q.x * r.y - r.x * q.y
    cx += (q.x + r.x) * f
    cy += (q.y + r.y) * f
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}
