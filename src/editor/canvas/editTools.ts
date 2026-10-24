/**
 * Geometry of the canvas edit tools (F4c, Piezas view): vertex picking, world ↔ local conversions
 * and the anchors of drawn lines and placed marks. Pure, world units (mm).
 */
import {
  distance,
  flattenPath,
  lengthRatio,
  nearestOutlineEdge,
  pieceWorldPath,
  pointInPolygon,
  projectOnSegment,
  segmentLength,
  splitPieceKey,
  stripMeta,
  type Affine,
  type LineAnchor,
  type MarkAnchor,
  type PatternPiece,
  type Vec,
} from '../../core'
import type { DraftRender, VertexRef } from './draftGeometry'
import { toLocalVector } from './markTools'
import type { SnapResult } from './snap'

/** World point → local point of a piece (inverse of its transform). */
export const toLocalPoint = (m: Affine, p: Vec): Vec =>
  toLocalVector(m, { x: p.x - m.e, y: p.y - m.f })

export interface VertexHit {
  readonly pieceId: string
  /** World position. */
  readonly at: Vec
  /** Local reference (segment id without the piece prefix). */
  readonly ref: VertexRef
}

/** Outline vertex nearest to `p` within `tolMm` (of one piece, or of any). */
export function vertexAt(
  render: DraftRender,
  p: Vec,
  tolMm: number,
  pieceId?: string | null,
): VertexHit | null {
  let best: VertexHit | null = null
  let bestD = tolMm
  for (const pc of render.pieces) {
    if (pieceId && pc.id !== pieceId) continue
    pc.vertices.forEach((v, i) => {
      const d = distance(v, p)
      const ref = pc.vertexRefs[i]
      const parts = ref ? splitPieceKey(ref.segmentId) : null
      if (d <= bestD && parts) {
        bestD = d
        best = { pieceId: pc.id, at: v, ref: { segmentId: parts.localId, end: ref.end } }
      }
    })
  }
  return best
}

/**
 * End of a drawn line on `piece` from a world point and its snap: a point name of the piece, a
 * place on one of its segments, or a local point.
 */
export function lineAnchorAt(piece: PatternPiece, world: Vec, hit: SnapResult | null): LineAnchor {
  const local = toLocalPoint(piece.transform, hit?.at ?? world)
  const name = hit?.kind === 'point' && hit.name ? splitPieceKey(hit.name) : null
  if (name && name.pieceId === piece.id && piece.points[name.localId]) return name.localId
  const seg = hit?.segmentId ? splitPieceKey(hit.segmentId) : null
  if (seg && seg.pieceId === piece.id && piece.segments[seg.localId]) {
    const s = piece.segments[seg.localId]
    const { len } = projectOnSegment(stripMeta(s), local)
    return { segmentId: seg.localId, atRatio: lengthRatio(s, len) }
  }
  // Close to the outline (no snap): on the nearest edge, so the line can split the piece.
  const edge = nearestOutlineEdge(piece, local)
  if (edge && edge.distance < 0.5) {
    const s = piece.segments[edge.segmentId]
    return { segmentId: edge.segmentId, atRatio: lengthRatio(s, edge.len) }
  }
  return { piecePointMm: local }
}

/** Anchor of a text/button mark placed at a world point inside the piece: off its nearest edge. */
export function markAnchorAt(piece: PatternPiece, world: Vec): MarkAnchor | null {
  const local = toLocalPoint(piece.transform, world)
  const edge = nearestOutlineEdge(piece, local)
  if (!edge) return null
  const s = piece.segments[edge.segmentId]
  const len = segmentLength(stripMeta(s))
  return {
    segmentId: edge.segmentId,
    ratio: len > 0 ? edge.len / len : 0,
    offsetMm: Math.round(edge.distance * 10) / 10,
  }
}

/** Extracted piece whose outline contains the world point `p` (topmost = last), or null. */
export function pieceAtPoint(pieces: readonly PatternPiece[], p: Vec): PatternPiece | null {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const pc = pieces[i]
    if (pointInPolygon(p, flattenPath(pieceWorldPath(pc), 1))) return pc
  }
  return null
}
