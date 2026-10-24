/**
 * Snap engine (pure TS, world units = mm). Given a cursor position it returns the best snap
 * target within a screen-pixel tolerance, trying the kinds in priority order:
 *
 *   named point > segment endpoint > intersection > segment midpoint > nearest on segment > grid
 *
 * The first kind with a candidate inside the tolerance wins; inside a kind, the closest one.
 * Build the index once per draft/visible-layer set (intersections are precomputed).
 */
import {
  distance,
  intersectSegments,
  nearestOnBezier,
  lerp,
  projectParam,
  segEnd,
  segStart,
  segmentBBox,
  segmentPoint,
  segmentLength,
  segmentPointAtLength,
  type BBox,
  type Segment,
  type Vec,
} from '../../core'

export type SnapKind = 'point' | 'endpoint' | 'intersection' | 'midpoint' | 'curve' | 'grid'

/** Priority order: earlier kinds win over later ones whenever both are within tolerance. */
export const SNAP_PRIORITY: readonly SnapKind[] = [
  'point',
  'endpoint',
  'intersection',
  'midpoint',
  'curve',
  'grid',
]

export const SNAP_LABEL: Readonly<Record<SnapKind, string>> = {
  point: 'Punto',
  endpoint: 'Extremo',
  intersection: 'Intersección',
  midpoint: 'Punto medio',
  curve: 'Sobre línea',
  grid: 'Rejilla',
}

/** Default tolerance (screen px). */
export const SNAP_TOLERANCE_PX = 10

export interface NamedPoint {
  readonly name: string
  readonly at: Vec
}

interface Candidate {
  readonly at: Vec
  readonly name?: string
  readonly segmentId?: string
}

export interface SnapIndex {
  readonly points: readonly NamedPoint[]
  readonly segments: readonly Segment[]
  readonly endpoints: readonly Candidate[]
  readonly midpoints: readonly Candidate[]
  readonly intersections: readonly Candidate[]
  readonly boxes: readonly BBox[]
}

export interface SnapResult {
  readonly kind: SnapKind
  /** Snapped world position (mm). */
  readonly at: Vec
  /** Distance cursor → target in screen px. */
  readonly distancePx: number
  /** Point name (kind 'point'). */
  readonly name?: string
  /** Segment the target lies on (endpoint, midpoint, curve). */
  readonly segmentId?: string
}

export interface SnapOptions {
  /** View scale in px per mm. */
  readonly scale: number
  readonly tolerancePx?: number
  /** Snap to the grid as a last resort (default true). */
  readonly grid?: boolean
  /** Kinds to skip. */
  readonly disabled?: readonly SnapKind[]
}

const SAME = 1e-6

const dedupe = (cs: readonly Candidate[]): Candidate[] => {
  const out: Candidate[] = []
  for (const c of cs) if (!out.some((o) => distance(o.at, c.at) < SAME)) out.push(c)
  return out
}

const boxesOverlap = (a: BBox, b: BBox, pad: number): boolean =>
  !(
    a.maxX + pad < b.minX ||
    b.maxX + pad < a.minX ||
    a.maxY + pad < b.minY ||
    b.maxY + pad < a.minY
  )

/** Midpoint by arc length (for curves, not the t = 0.5 point). */
export const segmentMidpoint = (s: Segment): Vec =>
  s.kind === 'line' ? segmentPoint(s, 0.5) : segmentPointAtLength(s, segmentLength(s) / 2).point

/** Closest point on a segment to `p`. */
export const nearestOnSegment = (s: Segment, p: Vec): Vec =>
  s.kind === 'line'
    ? distance(s.p0, s.p1) < SAME
      ? s.p0
      : lerp(s.p0, s.p1, Math.min(1, Math.max(0, projectParam(p, s.p0, s.p1))))
    : nearestOnBezier(s, p).point

