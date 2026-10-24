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
  /** Owner (piece id) of the point, for `exclude` at query time. */
  readonly owner?: string
}

interface Candidate {
  readonly at: Vec
  readonly name?: string
  readonly segmentId?: string
  /** Owners (piece ids) of what produced the candidate: an intersection has up to two. */
  readonly owners?: readonly string[]
}

export interface SnapIndex {
  readonly points: readonly NamedPoint[]
  readonly segments: readonly Segment[]
  readonly endpoints: readonly Candidate[]
  readonly midpoints: readonly Candidate[]
  readonly intersections: readonly Candidate[]
  readonly boxes: readonly BBox[]
  /** Owner (piece id) of each segment, same order as `segments` (undefined when unowned). */
  readonly segmentOwners: readonly (string | undefined)[]
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
  /** Owner (piece id) whose points, segments and intersections are ignored (the piece being moved). */
  readonly exclude?: string | null
}

const SAME = 1e-6

const sameOwners = (a: readonly string[] | undefined, b: readonly string[] | undefined) =>
  (a ?? []).join('|') === (b ?? []).join('|')

/** Drop coincident candidates of the same owners (those of other owners stay: they may be excluded). */
const dedupe = (cs: readonly Candidate[]): Candidate[] => {
  const out: Candidate[] = []
  for (const c of cs)
    if (!out.some((o) => sameOwners(o.owners, c.owners) && distance(o.at, c.at) < SAME)) out.push(c)
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

/**
 * Precompute the snap candidates of a set of named points and segments. `owners` maps a segment id
 * to its piece id: candidates remember their owners, so the piece being dragged is left out at
 * query time (`SnapOptions.exclude`) without rebuilding the O(n²) intersections.
 */
export function buildSnapIndex(
  points: readonly NamedPoint[],
  segments: readonly Segment[],
  owners: ReadonlyMap<string, string> = new Map(),
): SnapIndex {
  const ownerOf = segments.map((s) => owners.get(s.id))
  const own = (...o: (string | undefined)[]): string[] | undefined => {
    const ids = [...new Set(o.filter((x): x is string => x !== undefined))]
    return ids.length ? ids : undefined
  }
  const endpoints = dedupe(
    segments.flatMap((s, i) => [
      { at: segStart(s), segmentId: s.id, owners: own(ownerOf[i]) },
      { at: segEnd(s), segmentId: s.id, owners: own(ownerOf[i]) },
    ]),
  )
  const midpoints = segments.map((s, i) => ({
    at: segmentMidpoint(s),
    segmentId: s.id,
    owners: own(ownerOf[i]),
  }))
  const boxes = segments.map(segmentBBox)
  const isEndpoint = (p: Vec) => endpoints.some((e) => distance(e.at, p) < 1e-3)
  const hits: Candidate[] = []
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      if (!boxesOverlap(boxes[i], boxes[j], 1e-6)) continue
      for (const h of intersectSegments(segments[i], segments[j]))
        // Joins of consecutive segments are endpoints, not crossings.
        if (!isEndpoint(h.point)) hits.push({ at: h.point, owners: own(ownerOf[i], ownerOf[j]) })
    }
  return {
    points,
    segments,
    endpoints,
    midpoints,
    intersections: dedupe(hits),
    boxes,
    segmentOwners: ownerOf,
  }
}

/** Grid step (mm) for a scale: 1 mm when 1 mm is at least `minPx` on screen, else 1 cm. */
export const gridSnapStep = (scale: number, minPx = 8): number => (scale >= minPx ? 1 : 10)

const ownedBy = (c: object, id: string): boolean =>
  (c as Candidate).owners?.includes(id) === true || (c as NamedPoint).owner === id

const nearest = <C extends { readonly at: Vec }>(
  cs: readonly C[],
  p: Vec,
  tolMm: number,
  exclude?: string | null,
): { c: C; d: number } | null => {
  let best: { c: C; d: number } | null = null
  for (const c of cs) {
    // A candidate is ignored when any of its owners is the excluded piece.
    if (exclude && ownedBy(c, exclude)) continue
    const d = distance(c.at, p)
    if (d <= tolMm && (!best || d < best.d)) best = { c, d }
  }
  return best
}

/** Best snap target for `cursor` (mm), or null when nothing is within the tolerance. */
export function snap(index: SnapIndex, cursor: Vec, opts: SnapOptions): SnapResult | null {
  const tolPx = opts.tolerancePx ?? SNAP_TOLERANCE_PX
  const tolMm = tolPx / opts.scale
  const exclude = opts.exclude
  const off = new Set(opts.disabled ?? [])
  if (opts.grid === false) off.add('grid')

  const finder: Record<SnapKind, () => { c: Candidate | NamedPoint; d: number } | null> = {
    point: () => nearest(index.points, cursor, tolMm, exclude),
    endpoint: () => nearest(index.endpoints, cursor, tolMm, exclude),
    intersection: () => nearest(index.intersections, cursor, tolMm, exclude),
    midpoint: () => nearest(index.midpoints, cursor, tolMm, exclude),
    curve: () => {
      const near: Candidate[] = []
      index.segments.forEach((s, i) => {
        if (exclude && index.segmentOwners[i] === exclude) return
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
        ...('name' in hit.c && hit.c.name !== undefined && { name: hit.c.name }),
        ...('segmentId' in hit.c &&
          hit.c.segmentId !== undefined && { segmentId: hit.c.segmentId }),
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
