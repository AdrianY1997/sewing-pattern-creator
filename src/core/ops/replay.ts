/**
 * Replay of the operation log over a parametric draft. Pure and total: an operation that cannot be
 * applied (missing piece, segment or point; invalid parameters) is skipped and reported as an
 * issue, and the remaining operations still run. `replay` never throws.
 */
import { stripMeta, type Draft, type DraftSegment, type OutlineRef, type PieceMark } from '../draft'
import { mapSegment, segEnd, segmentBBox, unionBBox } from '../path'
import { degToRad, distance, signedDistanceToLine, type Vec } from '../vec'
import {
  applyAffine,
  composeAffine,
  IDENTITY,
  reflectionAcross,
  rotationAbout,
  translation,
} from './affine'
import { KEY_SEP, bboxCentre, pieceWorldBBox, piecesWorldBBox } from './pattern'
import {
  DEFAULT_LAYOUT_GAP,
  type AutoLayoutOp,
  type CutOnFoldOp,
  type DuplicatePieceOp,
  type MirrorPieceOp,
  type Operation,
  type Pattern,
  type PatternPiece,
  type ReplayIssue,
  type ReplayOptions,
  type ReplayResult,
  type SetPieceMetaOp,
  type TransformPieceOp,
} from './types'

/** Raised by an operation that cannot be applied; becomes a ReplayIssue. */
class OpError extends Error {}

const fail = (message: string): never => {
  throw new OpError(message)
}

/** Suffix of the ids derived by mirroring (cutOnFold halves, mirrored copies). */
export const MIRROR_SUFFIX = '~m'

/** Max row width (mm) of the shelf layout, unless one piece is wider. */
export const LAYOUT_ROW_WIDTH = 1500

/** Distance (mm) under which a point counts as lying on a fold axis. */
const ON_AXIS_TOL = 0.01

interface Ctx {
  readonly draft: Draft
  readonly options: ReplayOptions
}

const findPiece = (pieces: readonly PatternPiece[], id: unknown): PatternPiece => {
  if (typeof id !== 'string' || !id) return fail('Falta la pieza')
  return pieces.find((p) => p.id === id) ?? fail(`La pieza "${id}" no está separada`)
}

const replacePiece = (pieces: readonly PatternPiece[], next: PatternPiece): PatternPiece[] =>
  pieces.map((p) => (p.id === next.id ? next : p))

const withTransform = (p: PatternPiece, outer: Pattern['pieces'][number]['transform']) => ({
  ...p,
  transform: composeAffine(outer, p.transform),
})

/** Translation that puts `piece` to the right of `others` (top-aligned), `gap` mm apart. */
const placeRightOf = (piece: PatternPiece, others: readonly PatternPiece[], gap: number) => {
  const all = piecesWorldBBox(others)
  if (!all) return piece
  const b = pieceWorldBBox(piece)
  return withTransform(piece, translation({ x: all.maxX + gap - b.minX, y: all.minY - b.minY }))
}

// ---------- extract ----------

/** Copy a draft piece's geometry into an independent pattern piece (identity transform). */
function extractFromDraft(ctx: Ctx, pieceId: string): PatternPiece {
  const src = ctx.draft.pieces.find((p) => p.id === pieceId)
  if (!src) return fail(`La pieza "${pieceId}" no existe en el trazo`)
  if (pieceId.includes(KEY_SEP)) return fail(`Id de pieza no válido: "${pieceId}"`)
  const ids = [...src.outline.map((r) => r.segment), ...src.internalLines]
  const segments: Record<string, DraftSegment> = {}
  for (const id of ids) {
    const s = ctx.draft.segments[id] ?? fail(`Falta el segmento "${id}" de la pieza "${pieceId}"`)
    segments[id] = s
  }
  // Points on the piece: the ones its segments name, plus any construction point at one of its
  // segment ends (darts, notches…).
  const ends = Object.values(segments).flatMap((s) => [s.p0, segEnd(stripMeta(s))])
  const named = new Set(Object.values(segments).flatMap((s) => [s.from, s.to]))
  const points: Record<string, Vec> = {}
  for (const [name, at] of Object.entries(ctx.draft.points))
    if (named.has(name) || ends.some((e) => distance(e, at) < 1e-3)) points[name] = at
  const defaults = ctx.options.pieceDefaults?.(pieceId) ?? {}
  return structuredClone({
    id: pieceId,
    sourcePieceId: pieceId,
    name: src.name,
    cutCount: defaults.cutCount ?? 1,
    fabric: defaults.fabric ?? 'Tela',
    onFold: false,
    segments,
    outline: src.outline,
    internalLines: src.internalLines,
    marks: src.marks,
    points,
    fold: null,
    transform: IDENTITY,
  })
}

