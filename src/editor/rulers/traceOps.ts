/**
 * What "Trazar" applies (pure): the curve traced along a ruler between two clicked points becomes
 * - `replaceSegmentCurve` when the points are the two ends of a segment of an extracted piece
 *   (outline edge or internal line), the curve stored relative to the segment's ends;
 * - otherwise a curved internal line (`addInternalLine`, handles relative to its ends) of the piece
 *   holding both points, plus `replaceSegmentCurve` on that new line when one cubic cannot follow
 *   the ruler within 0.1 mm.
 */
import {
  applyAffine,
  chainToChordFrame,
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
