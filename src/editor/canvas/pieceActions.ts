/**
 * Piece actions shared by the canvas context menu, the right panel and the toolbar. Each action
 * appends operations to the log (one undo step) through the store.
 */
import {
  splitPieceKey,
  type LineAnchor,
  type MarkAnchor,
  type MirrorAxis,
  type PatternPiece,
  type PieceMark,
  type PointRef,
  type Vec,
} from '../../core'
import { useEditorStore } from '../store/editorStore'
import { statePattern } from '../store/useDraft'

const store = () => useEditorStore.getState()

/** Pieces of the current replayed pattern. */
export const currentPatternPieces = (): readonly PatternPiece[] => {
  return statePattern(store()).result.pattern.pieces
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
  } /** Seam allowance (mm) of some edges or all of them. */,
  setAllowance(pieceId: string, segmentIds: readonly string[] | 'all', mm: number) {
    store().applyOps({ type: 'setSeamAllowance', pieceId, segmentIds, mm })
  },
  /** Notch on an outline edge: atRatio when placed by clicking, atMm when typed. */
  addNotch(
    pieceId: string,
    segmentId: string,
    at: { readonly atRatio: number } | { readonly atMm: number },
    double = false,
  ) {
    store().applyOps({ type: 'addNotch', pieceId, segmentId, ...at, ...(double && { double }) })
    store().selectPiece(pieceId)
  },
  addText(pieceId: string, text: string, at: MarkAnchor) {
    store().applyOps({ type: 'addTextMark', pieceId, text, at })
  },
  addButton(pieceId: string, at: MarkAnchor, diameterMm: number) {
    store().applyOps({ type: 'addButton', pieceId, at, diameterMm })
  },
  removeMark(pieceId: string, mark: PieceMark) {
    store().applyOps(
      mark.kind === 'notch'
        ? { type: 'removeNotch', pieceId, markId: mark.id }
        : { type: 'removeMark', pieceId, markId: mark.id },
    )
  },
  // ---------- darts (Pinzas panel) ----------
  closeDart(pieceId: string, dartId: string) {
    store().applyOps({ type: 'closeDart', pieceId, dartId })
  },
  /** "Trasladar": the next click on an edge of the piece picks the target. */
  startTransfer(pieceId: string, dartId: string) {
    store().setDartTransfer({ pieceId, dartId })
  },
  transferDart(pieceId: string, dartId: string, toSegmentId: string, atRatio: number) {
    const s = store()
    s.setDartTransfer(null)
    s.applyOps({ type: 'transferDart', pieceId, dartId, toSegmentId, atRatio })
  },
  dartToGather(pieceId: string, dartId: string) {
    store().applyOps({ type: 'dartToGather', pieceId, dartId })
  },
  shortenDart(pieceId: string, dartId: string, shortenMm: number) {
    store().applyOps({ type: 'setDartApex', pieceId, dartId, shortenMm })
  },
  // ---------- points, curves and lines ----------
  addPoint(pieceId: string, segmentId: string, atRatio: number) {
    store().applyOps({ type: 'splitSegment', pieceId, segmentId, atRatio })
  },
  removePoint(pieceId: string, point: PointRef) {
    store().applyOps({ type: 'removePoint', pieceId, point })
  },
  convertSegment(pieceId: string, segmentId: string, to: 'line' | 'curve') {
    store().applyOps({ type: 'convertSegment', pieceId, segmentId, to })
  },
  addLine(
    pieceId: string,
    from: LineAnchor,
    to: LineAnchor,
    kind: 'line' | 'curve',
    handles?: { c1: Vec; c2: Vec },
  ) {
    store().applyOps({
      type: 'addInternalLine',
      pieceId,
      from,
      to,
      kind,
      ...(handles && { handles }),
    })
  },
  splitPiece(pieceId: string, lineId: string) {
    const s = store()
    s.applyOps({ type: 'splitPiece', pieceId, lineId })
    s.selectPiece(`${pieceId}~a`)
  },
  /** Back to the block's grainline. */
  resetGrainline(pieceId: string) {
    store().applyOps({ type: 'setGrainline', pieceId, angleDeg: 0, offset: { x: 0, y: 0 } })
  },
}