const extract = (ctx: Ctx, pieces: readonly PatternPiece[], pieceId: unknown): PatternPiece[] => {
  if (typeof pieceId !== 'string' || !pieceId) return fail('Falta la pieza')
  if (pieces.some((p) => p.id === pieceId)) return [...pieces] // idempotent
  const piece = placeRightOf(extractFromDraft(ctx, pieceId), pieces, DEFAULT_LAYOUT_GAP)
  return [...pieces, piece]
}

// ---------- transform / mirror ----------

/** World position of a pivot: 'center' (bbox centre) or a point name of the piece. */
const pivotOf = (piece: PatternPiece, pivot: string | undefined): Vec => {
  if (pivot === undefined || pivot === 'center') return bboxCentre(pieceWorldBBox(piece))
  const at = piece.points[pivot] ?? fail(`El punto "${pivot}" no existe en la pieza "${piece.id}"`)
  return applyAffine(piece.transform, at)
}

const finiteVec = (v: unknown): v is Vec =>
  typeof v === 'object' &&
  v !== null &&
  Number.isFinite((v as Vec).x) &&
  Number.isFinite((v as Vec).y)

function transformPiece(pieces: readonly PatternPiece[], op: TransformPieceOp): PatternPiece[] {
  let piece = findPiece(pieces, op.pieceId)
  if (op.rotateDeg !== undefined) {
    if (!Number.isFinite(op.rotateDeg)) fail('Ángulo no válido')
    const theta = degToRad(op.rotateDeg)
    piece = withTransform(piece, rotationAbout(theta, pivotOf(piece, op.pivot)))
  }
  if (op.translate !== undefined) {
    if (!finiteVec(op.translate)) fail('Desplazamiento no válido')
    piece = withTransform(piece, translation(op.translate))
  }
  return replacePiece(pieces, piece)
}

/** Next free id `${base}~m`, `${base}~m2`, … (deterministic for a given piece list). */
const derivedId = (pieces: readonly PatternPiece[], base: string): string => {
  const taken = new Set(pieces.map((p) => p.id))
  let id = `${base}${MIRROR_SUFFIX}`
  for (let n = 2; taken.has(id); n++) id = `${base}${MIRROR_SUFFIX}${n}`
  return id
}

function mirrorPiece(pieces: readonly PatternPiece[], op: MirrorPieceOp): PatternPiece[] {
  const piece = findPiece(pieces, op.pieceId)
  let p: Vec
  let q: Vec
  if (op.axis === 'vertical' || op.axis === 'horizontal') {
    const c = bboxCentre(pieceWorldBBox(piece))
    p = c
    q = op.axis === 'vertical' ? { x: c.x, y: c.y + 1 } : { x: c.x + 1, y: c.y }
  } else if (typeof op.axis === 'object' && op.axis !== null) {
    const sid = op.axis.segmentId
    const s =
      piece.segments[sid] ?? fail(`El segmento "${sid}" no existe en la pieza "${piece.id}"`)
    p = applyAffine(piece.transform, s.p0)
    q = applyAffine(piece.transform, segEnd(stripMeta(s)))
    if (distance(p, q) < 1e-6) fail(`El segmento "${sid}" no define un eje`)
  } else return fail('Eje de simetría no válido')
  const mirrored = withTransform(piece, reflectionAcross(p, q))
  if (!op.keepOriginal) return replacePiece(pieces, mirrored)
  const copy: PatternPiece = {
    ...mirrored,
    id: derivedId(pieces, piece.id),
    name: `${piece.name} (espejo)`,
  }
  return [...pieces, copy]
}

