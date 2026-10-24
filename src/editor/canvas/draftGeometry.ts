/**
 * Render data of a draft, split by canvas layer (docs/UI.md §3). Pure: no React, world units (mm).
 */
import {
  flattenPath,
  path,
  pathBBox,
  piecePath,
  pointInPolygon,
  polygonSignedArea,
  segmentBBox,
  segmentLength,
  segmentPointAtLength,
  segStart,
  stripMeta,
  toSvgPathData,
  unionBBox,
  type BBox,
  type Draft,
  type Piece,
  type Segment,
  type Vec,
} from '../../core'

/** Canvas layer a segment is drawn on (and selectable from). */
export type SegmentLayer = 'outline' | 'darts' | 'guides'

/** One selectable segment: its own path data (hit area + highlight). */
export interface SegmentRender {
  readonly id: string
  readonly d: string
  readonly layer: SegmentLayer
  readonly pieceId?: string
  /** An internal line drawn on the outline layer (style / seam line), not an outline edge. */
  readonly internal?: boolean
}

/** A vertex of an outline: one end of an outline segment (world-draft segment id). */
export interface VertexRef {
  readonly segmentId: string
  readonly end: 'start' | 'end'
}

export interface PieceRender {
  readonly id: string
  readonly name: string
  /** Closed outline as SVG path data (mm). */
  readonly d: string
  /** Outline vertices (segment joins). */
  readonly vertices: readonly Vec[]
  /** For each vertex, the outline segment that starts there (as `{ segmentId, end }`). */
  readonly vertexRefs: readonly VertexRef[]
  readonly bbox: BBox
  /** Area centroid. */
  readonly centroid: Vec
  /** Where the label goes: the centroid, moved off the areas shared with other pieces. */
  readonly labelAt: Vec
  /** Label fields of an extracted piece (draft pieces use the block's cut info). */
  readonly label?: PieceLabelInfo
}

export interface PieceLabelInfo {
  readonly count: number
  readonly material: string
  readonly onFold: boolean
}

export interface LineRender {
  readonly id: string
  readonly d: string
  /** Owning piece, if the line is internal to one. */
  readonly pieceId?: string
}

export interface GrainlineRender {
  readonly id: string
  readonly pieceId: string
  readonly from: Vec
  readonly to: Vec
}

export interface MarkRender {
  readonly id: string
  readonly pieceId: string
  readonly at: Vec
}

export interface TextMarkRender {
  readonly id: string
  readonly pieceId: string
  readonly at: Vec
  readonly text: string
}

export interface ButtonRender {
  readonly id: string
  readonly pieceId: string
  readonly at: Vec
  /** Radius (mm). */
  readonly r: number
}

export interface NotchRender {
  readonly id: string
  readonly pieceId: string
  /** One [from, to] segment per tick (a double notch has two). */
  readonly ticks: readonly (readonly [Vec, Vec])[]
}

/** Gathers ("fruncir") along an edge: a wavy line inside the piece with end ticks. */
export interface GatherRender {
  readonly id: string
  readonly pieceId: string
  readonly d: string
  readonly textAt: Vec
  /** Text rotation (degrees), along the edge and readable. */
  readonly angle: number
  readonly text: string
}

/** Fold indicator on a fold edge: a bracket with arrows to the edge and "DOBLEZ". */
export interface FoldMarkRender {
  readonly id: string
  readonly pieceId: string
  /** Bracket (open path). */
  readonly d: string
  /** Arrow heads (closed polygons as path data). */
  readonly arrows: string
  readonly textAt: Vec
  readonly angle: number
}

export const NOTCH_LENGTH = 5
export const NOTCH_GAP = 3

/**
 * Ticks of a notch: short segments perpendicular to the outline at the point of `outline`
 * (a polyline, closed or not) nearest to `at`. `count` ticks, `gap` mm apart, each `length` mm long.
 */
