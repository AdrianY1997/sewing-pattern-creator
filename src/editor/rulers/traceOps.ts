/**
 * What "Trazar" applies (pure): the curve traced along a ruler between two clicked points becomes
 * - `replaceSegmentCurve` when the points are the two ends of a segment of an extracted piece
 *   (outline edge or internal line), the curve stored relative to the segment's ends;
 * - `replaceSegmentChain` when they are two other outline vertices of one piece: the run of edges
 *   between them (the shorter way round) becomes the traced curve;
 * - otherwise a curved internal line (`addInternalLine`, handles relative to its ends) of the piece
 *   holding both points, plus `replaceSegmentCurve` on that new line when one cubic cannot follow
 *   the ruler within 0.1 mm.
 */
import {
  applyAffine,
  chainToChordFrame,
  errorMessage,
  outlineChainBetween,
  pathPointAtLength,
  positionOnPath,
  replaceSegmentChain,
  sampleSegments,
  segmentLength,
  vertexIndexAt,
  piecePath,
  worldSegment,
  type Draft,
  type Path,
  type PointRef,
  type ReplaceSegmentChainOp,
  type Segment,
  distance,
  flattenPath,
  pieceWorldPath,
  pointInPolygon,
  reverseBezier,
  segEnd,
  stripMeta,
  sub,
  dartLegIds,
  grainSegmentIds,
  invertAffine,
  mapSegment,
  distanceToPolyline,
  type CubicBezier,
  type Operation,
  type OperationInput,
  type PatternPiece,
  type RulerTrace,
  type Vec,
} from '../../core'
import { lineAnchorAt } from '../canvas/editTools'
import type { TracePoint } from './rulerStore'

/** Clicked points closer than this (mm) to a segment's end are that end. */
export const END_TOL_MM = 0.05

/** Max deviation (mm) of a single cubic before the internal line gets the full chain. */
export const SINGLE_CUBIC_TOL_MM = 0.1

export type TracePlan =
  | {
      readonly kind: 'replace'
      readonly pieceId: string
      readonly segmentId: string
      readonly ops: readonly (OperationInput | Operation)[]
    }
  | {
      readonly kind: 'chain'
      readonly pieceId: string
      readonly ops: readonly (OperationInput | Operation)[]
    }
  | {
      readonly kind: 'line'
      readonly pieceId: string
      readonly ops: readonly (OperationInput | Operation)[]
    }
  | { readonly kind: 'error'; readonly message: string }

const toLocalChain = (piece: PatternPiece, chain: readonly CubicBezier[]): CubicBezier[] => {
  const inv = invertAffine(piece.transform)
  return chain.map((b) => mapSegment(b, (q) => applyAffine(inv, q)) as CubicBezier)
}

const reverseChain = (chain: readonly CubicBezier[]): CubicBezier[] =>
  [...chain].reverse().map((b) => reverseBezier(b))

/** The segment of an extracted piece whose two ends are a and b (world), if any. */
export function segmentBetween(
  pieces: readonly PatternPiece[],
  a: Vec,
  b: Vec,
): { piece: PatternPiece; segmentId: string; reversed: boolean } | null {
  let best: { piece: PatternPiece; segmentId: string; reversed: boolean; outline: boolean } | null =
    null
  for (const piece of pieces) {
    const skip = new Set([...grainSegmentIds(piece), ...dartLegIds(piece)])
    const outline = new Set(piece.outline.map((r) => r.segment))
    for (const s of Object.values(piece.segments)) {
      if (skip.has(s.id)) continue
      const plain = stripMeta(s)
      const p0 = applyAffine(piece.transform, plain.p0)
      const p1 = applyAffine(piece.transform, segEnd(plain))
      const fwd = distance(p0, a) <= END_TOL_MM && distance(p1, b) <= END_TOL_MM
      const bwd = distance(p0, b) <= END_TOL_MM && distance(p1, a) <= END_TOL_MM
      if (!fwd && !bwd) continue
      const hit = { piece, segmentId: s.id, reversed: !fwd, outline: outline.has(s.id) }
      // Prefer outline edges over internal lines.
      if (!best || (hit.outline && !best.outline)) best = hit
    }
  }
  return best && { piece: best.piece, segmentId: best.segmentId, reversed: best.reversed }
}