// ---------- cut on fold ----------

const suffixed = (id: string) => `${id}${MIRROR_SUFFIX}`

function cutOnFold(pieces: readonly PatternPiece[], op: CutOnFoldOp): PatternPiece[] {
  const piece = findPiece(pieces, op.pieceId)
  if (piece.fold) fail(`La pieza "${piece.id}" ya está desplegada al doblez`)
  const sid = op.foldSegmentId
  const n = piece.outline.length
  const k = piece.outline.findIndex((r) => r.segment === sid)
  if (k < 0) fail(`El segmento "${sid}" no es un borde de la pieza "${piece.id}"`)
  const fold = piece.segments[sid]
  if (fold.kind !== 'line') fail(`El borde "${sid}" no es recto: no puede ser un doblez`)
  const a = fold.p0
  const b = segEnd(stripMeta(fold))
  if (distance(a, b) < 1e-6) fail(`El borde "${sid}" es degenerado`)
  const onAxis = (v: Vec) => Math.abs(signedDistanceToLine(v, a, b)) <= ON_AXIS_TOL
  const segOnAxis = (id: string) => {
    const s = stripMeta(piece.segments[id])
    return (s.kind === 'line' ? [s.p0, s.p1] : [s.p0, s.p1, s.p2, s.p3]).every(onAxis)
  }

  // The fold run: the fold edge plus the collinear outline edges next to it.
  let first = k
  let last = k
  while ((last - first + 1) % n !== 0 && segOnAxis(piece.outline[(first - 1 + n) % n].segment))
    first--
  while ((last - first + 1) % n !== 0 && segOnAxis(piece.outline[(last + 1) % n].segment)) last++
  const runLen = last - first + 1
  if (runLen >= n) fail(`La pieza "${piece.id}" está entera sobre el eje`)
  const run = Array.from({ length: runLen }, (_, i) => piece.outline[(first + i + n) % n])
  const half: OutlineRef[] = Array.from(
    { length: n - runLen },
    (_, i) => piece.outline[(last + 1 + i) % n],
  )

  const mirror = reflectionAcross(a, b)
  const m = (v: Vec) => applyAffine(mirror, v)
  const runIds = new Set(run.map((r) => r.segment))
  const grainIds = new Set(
    piece.marks
      .filter((mk) => mk.kind === 'grainline' && typeof mk.data?.segment === 'string')
      .map((mk) => mk.data?.segment as string),
  )
  const mirrorName = (name: string | undefined) =>
    name === undefined
      ? undefined
      : onAxis(piece.points[name] ?? { x: NaN, y: NaN })
        ? name
        : suffixed(name)

  const segments: Record<string, DraftSegment> = {}
  const add = (s: DraftSegment) => {
    if (segments[s.id] && segments[s.id] !== s) fail(`Id duplicado al desplegar: "${s.id}"`)
    segments[s.id] = s
  }
  const mirrorSeg = (s: DraftSegment): DraftSegment => {
    const from = mirrorName(s.from)
    const to = mirrorName(s.to)
    return {
      ...mapSegment(stripMeta(s), m),
      id: suffixed(s.id),
      ...(from !== undefined && { from }),
      ...(to !== undefined && { to }),
    } as DraftSegment
  }
  for (const s of Object.values(piece.segments)) if (!runIds.has(s.id)) add(s)
  for (const r of half) add(mirrorSeg(piece.segments[r.segment]))

  // Internal lines: the grainline and lines on the fold stay single, the rest (darts…) are mirrored.
  const internalLines = [...piece.internalLines]
  for (const id of piece.internalLines) {
    if (grainIds.has(id) || segOnAxis(id)) continue
    add(mirrorSeg(piece.segments[id]))
    internalLines.push(suffixed(id))
  }
  const outline: OutlineRef[] = [
    ...half,
    ...[...half].reverse().map((r) => ({ segment: suffixed(r.segment), reversed: !r.reversed })),
  ]
  const marks: PieceMark[] = [...piece.marks]
  for (const mk of piece.marks) {
    if (mk.kind === 'grainline' || onAxis(mk.at)) continue
    const seg = mk.data?.segment
    marks.push({
      ...mk,
      id: suffixed(mk.id),
      at: m(mk.at),
      ...(mk.data && {
        data: typeof seg === 'string' ? { ...mk.data, segment: suffixed(seg) } : mk.data,
      }),
    })
  }
  const points: Record<string, Vec> = { ...piece.points }
  for (const [name, at] of Object.entries(piece.points))
    if (!onAxis(at)) points[suffixed(name)] = m(at)

  const runStart = (r: OutlineRef) => {
    const s = stripMeta(piece.segments[r.segment])
    return r.reversed ? segEnd(s) : s.p0
  }
  const runEnd = (r: OutlineRef) => {
    const s = stripMeta(piece.segments[r.segment])
    return r.reversed ? s.p0 : segEnd(s)
  }
  return replacePiece(pieces, {
    ...piece,
    segments,
    outline,
    internalLines,
    marks,
    points,
    onFold: false,
    fold: { from: runStart(run[0]), to: runEnd(run[run.length - 1]) },
  })
}

