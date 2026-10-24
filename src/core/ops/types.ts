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
import type { Dart, DraftSegment, OutlineRef, Draft, PieceMark } from '../draft'
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
  /** Darts of the piece (legs are internal lines, apexes are point names). */
  readonly darts: readonly Dart[]
  /** Named construction points lying on the piece (local coordinates). */
  readonly points: Readonly<Record<string, Vec>>
  /** Fold line left by cutOnFold (local coordinates), null when the piece was not unfolded. */
  readonly fold: { readonly from: Vec; readonly to: Vec } | null
  /**
   * Seam allowance (mm) per outline segment id. Fold edges are cut without allowance whatever
   * this says (see edgeAllowance).
   */
  readonly allowance: Readonly<Record<string, number>>
  /** Grainline set by setGrainline, relative to the block's grainline (see SetGrainlineOp). */
  readonly grain: GrainSetting
  /** Local → world (placement on the canvas / layout). */
  readonly transform: Affine
}

export interface Pattern {
  /** The combined construction, untouched by the operations. */
  readonly draft: Draft
  /** Extracted pieces, in creation order. */
  readonly pieces: readonly PatternPiece[]
}

export interface GrainSetting {
  /** Degrees from the block's grainline, clockwise on screen in the piece's local frame. */
  readonly angleDeg: number
  /** Translation of the grainline's midpoint (mm, local frame). */
  readonly offset: Vec
}

/**
 * Where a text or button mark sits: at `ratio` of the arc length of a segment of the piece, moved
 * `offsetMm` towards the inside of the piece (outline edges), or on a named point of the piece.
 */
export type MarkAnchor =
  | { readonly segmentId: string; readonly ratio: number; readonly offsetMm: number }
  | { readonly pointName: string }

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

/**
 * Seam allowance of some outline edges (or all of them) of a piece, in mm. Fold edges stay at 0.
 * Extracted pieces start with the defaults of ReplayOptions.allowance.
 */
export interface SetSeamAllowanceOp extends OpBase {
  readonly type: 'setSeamAllowance'
  readonly pieceId: string
  readonly segmentIds: readonly string[] | 'all'
  readonly mm: number
}

/**
 * Notch (piquete) on an outline edge, at `atMm` mm of arc length from the segment's start or at
 * `atRatio` (0–1) of its length; `atRatio` keeps its relative place in every size. The mark id is
 * the operation id.
 */
export interface AddNotchOp extends OpBase {
  readonly type: 'addNotch'
  readonly pieceId: string
  readonly segmentId: string
  readonly atMm?: number
  readonly atRatio?: number
  /** Double notch (back pieces). */
  readonly double?: boolean
}

export interface RemoveNotchOp extends OpBase {
  readonly type: 'removeNotch'
  readonly pieceId: string
  readonly markId: string
}

/**
 * Grainline of a piece: rotated `angleDeg` about its midpoint and moved by `offset` (local mm),
 * both relative to the block's grainline (absolute values: the last operation wins). Omitted
 * fields keep their current value.
 */
export interface SetGrainlineOp extends OpBase {
  readonly type: 'setGrainline'
  readonly pieceId: string
  readonly angleDeg?: number
  readonly offset?: Vec
}

/** Text mark on the piece (mark id = operation id). */
export interface AddTextMarkOp extends OpBase {
  readonly type: 'addTextMark'
  readonly pieceId: string
  readonly text: string
  readonly at: MarkAnchor
}

/** Button position: a circle of `diameterMm` (mark id = operation id). */
export interface AddButtonOp extends OpBase {
  readonly type: 'addButton'
  readonly pieceId: string
  readonly at: MarkAnchor
  readonly diameterMm: number
}

/** Remove any mark (notch, text, button…) except the grainline. */
export interface RemoveMarkOp extends OpBase {
  readonly type: 'removeMark'
  readonly pieceId: string
  readonly markId: string
}

