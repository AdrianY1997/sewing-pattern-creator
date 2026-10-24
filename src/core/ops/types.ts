/**
 * Editing operations (SPEC §7) and the pattern they produce.
 *
 *   pattern = replay(draftBlock(block, size, options), operations)
 *
 * Every operation is plain JSON `{ id, type, ...params }` and refers to stable ids of the draft
 * (piece ids, segment ids, point names), never to coordinates of one size. The only numbers it
 * carries are user-entered amounts (a translation or a gap in mm, an angle in degrees), so the same
 * list replays on every size.
 */
import type { DraftSegment, OutlineRef, Draft, PieceMark } from '../draft'
import type { Vec } from '../vec'

/**
 * 2D affine transform in SVG `matrix(a b c d e f)` order:
 *   x' = a·x + c·y + e,   y' = b·x + d·y + f
 */
export interface Affine {
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
  readonly e: number
  readonly f: number
}

/** A piece separated from the combined construction ("pieza separada"). */
export interface PatternPiece {
  /** Unique among the pattern pieces; equals `sourcePieceId` for a plain extraction. */
  readonly id: string
  /** Piece of the draft the geometry was copied from. */
  readonly sourcePieceId: string
  readonly name: string
  /** "Cortar ×N". */
  readonly cutCount: number
  /** Material shown on the label, e.g. "Tela", "Forro". */
  readonly fabric: string
  /** Label flag "al doblez": the piece is a half to be cut on the fold of the fabric. */
  readonly onFold: boolean
  /**
   * Own copy of the geometry in LOCAL coordinates (the draft's frame at extraction time). Keys are
   * the draft's segment ids, so later operations keep resolving them.
   */
  readonly segments: Readonly<Record<string, DraftSegment>>
  readonly outline: readonly OutlineRef[]
  readonly internalLines: readonly string[]
  readonly marks: readonly PieceMark[]
  /** Named construction points lying on the piece (local coordinates). */
  readonly points: Readonly<Record<string, Vec>>
  /** Fold line left by cutOnFold (local coordinates), null when the piece was not unfolded. */
  readonly fold: { readonly from: Vec; readonly to: Vec } | null
  /** Local → world (placement on the canvas / layout). */
  readonly transform: Affine
}

export interface Pattern {
  /** The combined construction, untouched by the operations. */
  readonly draft: Draft
  /** Extracted pieces, in creation order. */
  readonly pieces: readonly PatternPiece[]
}

// ---------- operations ----------

interface OpBase {
  /** Unique id of the operation (issues refer to it). */
  readonly id: string
}

export interface ExtractPieceOp extends OpBase {
  readonly type: 'extractPiece'
  readonly pieceId: string
}

export interface ExtractAllOp extends OpBase {
  readonly type: 'extractAll'
}

export interface TransformPieceOp extends OpBase {
  readonly type: 'transformPiece'
  readonly pieceId: string
  /** Applied after the rotation, in mm (world axes). */
  readonly translate?: Vec
  /** Degrees, positive = clockwise on screen (y grows downward). */
  readonly rotateDeg?: number
  /** Default 'center'. A string is a point name of the piece. */
  readonly pivot?: 'center' | string
}

/** 'vertical' flips left ↔ right, 'horizontal' flips top ↔ bottom (axes through the bbox centre). */
export type MirrorAxis = { readonly segmentId: string } | 'vertical' | 'horizontal'

export interface MirrorPieceOp extends OpBase {
  readonly type: 'mirrorPiece'
  readonly pieceId: string
  readonly axis: MirrorAxis
  /** True: keep the piece and add a mirrored copy (id `${pieceId}~m`, `~m2`…). */
  readonly keepOriginal: boolean
}

export interface CutOnFoldOp extends OpBase {
  readonly type: 'cutOnFold'
  readonly pieceId: string
  /** A straight outline edge of the piece (centre back, centre front…). */
  readonly foldSegmentId: string
}

export interface DuplicatePieceOp extends OpBase {
  readonly type: 'duplicatePiece'
  readonly pieceId: string
  readonly newId: string
}

export interface DeletePieceOp extends OpBase {
  readonly type: 'deletePiece'
  readonly pieceId: string
}

export interface SetPieceMetaOp extends OpBase {
  readonly type: 'setPieceMeta'
  readonly pieceId: string
  readonly name?: string
  readonly cutCount?: number
  readonly fabric?: string
  readonly onFold?: boolean
}

export interface AutoLayoutOp extends OpBase {
  readonly type: 'autoLayout'
  /** Minimum gap between pieces (mm). Default DEFAULT_LAYOUT_GAP. */
  readonly gapMm?: number
}

export type Operation =
  | ExtractPieceOp
  | ExtractAllOp
  | TransformPieceOp
  | MirrorPieceOp
  | CutOnFoldOp
  | DuplicatePieceOp
  | DeletePieceOp
  | SetPieceMetaOp
  | AutoLayoutOp

export type OperationType = Operation['type']

/** Distributive Omit, so `OperationInput` stays a discriminated union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** An operation before it gets its id. */
export type OperationInput = DistributiveOmit<Operation, 'id'>

/** An operation that could not be applied (the rest of the list still replays). */
export interface ReplayIssue {
  readonly opId: string
  readonly message: string
}

export interface ReplayResult {
  readonly pattern: Pattern
  readonly issues: readonly ReplayIssue[]
}

/** Label defaults of a freshly extracted piece (e.g. the block's "cortar ×2" for a sleeve). */
export interface PieceDefaults {
  readonly cutCount?: number
  readonly fabric?: string
}

export interface ReplayOptions {
  readonly pieceDefaults?: (sourcePieceId: string) => PieceDefaults
}

/** Gap (mm) between pieces placed by extract/duplicate and autoLayout: room for seam allowance. */
export const DEFAULT_LAYOUT_GAP = 30
