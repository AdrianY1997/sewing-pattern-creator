/** Geometry helpers for pattern pieces: world paths, bounding boxes, anchors, world drafts. */
import type { BBox } from '../bezier'
import { stripMeta, type Draft, type DraftSegment, type Piece, type PieceMark } from '../draft'
import { mapSegment, path, pathBBox, reverseSegment, segStart, unionBBox, type Path } from '../path'
import type { Vec } from '../vec'
import { applyAffine } from './affine'
import type { PatternPiece } from './types'

/** Separator of `${pieceId}/${segmentId}` keys in a world draft (piece ids never contain it). */
export const KEY_SEP = '/'

export const pieceKey = (pieceId: string, localId: string): string =>
  `${pieceId}${KEY_SEP}${localId}`

/** Split a world-draft key into piece id and local id (null when it has no piece prefix). */
export const splitPieceKey = (key: string): { pieceId: string; localId: string } | null => {
  const i = key.indexOf(KEY_SEP)
  return i <= 0 ? null : { pieceId: key.slice(0, i), localId: key.slice(i + 1) }
}

/** A segment of the piece mapped to world coordinates. */
export const worldSegment = (piece: PatternPiece, s: DraftSegment): DraftSegment => ({
  ...s,
  ...mapSegment(stripMeta(s), (p) => applyAffine(piece.transform, p)),
})

/** Closed outline of the piece in local coordinates. */
export const pieceLocalPath = (piece: PatternPiece): Path =>
  path(
    piece.outline.map((r) => {
      const s = stripMeta(piece.segments[r.segment])
      return r.reversed ? reverseSegment(s) : s
    }),
    true,
  )

/** Closed outline of the piece in world coordinates. */
export const pieceWorldPath = (piece: PatternPiece): Path => {
  const local = pieceLocalPath(piece)
  return path(
    local.segments.map((s) => mapSegment(s, (p) => applyAffine(piece.transform, p))),
    true,
  )
}

export const pieceWorldBBox = (piece: PatternPiece): BBox => pathBBox(pieceWorldPath(piece))

export const piecesWorldBBox = (pieces: readonly PatternPiece[]): BBox | null =>
  pieces.length ? unionBBox(pieces.map(pieceWorldBBox)) : null

export const bboxCentre = (b: BBox): Vec => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 })

/** Centre-line segments (centre back / centre front): ids like `back.cb`, `front.cfHip`. */
export const isCentreLineId = (segmentId: string): boolean =>
  /(^|\.)c[bf]([A-Z.]|$)/.test(segmentId)

/**
 * Grading anchor of a piece (world coordinates): the point where the sizes of a piece are aligned
 * in the nested-sizes view. In order of preference:
 * 1. the start of the fold line, for a piece unfolded with cutOnFold;
 * 2. the first point of the outline lying on the centre line (the start, in traversal order, of
 *    the first outline segment whose id is a centre back / centre front edge);
 * 3. the top-left corner of the piece's bounding box.
 * Since every size of a piece has the same outline ids, rules 1–2 pick the same construction point
 * in every size (e.g. the back neck point at the top of the centre back).
 */
export const gradingAnchor = (piece: PatternPiece): Vec => {
  if (piece.fold) return applyAffine(piece.transform, piece.fold.from)
  const local = pieceLocalPath(piece)
  const k = piece.outline.findIndex((r) => isCentreLineId(r.segment))
  if (k >= 0) return applyAffine(piece.transform, segStart(local.segments[k]))
  const b = pieceWorldBBox(piece)
  return { x: b.minX, y: b.minY }
}

/**
 * The extracted pieces as one Draft in world coordinates (for rendering, snapping and measuring).
 * Segment ids, point names and mark ids are namespaced `${pieceId}/${localId}`; piece ids are the
 * pattern piece ids. The fold line of an unfolded piece becomes an internal line `${pieceId}/fold`.
 */
export function patternToWorldDraft(pieces: readonly PatternPiece[]): Draft {
  const points: Record<string, Vec> = {}
  const segments: Record<string, DraftSegment> = {}
  const out: Piece[] = []
  for (const pc of pieces) {
    const m = (p: Vec) => applyAffine(pc.transform, p)
    const k = (id: string) => pieceKey(pc.id, id)
    for (const [name, at] of Object.entries(pc.points)) points[k(name)] = m(at)
    for (const s of Object.values(pc.segments)) {
      const w = worldSegment(pc, s)
      segments[k(s.id)] = {
        ...w,
        id: k(s.id),
        ...(s.from !== undefined && { from: s.from }),
        ...(s.to !== undefined && { to: s.to }),
      }
    }
    const internal = pc.internalLines.map(k)
    if (pc.fold) {
      const id = k('fold')
      segments[id] = { kind: 'line', id, p0: m(pc.fold.from), p1: m(pc.fold.to) }
      internal.push(id)
    }
    const marks: PieceMark[] = pc.marks.map((mk) => ({
      ...mk,
      id: k(mk.id),
      at: m(mk.at),
      ...(mk.data && {
        data:
          typeof mk.data.segment === 'string'
            ? { ...mk.data, segment: k(mk.data.segment) }
            : mk.data,
      }),
    }))
    out.push({
      id: pc.id,
      name: pc.name,
      outline: pc.outline.map((r) => ({ segment: k(r.segment), reversed: r.reversed })),
      internalLines: internal,
      marks,
    })
  }
  return { version: 1, points, segments, pieces: out }
}
