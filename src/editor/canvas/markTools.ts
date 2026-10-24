/**
 * Geometry of the canvas mark tools (Piezas view): where "Añadir piquete" would put a notch, and
 * the setGrainline operation produced by dragging the grainline handles. Pure, world units (mm).
 */
import {
  degToRad,
  normalize,
  projectOnSegment,
  radToDeg,
  rotate,
  segmentLength,
  segmentPointAtLength,
  splitPieceKey,
  stripMeta,
  sub,
  type Affine,
  type Draft,
  type OperationInput,
  type PatternPiece,
  type Vec,
} from '../../core'
import type { DraftRender } from './draftGeometry'

export interface NotchCandidate {
  readonly pieceId: string
  /** Local segment id (as the operation refers to it). */
  readonly segmentId: string
  /** Arc-length ratio along the segment (from its start). */
  readonly ratio: number
  /** World position and unit tangent of the notch. */
  readonly at: Vec
  readonly tangent: Vec
}

/**
 * Outline point nearest to `p` within `tolMm`, over the extracted pieces of the world draft
 * (`${pieceId}/${segmentId}` ids). Null when no outline is close enough.
 */
export function notchCandidate(
  world: Draft,
  render: DraftRender,
  p: Vec,
  tolMm: number,
  /** Restrict to the outline of this piece. */
  only?: string,
): NotchCandidate | null {
  let best: { key: string; pieceId: string; len: number; distance: number } | null = null
  for (const sg of render.segments) {
    if (sg.layer !== 'outline' || sg.internal || !sg.pieceId) continue
    if (only && sg.pieceId !== only) continue
    const s = world.segments[sg.id]
    if (!s) continue
    const hit = projectOnSegment(stripMeta(s), p)
    if (hit.distance <= tolMm && (!best || hit.distance < best.distance))
      best = { key: sg.id, pieceId: sg.pieceId, ...hit }
  }
  if (!best) return null
  const parts = splitPieceKey(best.key)
  if (!parts) return null
  const seg = stripMeta(world.segments[best.key])
  const len = segmentLength(seg)
  const at = segmentPointAtLength(seg, best.len)
  return {
    pieceId: best.pieceId,
    segmentId: parts.localId,
    ratio: len > 0 ? Math.max(0, Math.min(1, best.len / len)) : 0,
    at: at.point,
    tangent: at.tangent,
  }
}

/** World vector → local vector through the inverse of the linear part of `m`. */
export const toLocalVector = (m: Affine, v: Vec): Vec => {
  const det = m.a * m.d - m.b * m.c
  return { x: (m.d * v.x - m.c * v.y) / det, y: (-m.b * v.x + m.a * v.y) / det }
}

/** setGrainline that moves the grainline by the world displacement `delta`. */
export const grainMoveOp = (piece: PatternPiece, delta: Vec): OperationInput => {
  const d = toLocalVector(piece.transform, delta)
  return {
    type: 'setGrainline',
    pieceId: piece.id,
    offset: { x: piece.grain.offset.x + d.x, y: piece.grain.offset.y + d.y },
  }
}

/** Grainline segment id of a piece (its grainline mark), or null. */
export const grainSegmentId = (piece: PatternPiece): string | null => {
  const m = piece.marks.find((k) => k.kind === 'grainline' && typeof k.data?.segment === 'string')
  return m ? (m.data?.segment as string) : null
}

/**
 * setGrainline that points the grainline from `centre` towards `cursor` (world). `end` is +1 when
 * the dragged handle is the end of the grainline, −1 for its start. With `snap45` the angle to the
 * block's grainline snaps to multiples of 45° (straight grain, bias, cross grain).
 */
export const grainRotateOp = (
  piece: PatternPiece,
  centre: Vec,
  cursor: Vec,
  end: 1 | -1,
  snap45: boolean,
): OperationInput | null => {
  const id = grainSegmentId(piece)
  const seg = id ? piece.segments[id] : undefined
  if (!seg || seg.kind !== 'line') return null
  const w = sub(cursor, centre)
  if (Math.hypot(w.x, w.y) < 1e-6) return null
  const u = normalize(toLocalVector(piece.transform, { x: w.x * end, y: w.y * end }))
  // Direction of the block's grainline in the local frame.
  const base = normalize(rotate(sub(seg.p1, seg.p0), -degToRad(piece.grain.angleDeg)))
  let deg = radToDeg(Math.atan2(base.x * u.y - base.y * u.x, base.x * u.x + base.y * u.y))
  if (snap45) deg = Math.round(deg / 45) * 45
  if (Object.is(deg, -0)) deg = 0
  return { type: 'setGrainline', pieceId: piece.id, angleDeg: deg }
}