// ---------- duplicate / delete / meta ----------

function duplicatePiece(pieces: readonly PatternPiece[], op: DuplicatePieceOp): PatternPiece[] {
  const piece = findPiece(pieces, op.pieceId)
  const id = op.newId
  if (typeof id !== 'string' || !id.trim()) fail('Falta el id de la copia')
  if (id.includes(KEY_SEP)) fail(`Id de pieza no válido: "${id}"`)
  if (pieces.some((p) => p.id === id)) fail(`Ya existe una pieza "${id}"`)
  return [...pieces, placeRightOf({ ...piece, id }, pieces, DEFAULT_LAYOUT_GAP)]
}

function setPieceMeta(pieces: readonly PatternPiece[], op: SetPieceMetaOp): PatternPiece[] {
  const piece = findPiece(pieces, op.pieceId)
  const next: { -readonly [K in keyof PatternPiece]: PatternPiece[K] } = { ...piece }
  if (op.name !== undefined) {
    if (typeof op.name !== 'string') fail('Nombre no válido')
    next.name = op.name
  }
  if (op.cutCount !== undefined) {
    if (!Number.isInteger(op.cutCount) || op.cutCount < 1) fail('Número de cortes no válido')
    next.cutCount = op.cutCount
  }
  if (op.fabric !== undefined) {
    if (typeof op.fabric !== 'string') fail('Tela no válida')
    next.fabric = op.fabric
  }
  if (op.onFold !== undefined) next.onFold = op.onFold === true
  return replacePiece(pieces, next)
}

// ---------- layout ----------

/**
 * Shelf layout: pieces sorted by height (tallest first, ties by id) fill rows left to right; a row
 * wraps at LAYOUT_ROW_WIDTH (or the widest piece). Bounding boxes are at least `gap` apart, so the
 * pieces cannot overlap. The layout starts at the top-left of the current arrangement.
 */