/** A vertex reference that replays in every size: a point name at it, else an edge end. */
const vertexRef = (piece: PatternPiece, k: number): PointRef => {
  const at = orientedVertex(piece, k)
  const name = Object.keys(piece.points).find((n) => distance(piece.points[n], at) <= 1e-6)
  if (name) return name
  const r = piece.outline[k]
  return { segmentId: r.segment, end: r.reversed ? 'end' : 'start' }
}

const orientedVertex = (piece: PatternPiece, k: number): Vec => {
  const r = piece.outline[k]
  const s = stripMeta(piece.segments[r.segment])
  return r.reversed ? segEnd(s) : s.p0
}

/**
 * Two outline vertices (world points a, b) of one extracted piece that are not the ends of one
 * edge: the piece, their references and the way round (the shorter one) for replaceSegmentChain.
 */
export function chainBetween(
  pieces: readonly PatternPiece[],
  a: Vec,
  b: Vec,
): {
  piece: PatternPiece
  from: PointRef
  to: PointRef
  direction: 'forward' | 'backward'
} | null {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const piece = pieces[i]
    const inv = invertAffine(piece.transform)
    const ia = vertexIndexAt(piece, applyAffine(inv, a), END_TOL_MM)
    const ib = vertexIndexAt(piece, applyAffine(inv, b), END_TOL_MM)
    if (ia < 0 || ib < 0 || ia === ib) continue
    const run = outlineChainBetween(piece, ia, ib)
    return {
      piece,
      from: vertexRef(piece, ia),
      to: vertexRef(piece, ib),
      direction: run.forward ? 'forward' : 'backward',
    }
  }
  return null
}

/** Points every ≤ 1 mm along a closed path from arc length s0 to s1 (forward, wrapping). */
const subPath = (p: Path, s0: number, s1: number, total: number): Vec[] => {
  const len = (((s1 - s0) % total) + total) % total
  const n = Math.max(1, Math.ceil(len))
  return Array.from(
    { length: n + 1 },
    (_, i) => pathPointAtLength(p, (s0 + (len * i) / n) % total).point,
  )
}

/**
 * The existing curve between two world points, for "Ajuste automático": a segment with those ends
 * (outline edge or internal line), or the outline between them (the shorter way round) when both
 * lie on the outline of one piece (within 0.5 mm). Null when there is none.
 */
export function existingCurveBetween(
  outlines: readonly Path[],
  segments: readonly Segment[],
  a: Vec,
  b: Vec,
): Vec[] | null {
  for (const s of segments) {
    const p0 = s.p0
    const p1 = segEnd(s)
    if (distance(p0, a) <= END_TOL_MM && distance(p1, b) <= END_TOL_MM) return sampleSegments([s])
    if (distance(p0, b) <= END_TOL_MM && distance(p1, a) <= END_TOL_MM)
      return sampleSegments([s]).reverse()
  }
  for (const p of outlines) {
    const pa = positionOnPath(p, a)
    const pb = positionOnPath(p, b)
    if (pa.distance > 0.5 || pb.distance > 0.5) continue
    const total = p.segments.reduce((t, s) => t + segmentLength(s), 0)
    const forward = (((pb.s - pa.s) % total) + total) % total
    if (forward < 1 || total - forward < 1) continue
    return forward <= total - forward
      ? subPath(p, pa.s, pb.s, total)
      : subPath(p, pb.s, pa.s, total).reverse()
  }
  return null
}

/** Extracted piece holding both world points (inside or within 0.5 mm of its outline). */
export function pieceHolding(pieces: readonly PatternPiece[], a: Vec, b: Vec): PatternPiece | null {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const poly = flattenPath(pieceWorldPath(pieces[i]), 0.2)
    const holds = (p: Vec) => pointInPolygon(p, poly) || distanceToPolyline(p, poly, true) <= 0.5
    if (holds(a) && holds(b)) return pieces[i]
  }
  return null
}