/** Precompute the snap candidates of a set of named points and segments. */
export function buildSnapIndex(
  points: readonly NamedPoint[],
  segments: readonly Segment[],
): SnapIndex {
  const endpoints = dedupe(
    segments.flatMap((s) => [
      { at: segStart(s), segmentId: s.id },
      { at: segEnd(s), segmentId: s.id },
    ]),
  )
  const midpoints = segments.map((s) => ({ at: segmentMidpoint(s), segmentId: s.id }))
  const boxes = segments.map(segmentBBox)
  const isEndpoint = (p: Vec) => endpoints.some((e) => distance(e.at, p) < 1e-3)
  const hits: Candidate[] = []
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      if (!boxesOverlap(boxes[i], boxes[j], 1e-6)) continue
      for (const h of intersectSegments(segments[i], segments[j]))
        // Joins of consecutive segments are endpoints, not crossings.
        if (!isEndpoint(h.point)) hits.push({ at: h.point })
    }
  return { points, segments, endpoints, midpoints, intersections: dedupe(hits), boxes }
}

/** Grid step (mm) for a scale: 1 mm when 1 mm is at least `minPx` on screen, else 1 cm. */
export const gridSnapStep = (scale: number, minPx = 8): number => (scale >= minPx ? 1 : 10)

const nearest = (
  cs: readonly Candidate[],
  p: Vec,
  tolMm: number,
): { c: Candidate; d: number } | null => {
  let best: { c: Candidate; d: number } | null = null
  for (const c of cs) {
    const d = distance(c.at, p)
    if (d <= tolMm && (!best || d < best.d)) best = { c, d }
  }
  return best
}

/** Best snap target for `cursor` (mm), or null when nothing is within the tolerance. */
export function snap(index: SnapIndex, cursor: Vec, opts: SnapOptions): SnapResult | null {
  const tolPx = opts.tolerancePx ?? SNAP_TOLERANCE_PX
  const tolMm = tolPx / opts.scale
  const off = new Set(opts.disabled ?? [])
  if (opts.grid === false) off.add('grid')

  const finder: Record<SnapKind, () => { c: Candidate; d: number } | null> = {
    point: () => nearest(index.points, cursor, tolMm),
    endpoint: () => nearest(index.endpoints, cursor, tolMm),
    intersection: () => nearest(index.intersections, cursor, tolMm),
    midpoint: () => nearest(index.midpoints, cursor, tolMm),
    curve: () => {
      const near: Candidate[] = []
      index.segments.forEach((s, i) => {
        const b = index.boxes[i]
        if (
          cursor.x < b.minX - tolMm ||
          cursor.x > b.maxX + tolMm ||
          cursor.y < b.minY - tolMm ||
          cursor.y > b.maxY + tolMm
        )
          return
        near.push({ at: nearestOnSegment(s, cursor), segmentId: s.id })
      })
      return nearest(near, cursor, tolMm)
    },
    grid: () => {
      const step = gridSnapStep(opts.scale)
      const at = { x: Math.round(cursor.x / step) * step, y: Math.round(cursor.y / step) * step }
      return nearest([{ at }], cursor, tolMm)
    },
  }

  for (const kind of SNAP_PRIORITY) {
    if (off.has(kind)) continue
    const hit = finder[kind]()
    if (hit)
      return {
        kind,
        at: hit.c.at,
        distancePx: hit.d * opts.scale,
        ...(hit.c.name !== undefined && { name: hit.c.name }),
        ...(hit.c.segmentId !== undefined && { segmentId: hit.c.segmentId }),
      }
  }
  return null
}

/**
 * Named point(s) under the cursor (within `tolerancePx`), for the hover tooltip. Points that
 * coincide with the closest one are returned together (names joined by the caller).
 */
export function pointsAt(
  points: readonly NamedPoint[],
  cursor: Vec,
  scale: number,
  tolerancePx = 8,
): NamedPoint[] {
  const best = nearest(points, cursor, tolerancePx / scale)
  if (!best) return []
  return points.filter((p) => distance(p.at, best.c.at) < 1e-3)
}
