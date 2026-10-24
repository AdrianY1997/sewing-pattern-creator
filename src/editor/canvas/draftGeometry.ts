/**
 * Render data of a draft, split by canvas layer (docs/UI.md §3). Pure: no React, world units (mm).
 */
import {
  flattenPath,
  path,
  pathBBox,
  piecePath,
  polygonSignedArea,
  segmentBBox,
  segmentLength,
  segStart,
  stripMeta,
  toSvgPathData,
  unionBBox,
  type BBox,
  type Draft,
  type Piece,
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
}

export interface PieceRender {
  readonly id: string
  readonly name: string
  /** Closed outline as SVG path data (mm). */
  readonly d: string
  /** Outline vertices (segment joins). */
  readonly vertices: readonly Vec[]
  readonly bbox: BBox
  /** Area centroid: where the piece label goes. */
  readonly centroid: Vec
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

export interface DraftRender {
  readonly pieces: readonly PieceRender[]
  readonly darts: readonly LineRender[]
  readonly dartMarks: readonly MarkRender[]
  readonly grainlines: readonly GrainlineRender[]
  /** Construction lines and internal reference lines (e.g. the waist line of a hip block). */
  readonly guides: readonly LineRender[]
  readonly points: readonly { readonly name: string; readonly at: Vec }[]
  /** Every outline, dart and guide segment, for hover/selection (grainlines excluded). */
  readonly segments: readonly SegmentRender[]
  readonly bbox: BBox
}

export type InternalKind = 'grain' | 'dart' | 'guide'

/** Classify an internal line of a piece by its grainline mark or its id. */
export const classifyInternal = (piece: Piece, segmentId: string): InternalKind => {
  if (piece.marks.some((m) => m.kind === 'grainline' && m.data?.segment === segmentId))
    return 'grain'
  return /dart/i.test(segmentId) ? 'dart' : 'guide'
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

const segD = (draft: Draft, id: string): string =>
  toSvgPathData(path([stripMeta(draft.segments[id])]))

export const outlineD = (draft: Draft, pieceId: string): string =>
  toSvgPathData(piecePath(draft, pieceId))

export function buildDraftRender(draft: Draft): DraftRender {
  const used = new Set<string>()
  const darts: LineRender[] = []
  const guides: LineRender[] = []
  const grainlines: GrainlineRender[] = []

  const pieces = draft.pieces.map((pc): PieceRender => {
    const p = piecePath(draft, pc.id)
    pc.outline.forEach((r) => used.add(r.segment))
    for (const id of pc.internalLines) {
      used.add(id)
      const kind = classifyInternal(pc, id)
      if (kind === 'grain') {
        const s = draft.segments[id]
        grainlines.push({ id, pieceId: pc.id, from: s.p0, to: s.kind === 'line' ? s.p1 : s.p3 })
      } else (kind === 'dart' ? darts : guides).push({ id, d: segD(draft, id), pieceId: pc.id })
    }
    return {
      id: pc.id,
      name: pc.name,
      d: toSvgPathData(p),
      vertices: p.segments.map(segStart),
      bbox: pathBBox(p),
      centroid: polygonCentroid(flattenPath(p, 0.5)),
    }
  })

  for (const id of Object.keys(draft.segments))
    if (!used.has(id)) guides.push({ id, d: segD(draft, id) })

  const dartMarks = draft.pieces.flatMap((pc) =>
    pc.marks
      .filter((m) => m.kind === 'bustPoint')
      .map((m) => ({ id: m.id, pieceId: pc.id, at: m.at })),
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
    ...darts.map((l) => ({ ...l, layer: 'darts' as const })),
    ...guides.map((l) => ({ ...l, layer: 'guides' as const })),
  ]

  const segs = Object.values(draft.segments).map(stripMeta)
  return {
    segments,
    pieces,
    darts,
    dartMarks,
    grainlines,
    guides,
    points: Object.entries(draft.points).map(([name, at]) => ({ name, at })),
    bbox: unionBBox(segs.map(segmentBBox)),
  }
}

export interface PieceMetrics {
  /** Outline length (mm). */
  readonly perimeter: number
  /** Enclosed area (mm²). */
  readonly area: number
  /** Total length of the armhole segments (ids containing "armhole"), or null if none (mm). */
  readonly armhole: number | null
}

/** Measurements of a piece shown in the inspector. */
export function pieceMetrics(draft: Draft, pieceId: string): PieceMetrics {
  const piece = draft.pieces.find((p) => p.id === pieceId)
  if (!piece) throw new Error(`pieceMetrics: unknown piece "${pieceId}"`)
  const p = piecePath(draft, pieceId)
  const perimeter = p.segments.reduce((acc, s) => acc + segmentLength(s), 0)
  const area = Math.abs(polygonSignedArea(flattenPath(p, 0.01)))
  const armholeIds = piece.outline.map((r) => r.segment).filter((id) => /armhole/i.test(id))
  const armhole = armholeIds.length
    ? armholeIds.reduce((acc, id) => acc + segmentLength(draft.segments[id]), 0)
    : null
  return { perimeter, area, armhole }
}