export function notchTicks(
  outline: readonly Vec[],
  at: Vec,
  count = 1,
  length = NOTCH_LENGTH,
  gap = NOTCH_GAP,
): [Vec, Vec][] {
  let best: { p: Vec; dir: Vec } | null = null
  let bestD = Infinity
  const n = outline.length
  for (let i = 0; i < n; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % n]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    if (len2 < 1e-12) continue
    const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / len2))
    const p = { x: a.x + t * dx, y: a.y + t * dy }
    const d = (p.x - at.x) ** 2 + (p.y - at.y) ** 2
    if (d < bestD) {
      bestD = d
      const l = Math.sqrt(len2)
      best = { p, dir: { x: dx / l, y: dy / l } }
    }
  }
  if (!best) return []
  const { dir } = best
  const nx = -dir.y * (length / 2)
  const ny = dir.x * (length / 2)
  const c = Math.max(1, Math.floor(count))
  return Array.from({ length: c }, (_, i) => {
    const off = (i - (c - 1) / 2) * gap
    const m = { x: at.x + dir.x * off, y: at.y + dir.y * off }
    return [
      { x: m.x - nx, y: m.y - ny },
      { x: m.x + nx, y: m.y + ny },
    ] as [Vec, Vec]
  })
}

export interface DraftRender {
  readonly pieces: readonly PieceRender[]
  readonly darts: readonly LineRender[]
  readonly dartMarks: readonly MarkRender[]
  readonly grainlines: readonly GrainlineRender[]
  readonly notches: readonly NotchRender[]
  /** Text marks (addTextMark). */
  readonly texts: readonly TextMarkRender[]
  /** Button positions (addButton). */
  readonly buttons: readonly ButtonRender[]
  /** Construction lines and internal reference lines (e.g. the waist line of a hip block). */
  readonly guides: readonly LineRender[]
  /** Fold lines of pieces unfolded with "cortar al doblez". */
  readonly folds: readonly LineRender[]
  /** Style / seam lines (internal lines with role 'seam': yokes, princess lines, drawn lines). */
  readonly styles: readonly LineRender[]
  readonly gathers: readonly GatherRender[]
  /** Fold indicators on the fold edges of extracted pieces (filled by the pattern data). */
  readonly foldMarks: readonly FoldMarkRender[]
  readonly points: readonly { readonly name: string; readonly at: Vec }[]
  /** Every outline, dart and guide segment, for hover/selection (grainlines excluded). */
  readonly segments: readonly SegmentRender[]
  readonly bbox: BBox
}

export type InternalKind = 'grain' | 'dart' | 'guide' | 'fold' | 'style'

/**
 * Classify an internal line of a piece: grainline (its mark), dart leg (the piece's darts, or an
 * id with "dart"), style line (role 'seam'), fold line, else guide.
 */
export const classifyInternal = (piece: Piece, segmentId: string, draft?: Draft): InternalKind => {
  if (piece.marks.some((m) => m.kind === 'grainline' && m.data?.segment === segmentId))
    return 'grain'
  if (segmentId === 'fold' || segmentId.endsWith('/fold')) return 'fold'
  if ((piece.darts ?? []).some((d) => [...d.legs, ...(d.legs2 ?? [])].includes(segmentId)))
    return 'dart'
  if (draft?.segments[segmentId]?.role === 'seam') return 'style'
  return /dart/i.test(segmentId) ? 'dart' : 'guide'
}

/** Degrees of a direction, flipped by 180° when needed so text along it reads left to right. */
export const readableAngle = (dir: Vec): number => {
  let a = (Math.atan2(dir.y, dir.x) * 180) / Math.PI
  if (a > 90) a -= 180
  if (a <= -90) a += 180
  return a
}

/** Wavy gather line along a chain of world segments, on the side inside `poly`. */
function gatherRender(
  id: string,
  pieceId: string,
  segs: readonly Segment[],
  poly: readonly Vec[],
  text: string,
): GatherRender | null {
  const total = segs.reduce((a, s) => a + segmentLength(s), 0)
  if (total <= 0) return null
  const at = (len: number) => {
    let rest = len
    for (const s of segs) {
      const l = segmentLength(s)
      if (rest <= l + 1e-9) return segmentPointAtLength(s, Math.min(rest, l))
      rest -= l
    }
    const last = segs[segs.length - 1]
    return segmentPointAtLength(last, segmentLength(last))
  }
  const mid = at(total / 2)
  const n0 = { x: -mid.tangent.y, y: mid.tangent.x }
  const probe = { x: mid.point.x + n0.x * 3, y: mid.point.y + n0.y * 3 }
  const side = pointInPolygon(probe, poly) ? 1 : -1
  const steps = Math.max(6, Math.round(total / 3))
  const pts: Vec[] = []
  for (let i = 0; i <= steps; i++) {
    const s = at((total * i) / steps)
    const off = 7 + (i % 2 === 0 ? -1.6 : 1.6)
    pts.push({
      x: s.point.x - s.tangent.y * off * side,
      y: s.point.y + s.tangent.x * off * side,
    })
  }
  const tick = (len: number) => {
    const s = at(len)
    const n = { x: -s.tangent.y * side, y: s.tangent.x * side }
    return `M${s.point.x} ${s.point.y}L${s.point.x + n.x * 11} ${s.point.y + n.y * 11}`
  }
  const wave = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('')
  return {
    id,
    pieceId,
    d: `${wave}${tick(0)}${tick(total)}`,
    textAt: {
      x: mid.point.x - mid.tangent.y * 17 * side,
      y: mid.point.y + mid.tangent.x * 17 * side,
    },
    angle: readableAngle(mid.tangent),
    text,
  }
}