// ---------- geometry editing (F4c) ----------

/**
 * A vertex of a piece: a point name, or one end of a segment (in the segment's own direction).
 * Every segment end at that position moves or merges together.
 */
export type PointRef = string | { readonly segmentId: string; readonly end: 'start' | 'end' }

/**
 * Closes an edge dart. In a flat piece the angle must open elsewhere, so this is a transfer to the
 * point at `atRatio` of `toSegmentId` (default: the hem, else the waist, never a fold or centre
 * line; the point most nearly on the dart's centre line prolonged past the apex), where it opens as a spread (flare) bridged by a straight
 * edge `${dartId}~gap`. The seam across the closed dart is trued. Internal darts cannot be closed.
 */
export interface CloseDartOp extends OpBase {
  readonly type: 'closeDart'
  readonly pieceId: string
  readonly dartId: string
  readonly toSegmentId?: string
  readonly atRatio?: number
}

/**
 * Pivot method: cut from the apex to the point at `atRatio` (arc length) of `toSegmentId`, close the
 * dart (wholly, or down to `keepPercent` % of its angle to split it) and the angle opens there as a
 * new dart `${dartId}~t` (`~t2`…) with legs `${newId}.a` / `${newId}.b` and opening `${newId}.open`.
 */
export interface TransferDartOp extends OpBase {
  readonly type: 'transferDart'
  readonly pieceId: string
  readonly dartId: string
  readonly toSegmentId: string
  readonly atRatio: number
  /** Share (0–99 %) of the dart angle that stays at the old place. Default 0. */
  readonly keepPercent?: number
}

/**
 * The dart becomes gathers: legs removed, the edge trued across the opening (the dart's width stays
 * in the edge as fullness) and a gather mark "fruncir" spans the original dart width.
 */
export interface DartToGatherOp extends OpBase {
  readonly type: 'dartToGather'
  readonly pieceId: string
  readonly dartId: string
}

/** Shortens the dart from its apex along its centre line (e.g. 20–30 mm from the bust point). */
export interface SetDartApexOp extends OpBase {
  readonly type: 'setDartApex'
  readonly pieceId: string
  readonly dartId: string
  readonly shortenMm: number
}

/**
 * Moves a vertex by `deltaMm` (local frame of the piece). Adjacent segments follow; a curve's
 * control point next to the vertex moves with it, so the tangent direction is kept.
 */
export interface MovePointOp extends OpBase {
  readonly type: 'movePoint'
  readonly pieceId: string
  readonly point: PointRef
  readonly deltaMm: Vec
}

/**
 * Control points of a curve: `c1` relative to its start, `c2` relative to its end (mm, local
 * frame, the segment's own direction). A straight segment becomes a curve.
 */
export interface SetCurveHandlesOp extends OpBase {
  readonly type: 'setCurveHandles'
  readonly pieceId: string
  readonly segmentId: string
  readonly c1?: Vec
  readonly c2?: Vec
}

export interface ConvertSegmentOp extends OpBase {
  readonly type: 'convertSegment'
  readonly pieceId: string
  readonly segmentId: string
  readonly to: 'line' | 'curve'
}

/** "Añadir punto": splits a segment at `atRatio` of its arc length into `${id}~1` and `${id}~2`. */
export interface SplitSegmentOp extends OpBase {
  readonly type: 'splitSegment'
  readonly pieceId: string
  readonly segmentId: string
  readonly atRatio: number
}

/**
 * "Eliminar punto": merges the two outline segments that meet at the vertex (a curve is refitted
 * when either was curved). `${id}~1` + `${id}~2` merge back into `${id}`, other pairs into
 * `${first}~join`.
 */
export interface RemovePointOp extends OpBase {
  readonly type: 'removePoint'
  readonly pieceId: string
  readonly point: PointRef
}

