/**
 * Render data of the Costura layer (docs/UI.md §3): the cut line of each extracted piece and its
 * notches repeated at the allowance edge. Pure, world units (mm).
 */
import {
  add,
  applyAffine,
  notchOnCutLine,
  pathBBox,
  pieceWorldCutPath,
  scale,
  toSvgPathData,
  type BBox,
  type PatternPiece,
  type Vec,
} from '../../core'
import { NOTCH_GAP, NOTCH_LENGTH, type NotchRender } from './draftGeometry'

export interface SeamRender {
  readonly pieceId: string
  /** Cut line, SVG path data (mm, world). */
  readonly d: string
  readonly bbox: BBox
  /** Notches of the piece as short cuts from the cut line into the allowance. */
  readonly notches: readonly NotchRender[]
}

/** Cut line and cut-line notches of a piece, or null when it has no allowance. */
export function seamRender(piece: PatternPiece): SeamRender | null {
  const cut = pieceWorldCutPath(piece)
  if (!cut) return null
  const w = (p: Vec) => applyAffine(piece.transform, p)
  const notches: NotchRender[] = []
  for (const m of piece.marks) {
    if (m.kind !== 'notch') continue
    const seg = typeof m.data?.segment === 'string' ? m.data.segment : undefined
    const hit = notchOnCutLine(piece, m.at, seg)
    if (!hit) continue
    const count = Math.max(1, Math.floor(typeof m.data?.count === 'number' ? m.data.count : 1))
    const len = Math.min(NOTCH_LENGTH, hit.allowance)
    const along = { x: -hit.inward.y, y: hit.inward.x }
    const ticks = Array.from({ length: count }, (_, i) => {
      const base = add(hit.at, scale(along, (i - (count - 1) / 2) * NOTCH_GAP))
      return [w(base), w(add(base, scale(hit.inward, len)))] as const
    })
    notches.push({ id: `${piece.id}/${m.id}~cut`, pieceId: piece.id, ticks })
  }
  return { pieceId: piece.id, d: toSvgPathData(cut), bbox: pathBBox(cut), notches }
}
