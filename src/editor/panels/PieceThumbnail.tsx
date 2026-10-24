import { unionBBox } from '../../core'
import type { DraftRender } from '../canvas/draftGeometry'

export interface PieceThumbnailProps {
  readonly render: DraftRender
  /** Pieces to draw (all when omitted). */
  readonly pieceIds?: readonly string[]
  readonly size: number
  readonly filled?: boolean
}

/** Small read-only drawing of one or more pieces, fitted to a square. */
export function PieceThumbnail({ render, pieceIds, size, filled }: PieceThumbnailProps) {
  const pieces = render.pieces.filter((p) => !pieceIds || pieceIds.includes(p.id))
  if (pieces.length === 0) return null
  const bb = unionBBox(pieces.map((p) => p.bbox))
  const pad = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 0.06
  const viewBox = [
    bb.minX - pad,
    bb.minY - pad,
    bb.maxX - bb.minX + 2 * pad,
    bb.maxY - bb.minY + 2 * pad,
  ]
  return (
    <svg
      className={filled ? 'thumb thumb-filled' : 'thumb'}
      width={size}
      height={size}
      viewBox={viewBox.join(' ')}
      aria-hidden
    >
      {pieces.map((p) => (
        <path key={p.id} d={p.d} />
      ))}
    </svg>
  )
}