/** Area centroid of a polygon (falls back to the vertex average when degenerate). */
export const polygonCentroid = (pts: readonly Vec[]): Vec => {
  const a = polygonSignedArea(pts)
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(pts.length, 1)
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / n,
      y: pts.reduce((s, p) => s + p.y, 0) / n,
    }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

export { pointInPolygon }

const segD = (draft: Draft, id: string): string =>
  toSvgPathData(path([stripMeta(draft.segments[id])]))

export const outlineD = (draft: Draft, pieceId: string): string =>
  toSvgPathData(piecePath(draft, pieceId))

export function buildDraftRender(draft: Draft): DraftRender {
  const used = new Set<string>()
  const darts: LineRender[] = []
  const guides: LineRender[] = []
  const grainlines: GrainlineRender[] = []
  const folds: LineRender[] = []
  const styles: LineRender[] = []
  const lists = { dart: darts, guide: guides, fold: folds, style: styles }

  const polys = draft.pieces.map((pc) => flattenPath(piecePath(draft, pc.id), 0.5))
  const labels = labelPositions(polys)
  const pieces = draft.pieces.map((pc, i): PieceRender => {
    const p = piecePath(draft, pc.id)
    pc.outline.forEach((r) => used.add(r.segment))
    for (const id of pc.internalLines) {
      used.add(id)
      const kind = classifyInternal(pc, id, draft)
      if (kind === 'grain') {
        const s = draft.segments[id]
        grainlines.push({ id, pieceId: pc.id, from: s.p0, to: s.kind === 'line' ? s.p1 : s.p3 })
      } else lists[kind].push({ id, d: segD(draft, id), pieceId: pc.id })
    }
    return {
      id: pc.id,
      name: pc.name,
      d: toSvgPathData(p),
      vertices: p.segments.map(segStart),
      vertexRefs: pc.outline.map((r) => ({
        segmentId: r.segment,
        end: r.reversed ? ('end' as const) : ('start' as const),
      })),
      bbox: pathBBox(p),
      centroid: polygonCentroid(polys[i]),
      labelAt: labels[i],
    }
  })

  for (const id of Object.keys(draft.segments))
    if (!used.has(id)) guides.push({ id, d: segD(draft, id) })

  const dartMarks = draft.pieces.flatMap((pc) =>
    pc.marks
      .filter((m) => m.kind === 'bustPoint')
      .map((m) => ({ id: m.id, pieceId: pc.id, at: m.at })),
  )

  const notches = draft.pieces.flatMap((pc) => {
    const outline = flattenPath(piecePath(draft, pc.id), 0.1)
    return pc.marks
      .filter((m) => m.kind === 'notch')
      .map((m) => ({
        id: m.id,
        pieceId: pc.id,
        ticks: notchTicks(outline, m.at, typeof m.data?.count === 'number' ? m.data.count : 1),
      }))
  })

  const marksOf = (kind: string) =>
    draft.pieces.flatMap((pc) =>
      pc.marks.filter((m) => m.kind === kind).map((m) => ({ m, pieceId: pc.id })),
    )
  const texts = marksOf('text').map(({ m, pieceId }) => ({
    id: m.id,
    pieceId,
    at: m.at,
    text: typeof m.data?.text === 'string' ? m.data.text : '',
  }))
  const buttons = marksOf('button').map(({ m, pieceId }) => ({
    id: m.id,
    pieceId,
    at: m.at,
    r: (typeof m.data?.diameterMm === 'number' ? m.data.diameterMm : 10) / 2,
  }))

  const gathers = draft.pieces.flatMap((pc, i) =>
    pc.marks.flatMap((m) => {
      if (m.kind !== 'gather' || !Array.isArray(m.data?.segments)) return []
      const segs = (m.data.segments as unknown[])
        .map((id) => draft.segments[String(id)])
        .filter((s) => s !== undefined)
        .map(stripMeta)
      const text = typeof m.data.text === 'string' ? m.data.text : 'fruncir'
      return gatherRender(m.id, pc.id, segs, polys[i], text) ?? []
    }),
  )

  const segments: SegmentRender[] = [
    ...draft.pieces.flatMap((pc) =>
      pc.outline.map((r) => ({
        id: r.segment,
        d: segD(draft, r.segment),
        layer: 'outline' as const,
        pieceId: pc.id,
      })),
    ),
    ...styles.map((l) => ({ ...l, layer: 'outline' as const, internal: true })),
    ...darts.map((l) => ({ ...l, layer: 'darts' as const })),
    ...guides.map((l) => ({ ...l, layer: 'guides' as const })),
  ]

  const segs = Object.values(draft.segments).map(stripMeta)
  return {
    folds,
    styles,
    gathers,
    foldMarks: [],
    segments,
    pieces,
    darts,
    dartMarks,
    grainlines,
    notches,
    texts,
    buttons,
    guides,
    points: Object.entries(draft.points).map(([name, at]) => ({ name, at })),
    bbox: segs.length ? unionBBox(segs.map(segmentBBox)) : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  }
}

