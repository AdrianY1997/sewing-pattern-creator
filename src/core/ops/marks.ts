/**
 * Seam allowance and mark geometry of pattern pieces (pure helpers shared by replay and the
 * editor). Everything works in the piece's LOCAL frame; map with `piece.transform` for the canvas.
 */
import { bezierLength, nearestOnBezier, type BBox } from '../bezier'
import { stripMeta, type DraftSegment } from '../draft'
import {
  flattenPath,
  mapPath,
  pathBBox,
  polygonSignedArea,
  segmentLength,
  segmentPointAtLength,
  unionBBox,
  type Path,
  type Segment,
} from '../path'
import { seamAllowancePath } from '../seam'
import { add, distance, perpendicularFoot, projectParam, scale, type Vec } from '../vec'
import { applyAffine } from './affine'
import { isCentreLineId, pieceLocalPath, pieceWorldBBox } from './pattern'
import { fail } from './errors'
import type { MarkAnchor, PatternPiece } from './types'

/**
 * True for edges cut on the fold: role 'fold', or a centre front/back edge of a piece labelled
 * "al doblez" (a half cut on the folded fabric). They never get seam allowance.
 */
export const isFoldEdge = (piece: PatternPiece, segmentId: string): boolean => {
  const role = piece.segments[segmentId]?.role
  if (role === 'fold') return true
  if (!piece.onFold) return false
  return role === 'centerFront' || role === 'centerBack' || (!role && isCentreLineId(segmentId))
}

/** Seam allowance of an outline edge (mm): 0 for fold edges. */
export const edgeAllowance = (piece: PatternPiece, segmentId: string): number =>
  isFoldEdge(piece, segmentId) ? 0 : Math.max(0, piece.allowance[segmentId] ?? 0)

/** Allowance of every outline edge, keyed by segment id. */
export const pieceAllowances = (piece: PatternPiece): Record<string, number> =>
  Object.fromEntries(piece.outline.map((r) => [r.segment, edgeAllowance(piece, r.segment)]))

/**
 * Cut line of the piece (local frame): the outline offset by each edge's allowance, mitred
 * corners, mirrored hem corners, no loops. Null when the piece has no allowance at all.
 */
export const pieceCutPath = (piece: PatternPiece): Path | null => {
  const hemEdges = piece.outline
    .map((r) => r.segment)
    .filter((id) => piece.segments[id]?.role === 'hem')
  try {
    return seamAllowancePath(pieceLocalPath(piece), pieceAllowances(piece), { hemEdges })
  } catch {
    return null
  }
}

export const pieceWorldCutPath = (piece: PatternPiece): Path | null => {
  const cut = pieceCutPath(piece)
  return cut && mapPath(cut, (p) => applyAffine(piece.transform, p))
}

/**
 * World bounding box used to place pieces: the cut line (seam allowance path) when the piece has
 * allowance, else the seam line. Pieces spaced by this box are never closer than the gap at the
 * cut lines.
 */
export const pieceLayoutBBox = (piece: PatternPiece): BBox => {
  const cut = pieceWorldCutPath(piece)
  return cut ? pathBBox(cut) : pieceWorldBBox(piece)
}

export const piecesLayoutBBox = (pieces: readonly PatternPiece[]): BBox | null =>
  pieces.length ? unionBBox(pieces.map(pieceLayoutBBox)) : null

/** +1 when the outline turns from +x towards +y (positive signed area), else −1. */
export const outlineWinding = (piece: PatternPiece): number =>
  polygonSignedArea(flattenPath(pieceLocalPath(piece), 0.5)) >= 0 ? 1 : -1

/** Outward unit normal of a traversal tangent `t` for an outline of winding `w` (as offsetPath). */
const outwardOf = (t: Vec, w: number): Vec => ({ x: w * t.y, y: -w * t.x })

/** Point and unit tangent (segment direction) at `len` mm of arc length from the segment start. */
export const segmentAt = (s: DraftSegment, len: number): { point: Vec; tangent: Vec } => {
  const r = segmentPointAtLength(stripMeta(s), len)
  return { point: r.point, tangent: r.tangent }
}