/** End of an internal line: a point name, a place on a segment, or a point of the piece (local mm). */
export type LineAnchor =
  string | { readonly segmentId: string; readonly atRatio: number } | { readonly piecePointMm: Vec }

/** Internal line (id = operation id, role 'seam'): a style line, a yoke or a princess line. */
export interface AddInternalLineOp extends OpBase {
  readonly type: 'addInternalLine'
  readonly pieceId: string
  readonly from: LineAnchor
  readonly to: LineAnchor
  readonly kind: 'line' | 'curve'
  /** Curves: control points relative to `from` (c1) and to `to` (c2), mm. */
  readonly handles?: { readonly c1: Vec; readonly c2: Vec }
}

/**
 * Cuts a piece along an internal line that runs from outline to outline: two pieces `${id}~a` and
 * `${id}~b` with the marks, darts, allowances and grainline of their side; the cut becomes an edge
 * of both (role 'seam', default seam allowance).
 */
export interface SplitPieceOp extends OpBase {
  readonly type: 'splitPiece'
  readonly pieceId: string
  readonly lineId: string
}

/**
 * One cubic of a replacement curve in the CHORD FRAME of the segment: a point (x, y) stands for
 * `start + x·chord + y·perp(chord)` where chord = end − start and perp turns it +90° (clockwise on
 * screen). Coordinates are fractions of the chord length, so the curve keeps its shape relative to
 * its endpoints in every size. `to` of the last cubic is ignored (it is the segment's end).
 */
export interface ChordBezier {
  readonly c1: Vec
  readonly c2: Vec
  readonly to: Vec
}

/**
 * Replaces the geometry of a segment (outline edge or internal line) by a chain of cubics between
 * the same endpoints (F5, "Trazar" with a ruler). One cubic keeps the segment id; N > 1 cubics
 * become `${id}~1`…`${id}~N` joined at the points `${id}~p1`…, with the same role and seam
 * allowance; notches, marks and anchors keep their relative place along the whole chain.
 */
export interface ReplaceSegmentCurveOp extends OpBase {
  readonly type: 'replaceSegmentCurve'
  readonly pieceId: string
  readonly segmentId: string
  readonly beziers: readonly ChordBezier[]
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
  | SetSeamAllowanceOp
  | AddNotchOp
  | RemoveNotchOp
  | SetGrainlineOp
  | AddTextMarkOp
  | AddButtonOp
  | RemoveMarkOp
  | CloseDartOp
  | TransferDartOp
  | DartToGatherOp
  | SetDartApexOp
  | MovePointOp
  | SetCurveHandlesOp
  | ConvertSegmentOp
  | SplitSegmentOp
  | RemovePointOp
  | AddInternalLineOp
  | SplitPieceOp
  | ReplaceSegmentCurveOp

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
  /**
   * The block drafts this piece as a half: when its outline has a centre front / centre back edge
   * it is extracted "al doblez" (onFold, cut once, no allowance on the fold edge).
   */
  readonly halfPiece?: boolean
}

/** Seam allowance given to the edges of a freshly extracted piece ("Opciones avanzadas"). */
export interface AllowanceDefaults {
  /** Every edge (mm). */
  readonly seamMm: number
  /** Edges with role 'hem' (mm). */
  readonly hemMm: number
}

/** 1 cm seam allowance, 2 cm hem (docs/UI.md, "Opciones avanzadas"). */
export const DEFAULT_ALLOWANCE: AllowanceDefaults = { seamMm: 10, hemMm: 20 }

/** Largest seam allowance an operation accepts (mm). */
export const MAX_ALLOWANCE_MM = 100

export interface ReplayOptions {
  readonly pieceDefaults?: (sourcePieceId: string) => PieceDefaults
  /** Default DEFAULT_ALLOWANCE. */
  readonly allowance?: AllowanceDefaults
}

/** Gap (mm) between pieces placed by extract/duplicate and autoLayout: room for seam allowance. */
export const DEFAULT_LAYOUT_GAP = 30