/** Operations that apply a trace between the clicked points (see the module comment). */
export function planTrace(
  trace: RulerTrace,
  a: TracePoint,
  b: TracePoint,
  pieces: readonly PatternPiece[],
  newId: () => string,
): TracePlan {
  const seg = segmentBetween(pieces, a.at, b.at)
  if (seg) {
    const world = seg.reversed ? reverseChain(trace.beziers) : trace.beziers
    const local = toLocalChain(seg.piece, world)
    return {
      kind: 'replace',
      pieceId: seg.piece.id,
      segmentId: seg.segmentId,
      ops: [
        {
          type: 'replaceSegmentCurve',
          pieceId: seg.piece.id,
          segmentId: seg.segmentId,
          beziers: chainToChordFrame(local),
        },
      ],
    }
  }
  const chain = chainBetween(pieces, a.at, b.at)
  if (chain) {
    const op: Omit<ReplaceSegmentChainOp, 'id'> = {
      type: 'replaceSegmentChain',
      pieceId: chain.piece.id,
      from: chain.from,
      to: chain.to,
      direction: chain.direction,
      beziers: chainToChordFrame(toLocalChain(chain.piece, trace.beziers)),
    }
    try {
      replaceSegmentChain(chain.piece, { ...op, id: 'check' })
    } catch (e) {
      return { kind: 'error', message: errorMessage(e) }
    }
    return { kind: 'chain', pieceId: chain.piece.id, ops: [op] }
  }
  const piece = pieceHolding(pieces, a.at, b.at)
  if (!piece)
    return {
      kind: 'error',
      message: 'Los dos puntos deben estar en la misma pieza separada (vista Piezas)',
    }
  const [single] = toLocalChain(piece, [trace.single])
  const handles = { c1: sub(single.p1, single.p0), c2: sub(single.p2, single.p3) }
  const from = lineAnchorAt(piece, a.at, a.snap)
  const to = lineAnchorAt(piece, b.at, b.snap)
  if (trace.singleError <= SINGLE_CUBIC_TOL_MM || trace.beziers.length < 2)
    return {
      kind: 'line',
      pieceId: piece.id,
      ops: [{ type: 'addInternalLine', pieceId: piece.id, from, to, kind: 'curve', handles }],
    }
  const id = newId()
  return {
    kind: 'line',
    pieceId: piece.id,
    ops: [
      { id, type: 'addInternalLine', pieceId: piece.id, from, to, kind: 'curve', handles },
      {
        type: 'replaceSegmentCurve',
        pieceId: piece.id,
        segmentId: id,
        beziers: chainToChordFrame(toLocalChain(piece, trace.beziers)),
      },
    ],
  }
}

/** Where "Ajuste automático" looks for the existing curve: outlines and segments, world mm. */
export interface CurveSources {
  readonly outlines: readonly Path[]
  readonly segments: readonly Segment[]
}

/** Outlines and segments (grainlines and dart legs left out) of the extracted pieces. */
export const piecesCurveSources = (pieces: readonly PatternPiece[]): CurveSources => ({
  outlines: pieces.map((p) => pieceWorldPath(p)),
  segments: pieces.flatMap((p) => {
    const skip = new Set([...grainSegmentIds(p), ...dartLegIds(p)])
    return Object.values(p.segments)
      .filter((x) => !skip.has(x.id))
      .map((x) => stripMeta(worldSegment(p, x)))
  }),
})

/** Outlines and outline segments of the draft's pieces (Trazo view). */
export const draftCurveSources = (draft: Draft): CurveSources => ({
  outlines: draft.pieces.map((p) => piecePath(draft, p.id)),
  segments: draft.pieces.flatMap((p) => p.outline.map((r) => stripMeta(draft.segments[r.segment]))),
})