/** Grid samples per side used to find the free area of overlapping pieces. */
const LABEL_SAMPLES = 48

/**
 * Label position of each polygon: its area centroid when it overlaps no other polygon; otherwise
 * the centroid of the part that is NOT shared with the others (estimated on a grid of samples),
 * snapped to the nearest free sample so it always lies inside that part. Falls back to the
 * centroid when the polygon is entirely covered.
 */
export function labelPositions(polys: readonly (readonly Vec[])[]): Vec[] {
  return polys.map((poly, i) => {
    const centroid = polygonCentroid(poly)
    if (poly.length < 3 || polys.length < 2) return centroid
    const xs = poly.map((p) => p.x)
    const ys = poly.map((p) => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const dx = (Math.max(...xs) - minX) / LABEL_SAMPLES
    const dy = (Math.max(...ys) - minY) / LABEL_SAMPLES
    const free: Vec[] = []
    let shared = 0
    for (let a = 0; a < LABEL_SAMPLES; a++)
      for (let b = 0; b < LABEL_SAMPLES; b++) {
        const p = { x: minX + (a + 0.5) * dx, y: minY + (b + 0.5) * dy }
        if (!pointInPolygon(p, poly)) continue
        if (polys.some((q, j) => j !== i && pointInPolygon(p, q))) shared++
        else free.push(p)
      }
    if (shared === 0 || free.length === 0) return centroid
    const m = {
      x: free.reduce((s, p) => s + p.x, 0) / free.length,
      y: free.reduce((s, p) => s + p.y, 0) / free.length,
    }
    return free.reduce((best, p) =>
      (p.x - m.x) ** 2 + (p.y - m.y) ** 2 < (best.x - m.x) ** 2 + (best.y - m.y) ** 2 ? p : best,
    )
  })
}

export interface PieceMetrics {
  /** Outline length (mm). */
  readonly perimeter: number
  /** Enclosed area (mm²). */
  readonly area: number
  /** Total length of the armhole edges (role 'armhole', or ids containing "armhole"), or null. */
  readonly armhole: number | null
}

/** Measurements of a piece shown in the inspector. */
export function pieceMetrics(draft: Draft, pieceId: string): PieceMetrics {
  const piece = draft.pieces.find((p) => p.id === pieceId)
  if (!piece) throw new Error(`pieceMetrics: unknown piece "${pieceId}"`)
  const p = piecePath(draft, pieceId)
  const perimeter = p.segments.reduce((acc, s) => acc + segmentLength(s), 0)
  const area = Math.abs(polygonSignedArea(flattenPath(p, 0.01)))
  const armholeIds = piece.outline
    .map((r) => r.segment)
    .filter((id) => {
      const role = draft.segments[id]?.role
      return role ? role === 'armhole' : /armhole/i.test(id)
    })
  const armhole = armholeIds.length
    ? armholeIds.reduce((acc, id) => acc + segmentLength(draft.segments[id]), 0)
    : null
  return { perimeter, area, armhole }
}
