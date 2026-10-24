/**
 * Render data of the Costura layer (docs/UI.md §3): the cut line of each extracted piece and its
 * notches repeated at the allowance edge. Pure, world units (mm).
 */
import {
  add,
  applyAffine,
  distance,
  isFoldEdge,
  normalize,
  notchOnCutLine,
  outlineNormalAt,
  pieceLocalPath,
  segEnd,
  sub,
  pathBBox,
  pieceWorldCutPath,
  scale,
  toSvgPathData,
  type BBox,
  type PatternPiece,
  type Vec,
} from '../../core'
import {
  NOTCH_GAP,
  NOTCH_LENGTH,
  readableAngle,
  type FoldMarkRender,
  type NotchRender,
} from './draftGeometry'

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

/** Inset (mm) of the fold bracket from the fold edge, and its arrow head size. */
const FOLD_INSET = 16
const FOLD_ARROW = 4

/**
 * Fold indicators of a piece (world): on each run of straight, collinear fold edges (see
 * isFoldEdge), a bracket parallel to the edge whose ends turn towards it with arrow heads, and the
 * word "DOBLEZ" — the usual "place on fold" notation.
 */
export function foldMarks(piece: PatternPiece): FoldMarkRender[] {
  const n = piece.outline.length
  const fold = piece.outline.map((r) => {
    const s = piece.segments[r.segment]
    return isFoldEdge(piece, r.segment) && s?.kind === 'line'
  })
  if (!fold.some(Boolean)) return []
  const runs: number[][] = []
  // Start after a non-fold edge so runs do not wrap (unless every edge is a fold edge).
  const start = Math.max(
    0,
    fold.findIndex((f) => !f),
  )
  for (let i = 0; i < n; i++) {
    const k = (start + i) % n
    if (!fold[k]) continue
    const last = runs[runs.length - 1]
    const prev = (k - 1 + n) % n
    if (last && last[last.length - 1] === prev) {
      const a = pieceLocalPath(piece).segments[prev]
      const b = pieceLocalPath(piece).segments[k]
      const u = normalize(sub(a.p0, segEnd(a)))
      const v = normalize(sub(b.p0, segEnd(b)))
      if (Math.abs(u.x * v.y - u.y * v.x) < 1e-3) {
        last.push(k)
        continue
      }
    }
    runs.push([k])
  }
  const local = pieceLocalPath(piece)
  const w = (p: Vec) => applyAffine(piece.transform, p)
  return runs.flatMap((ks) => {
    const A = local.segments[ks[0]].p0
    const B = segEnd(local.segments[ks[ks.length - 1]])
    const L = distance(A, B)
    if (L < 20) return []
    const u = normalize(sub(B, A))
    const out = outlineNormalAt(piece, piece.outline[ks[0]].segment, 0)
    if (!out) return []
    const inward = scale(out, -1)
    const inset = Math.min(FOLD_INSET, L / 4)
    const at = (t: number, d: number) => add(add(A, scale(u, t * L)), scale(inward, d))
    const p1 = w(at(0.15, inset))
    const p2 = w(at(0.85, inset))
    const t1 = w(at(0.15, 1))
    const t2 = w(at(0.85, 1))
    const head = (tip: Vec, from: Vec) => {
      const d = normalize(sub(tip, from))
      const base = sub(tip, scale(d, FOLD_ARROW * 1.6))
      const side = scale({ x: -d.y, y: d.x }, FOLD_ARROW * 0.6)
      const q1 = add(base, side)
      const q2 = sub(base, side)
      return `M${tip.x} ${tip.y}L${q1.x} ${q1.y}L${q2.x} ${q2.y}Z`
    }
    const wu = sub(w(at(1, 0)), w(at(0, 0)))
    return [
      {
        id: `${piece.id}/fold-mark-${ks[0]}`,
        pieceId: piece.id,
        d: `M${t1.x} ${t1.y}L${p1.x} ${p1.y}L${p2.x} ${p2.y}L${t2.x} ${t2.y}`,
        arrows: head(t1, p1) + head(t2, p2),
        textAt: w(at(0.5, inset + 6)),
        angle: readableAngle(wu),
      },
    ]
  })
}
