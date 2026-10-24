/**
 * Piece actions shared by the canvas context menu, the right panel and the toolbar. Each action
 * appends operations to the log (one undo step) through the store.
 */
import { splitPieceKey, type MirrorAxis, type PatternPiece } from '../../core'
import { useEditorStore } from '../store/editorStore'
import { cachedPattern } from '../store/useDraft'

const store = () => useEditorStore.getState()

/** Pieces of the current replayed pattern. */
export const currentPatternPieces = (): readonly PatternPiece[] => {
  const s = store()
  return cachedPattern(s.blockId, s.size, s.blockOptions, s.operations).result.pattern.pieces
}

/** Local segment id of the selected segment when it belongs to `pieceId` (Piezas view). */
export const selectedEdgeOf = (pieceId: string): string | null => {
  const key = store().selectedSegmentId
  const parts = key ? splitPieceKey(key) : null
  return parts && parts.pieceId === pieceId ? parts.localId : null
}

/** True when the edge is a straight outline edge of the piece (a valid fold line). */
export const isFoldableEdge = (pieceId: string, edgeId: string | null): boolean => {
  if (!edgeId) return false
  const p = currentPatternPieces().find((q) => q.id === pieceId)
  return !!p && p.segments[edgeId]?.kind === 'line' && p.outline.some((r) => r.segment === edgeId)
}

/** Free id for a copy: `${id}-2`, `${id}-3`… */
const copyId = (id: string): string => {
  const taken = new Set(currentPatternPieces().map((p) => p.id))
  let n = 2
  while (taken.has(`${id}-${n}`)) n++
  return `${id}-${n}`
}

export const pieceActions = {
  separate(pieceId: string) {
    const s = store()
    s.applyOps({ type: 'extractPiece', pieceId })
    s.setViewMode('pieces')
    s.selectPiece(pieceId)
  },
  separateAll() {
    const s = store()
    s.applyOps({ type: 'extractAll' })
    s.setViewMode('pieces')
  },
  mirror(pieceId: string, axis: MirrorAxis) {
    // On an edge the mirror is a new symmetric piece; on an axis the piece flips in place.
    store().applyOps({
      type: 'mirrorPiece',
      pieceId,
      axis,
      keepOriginal: typeof axis === 'object',
    })
  },
  cutOnFold(pieceId: string, foldSegmentId: string) {
    store().applyOps({ type: 'cutOnFold', pieceId, foldSegmentId })
    store().selectPiece(pieceId)
  },
  duplicate(pieceId: string) {
    const newId = copyId(pieceId)
    store().applyOps({ type: 'duplicatePiece', pieceId, newId })
    store().selectPiece(newId)
  },
  remove(pieceId: string) {
    store().applyOps({ type: 'deletePiece', pieceId })
    store().selectPiece(null)
  },
  rotate(pieceId: string, rotateDeg: number) {
    store().applyOps({ type: 'transformPiece', pieceId, rotateDeg, pivot: 'center' })
  },
  autoLayout() {
    store().applyOps({ type: 'autoLayout', gapMm: 30 })
  },
  setMeta(
    pieceId: string,
    meta: { name?: string; cutCount?: number; fabric?: string; onFold?: boolean },
  ) {
    store().applyOps({ type: 'setPieceMeta', pieceId, ...meta })
  },
}