/**
 * Outward unit normal of the piece at arc length `len` of one of its outline segments (local frame),
 * or null for a segment that is not part of the outline.
 */
export const outlineNormalAt = (
  piece: PatternPiece,
  segmentId: string,
  len: number,
): Vec | null => {
  const ref = piece.outline.find((r) => r.segment === segmentId)
  const s = piece.segments[segmentId]
  if (!ref || !s) return null
  const { tangent } = segmentAt(s, len)
  const t = ref.reversed ? scale(tangent, -1) : tangent
  return outwardOf(t, outlineWinding(piece))
}

/** Arc length from the start of `s` to its point nearest to `p`, with that distance. */
export const projectOnSegment = (s: Segment, p: Vec): { len: number; distance: number } => {
  if (s.kind === 'cubic') {
    const n = nearestOnBezier(s, p)
    return { len: bezierLength(s, 0, n.t), distance: n.distance }
  }
  const l = distance(s.p0, s.p1)
  if (l < 1e-12) return { len: 0, distance: distance(p, s.p0) }
  const u = Math.max(0, Math.min(1, projectParam(p, s.p0, s.p1)))
  const foot = u <= 0 ? s.p0 : u >= 1 ? s.p1 : perpendicularFoot(p, s.p0, s.p1)
  return { len: u * l, distance: distance(p, foot) }
}

/** Outline edge of the piece nearest to `p` (local frame), with the arc length of the foot. */
export const nearestOutlineEdge = (
  piece: PatternPiece,
  p: Vec,
): { segmentId: string; len: number; distance: number } | null => {
  let best: { segmentId: string; len: number; distance: number } | null = null
  for (const r of piece.outline) {
    const s = piece.segments[r.segment]
    if (!s) continue
    const hit = projectOnSegment(stripMeta(s), p)
    if (!best || hit.distance < best.distance) best = { segmentId: r.segment, ...hit }
  }
  return best
}

/** Ratio (0–1) of the arc length `len` along the segment. */
export const lengthRatio = (s: DraftSegment, len: number): number => {
  const l = segmentLength(stripMeta(s))
  return l > 0 ? Math.max(0, Math.min(1, len / l)) : 0
}

/**
 * Where a notch of the seam line lands on the cut line: the notch point moved outward by the
 * allowance of its edge. Null when the edge has no allowance (the cut line is the seam line).
 */
export const notchOnCutLine = (
  piece: PatternPiece,
  at: Vec,
  segmentId?: string,
): { at: Vec; inward: Vec; allowance: number } | null => {
  const edge =
    segmentId && piece.outline.some((r) => r.segment === segmentId)
      ? { segmentId, ...projectOnSegment(stripMeta(piece.segments[segmentId]), at) }
      : nearestOutlineEdge(piece, at)
  if (!edge) return null
  const d = edgeAllowance(piece, edge.segmentId)
  if (d <= 0) return null
  const n = outlineNormalAt(piece, edge.segmentId, edge.len)
  if (!n) return null
  return { at: add(at, scale(n, d)), inward: scale(n, -1), allowance: d }
}

/** Position of a mark anchor in the piece's local frame. */
export const anchorPoint = (piece: PatternPiece, at: MarkAnchor): Vec => {
  if (typeof at !== 'object' || at === null) return fail('Falta la posición de la marca')
  if ('pointName' in at)
    return (
      piece.points[at.pointName] ??
      fail(`El punto "${at.pointName}" no existe en la pieza "${piece.id}"`)
    )
  const s =
    piece.segments[at.segmentId] ??
    fail(`El segmento "${String(at.segmentId)}" no existe en la pieza "${piece.id}"`)
  if (!Number.isFinite(at.ratio) || at.ratio < 0 || at.ratio > 1) fail('Posición no válida')
  if (!Number.isFinite(at.offsetMm)) fail('Separación no válida')
  const len = at.ratio * segmentLength(stripMeta(s))
  const { point, tangent } = segmentAt(s, len)
  // Positive offsets go into the piece (inward normal of an outline edge; left of internal lines).
  const out = outlineNormalAt(piece, at.segmentId, len)
  const inward = out ? scale(out, -1) : { x: -tangent.y, y: tangent.x }
  return add(point, scale(inward, at.offsetMm))
}