function autoLayout(pieces: readonly PatternPiece[], op: AutoLayoutOp): PatternPiece[] {
  const gap = op.gapMm ?? DEFAULT_LAYOUT_GAP
  if (!Number.isFinite(gap) || gap < 0) fail('Separación no válida')
  if (pieces.length === 0) return []
  const origin = piecesWorldBBox(pieces)
  if (!origin) return [...pieces]
  const boxes = new Map(pieces.map((p) => [p.id, pieceWorldBBox(p)]))
  const w = (id: string) => boxes.get(id)!.maxX - boxes.get(id)!.minX
  const h = (id: string) => boxes.get(id)!.maxY - boxes.get(id)!.minY
  const order = [...pieces].sort((p, q) => h(q.id) - h(p.id) || (p.id < q.id ? -1 : 1))
  const rowWidth = Math.max(LAYOUT_ROW_WIDTH, ...pieces.map((p) => w(p.id)))
  const moved = new Map<string, PatternPiece>()
  let x = origin.minX
  let y = origin.minY
  let rowH = 0
  for (const p of order) {
    if (x > origin.minX && x - origin.minX + w(p.id) > rowWidth) {
      x = origin.minX
      y += rowH + gap
      rowH = 0
    }
    const b = boxes.get(p.id)!
    moved.set(p.id, withTransform(p, translation({ x: x - b.minX, y: y - b.minY })))
    x += w(p.id) + gap
    rowH = Math.max(rowH, h(p.id))
  }
  return pieces.map((p) => moved.get(p.id)!)
}

// ---------- replay ----------

function applyOne(ctx: Ctx, pieces: readonly PatternPiece[], op: Operation): PatternPiece[] {
  switch (op.type) {
    case 'extractPiece':
      return extract(ctx, pieces, op.pieceId)
    case 'extractAll':
      return ctx.draft.pieces.reduce<PatternPiece[]>(
        (acc, p) => extract(ctx, acc, p.id),
        [...pieces],
      )
    case 'transformPiece':
      return transformPiece(pieces, op)
    case 'mirrorPiece':
      return mirrorPiece(pieces, op)
    case 'cutOnFold':
      return cutOnFold(pieces, op)
    case 'duplicatePiece':
      return duplicatePiece(pieces, op)
    case 'deletePiece':
      findPiece(pieces, op.pieceId)
      return pieces.filter((p) => p.id !== op.pieceId)
    case 'setPieceMeta':
      return setPieceMeta(pieces, op)
    case 'autoLayout':
      return autoLayout(pieces, op)
    default:
      return fail(`Operación desconocida "${String((op as { type?: unknown }).type)}"`)
  }
}

const opIdOf = (op: unknown, index: number): string =>
  typeof op === 'object' && op !== null && typeof (op as { id?: unknown }).id === 'string'
    ? (op as { id: string }).id
    : `#${index}`

/** Apply `ops` on top of an already replayed pattern. Never throws. */
export function applyOperations(
  pattern: Pattern,
  ops: readonly Operation[],
  options: ReplayOptions = {},
): ReplayResult {
  const ctx: Ctx = { draft: pattern.draft, options }
  const issues: ReplayIssue[] = []
  let pieces: readonly PatternPiece[] = pattern.pieces
  ops.forEach((op, i) => {
    try {
      if (typeof op !== 'object' || op === null) fail('Operación no válida')
      pieces = applyOne(ctx, pieces, op)
    } catch (e) {
      const message =
        e instanceof OpError ? e.message : `Error al aplicar: ${(e as Error)?.message ?? String(e)}`
      issues.push({ opId: opIdOf(op, i), message })
    }
  })
  return { pattern: { draft: pattern.draft, pieces }, issues }
}

/** pattern = replay(draft, operations). Never throws; failed operations become issues. */
export const replay = (
  draft: Draft,
  ops: readonly Operation[],
  options: ReplayOptions = {},
): ReplayResult => applyOperations({ draft, pieces: [] }, ops, options)

/** World bounding box of the pieces (null when there are none). */
export const patternBBox = (pattern: Pattern) => piecesWorldBBox(pattern.pieces)

/** Bounding box of the draft's segments. */
export const draftBBox = (draft: Draft) =>
  unionBBox(Object.values(draft.segments).map((s) => segmentBBox(stripMeta(s))))
