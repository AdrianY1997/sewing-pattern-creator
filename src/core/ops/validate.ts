/**
 * Structural validation of stored operations (a project loaded from disk is untrusted JSON). One
 * small validator per operation type checks the parameter types; value ranges that depend on the
 * pattern (a segment that does not exist, a notch past the edge) stay the business of `replay`,
 * which reports them as issues.
 */
import type { Operation, OperationType } from './types'

type Rec = Record<string, unknown>

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isVec = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && isNum((v as Rec).x) && isNum((v as Rec).y)
const opt = (v: unknown, check: (x: unknown) => boolean): boolean => v === undefined || check(v)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'

const isAnchor = (v: unknown): boolean => {
  if (typeof v !== 'object' || v === null) return false
  const a = v as Rec
  if ('pointName' in a) return isStr(a.pointName)
  return isStr(a.segmentId) && isNum(a.ratio) && isNum(a.offsetMm)
}

const isRatio = (v: unknown): boolean => isNum(v) && v >= 0 && v <= 1

/** A vertex: a point name or `{ segmentId, end }`. */
const isPointRef = (v: unknown): boolean =>
  isStr(v) ||
  (typeof v === 'object' &&
    v !== null &&
    isStr((v as Rec).segmentId) &&
    ((v as Rec).end === 'start' || (v as Rec).end === 'end'))

/** End of an internal line: point name, `{ segmentId, atRatio }` or `{ piecePointMm }`. */
const isLineAnchor = (v: unknown): boolean => {
  if (isStr(v)) return true
  if (typeof v !== 'object' || v === null) return false
  const a = v as Rec
  if ('piecePointMm' in a) return isVec(a.piecePointMm)
  return isStr(a.segmentId) && isRatio(a.atRatio)
}

const isHandles = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && isVec((v as Rec).c1) && isVec((v as Rec).c2)

const isAxis = (v: unknown): boolean =>
  v === 'vertical' ||
  v === 'horizontal' ||
  (typeof v === 'object' && v !== null && isStr((v as Rec).segmentId))

const VALIDATORS: { readonly [T in OperationType]: (o: Rec) => boolean } = {
  extractPiece: (o) => isStr(o.pieceId),
  extractAll: () => true,
  transformPiece: (o) =>
    isStr(o.pieceId) &&
    opt(o.translate, isVec) &&
    opt(o.rotateDeg, isNum) &&
    opt(o.pivot, (v) => typeof v === 'string'),
  mirrorPiece: (o) => isStr(o.pieceId) && isAxis(o.axis) && isBool(o.keepOriginal),
  cutOnFold: (o) => isStr(o.pieceId) && isStr(o.foldSegmentId),
  duplicatePiece: (o) => isStr(o.pieceId) && isStr(o.newId),
  deletePiece: (o) => isStr(o.pieceId),
  setPieceMeta: (o) =>
    isStr(o.pieceId) &&
    opt(o.name, (v) => typeof v === 'string') &&
    opt(o.cutCount, isNum) &&
    opt(o.fabric, (v) => typeof v === 'string') &&
    opt(o.onFold, isBool),
  autoLayout: (o) => opt(o.gapMm, isNum),
  setSeamAllowance: (o) =>
    isStr(o.pieceId) &&
    isNum(o.mm) &&
    (o.segmentIds === 'all' ||
      (Array.isArray(o.segmentIds) && o.segmentIds.length > 0 && o.segmentIds.every(isStr))),
  addNotch: (o) =>
    isStr(o.pieceId) &&
    isStr(o.segmentId) &&
    opt(o.atMm, isNum) &&
    opt(o.atRatio, isNum) &&
    (o.atMm !== undefined || o.atRatio !== undefined) &&
    opt(o.double, isBool),
  removeNotch: (o) => isStr(o.pieceId) && isStr(o.markId),
  setGrainline: (o) => isStr(o.pieceId) && opt(o.angleDeg, isNum) && opt(o.offset, isVec),
  addTextMark: (o) => isStr(o.pieceId) && typeof o.text === 'string' && isAnchor(o.at),
  addButton: (o) => isStr(o.pieceId) && isAnchor(o.at) && isNum(o.diameterMm),
  removeMark: (o) => isStr(o.pieceId) && isStr(o.markId),
  closeDart: (o) => isStr(o.pieceId) && isStr(o.dartId),
  transferDart: (o) =>
    isStr(o.pieceId) &&
    isStr(o.dartId) &&
    isStr(o.toSegmentId) &&
    isRatio(o.atRatio) &&
    opt(o.keepPercent, (v) => isNum(v) && v >= 0 && v < 100),
  dartToGather: (o) => isStr(o.pieceId) && isStr(o.dartId),
  setDartApex: (o) => isStr(o.pieceId) && isStr(o.dartId) && isNum(o.shortenMm) && o.shortenMm > 0,
  movePoint: (o) => isStr(o.pieceId) && isPointRef(o.point) && isVec(o.deltaMm),
  setCurveHandles: (o) =>
    isStr(o.pieceId) &&
    isStr(o.segmentId) &&
    opt(o.c1, isVec) &&
    opt(o.c2, isVec) &&
    (o.c1 !== undefined || o.c2 !== undefined),
  convertSegment: (o) =>
    isStr(o.pieceId) && isStr(o.segmentId) && (o.to === 'line' || o.to === 'curve'),
  splitSegment: (o) =>
    isStr(o.pieceId) && isStr(o.segmentId) && isNum(o.atRatio) && o.atRatio > 0 && o.atRatio < 1,
  removePoint: (o) => isStr(o.pieceId) && isPointRef(o.point),
  addInternalLine: (o) =>
    isStr(o.pieceId) &&
    isLineAnchor(o.from) &&
    isLineAnchor(o.to) &&
    (o.kind === 'line' || o.kind === 'curve') &&
    opt(o.handles, isHandles),
  splitPiece: (o) => isStr(o.pieceId) && isStr(o.lineId),
}

/** Why a stored value is not a well-formed operation, or null when it is. */
export function operationProblem(v: unknown): string | null {
  if (typeof v !== 'object' || v === null) return 'no es un objeto'
  const o = v as Rec
  if (!isStr(o.id)) return 'falta el id'
  if (typeof o.type !== 'string' || !Object.hasOwn(VALIDATORS, o.type))
    return `tipo desconocido "${String(o.type)}"`
  return VALIDATORS[o.type as OperationType](o) ? null : `parámetros no válidos para ${o.type}`
}

export const isOperation = (v: unknown): v is Operation => operationProblem(v) === null
