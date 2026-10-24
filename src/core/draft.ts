/**
 * Draft model: named construction points, segments with stable ids, and pieces whose outlines
 * reference segments by id. Everything is plain JSON so drafts can be stored, diffed and replayed
 * across sizes (same ids for every size).
 */
import {
  catmullRom,
  cubic,
  curveWithTangents,
  smoothWithTangents,
  type CubicBezier,
} from './bezier'
import { line, path, reverseSegment, segEnd, type LineSeg, type Path, type Segment } from './path'
import { distance, type Vec } from './vec'

/**
 * What an edge is in the garment. Seam allowance defaults use it (hem → hem allowance, fold → 0)
 * and so do readouts such as the armhole length.
 */
export type SegmentRole =
  | 'hem'
  | 'centerFront'
  | 'centerBack'
  | 'fold'
  | 'waist'
  | 'neckline'
  | 'armhole'
  | 'side'
  | 'shoulder'
  | 'inseam'
  | 'outseam'
  | 'crotch'
  | 'cap'
  | 'underarm'
  | 'dart'

export const SEGMENT_ROLES: readonly SegmentRole[] = [
  'hem',
  'centerFront',
  'centerBack',
  'fold',
  'waist',
  'neckline',
  'armhole',
  'side',
  'shoulder',
  'inseam',
  'outseam',
  'crotch',
  'cap',
  'underarm',
  'dart',
]

/**
 * A segment plus the names of the construction points it joins (when built from names) and its
 * role in the garment (outline edges of the blocks always have one).
 */
export type DraftSegment = Segment & {
  readonly from?: string
  readonly to?: string
  readonly role?: SegmentRole
}

export interface OutlineRef {
  readonly segment: string
  /** True when the piece traverses the segment from its end to its start. */
  readonly reversed: boolean
}

/** Placeholder for notches, drill holes, labels… (defined in a later phase). */
export interface PieceMark {
  readonly id: string
  readonly kind: string
  readonly at: Vec
  readonly data?: Readonly<Record<string, unknown>>
}

export interface Piece {
  readonly id: string
  readonly name: string
  /** Closed outline, in traversal order. */
  readonly outline: readonly OutlineRef[]
  /** Segment ids of internal lines (grainline, dart legs, guide lines). */
  readonly internalLines: readonly string[]
  readonly marks: readonly PieceMark[]
}

export interface Draft {
  readonly version: 1
  readonly points: Readonly<Record<string, Vec>>
  readonly segments: Readonly<Record<string, DraftSegment>>
  readonly pieces: readonly Piece[]
}

type PointRef = string | Vec

/** Gap tolerance (mm) when chaining outline segments. */
const JOIN_TOL = 1e-3

export class DraftBuilder {
  private readonly points = new Map<string, Vec>()
  private readonly segments = new Map<string, DraftSegment>()
  private readonly pieces = new Map<string, Piece>()

  /** Tag segments with their role in the garment (see SegmentRole). */
  role(role: SegmentRole, ...ids: readonly string[]): void {
    for (const id of ids) this.segments.set(id, { ...this.seg(id), role })
  }

  /** Register a named construction point. Names are unique. */
  point(name: string, p: Vec): Vec {
    if (this.points.has(name)) throw new Error(`DraftBuilder: duplicate point "${name}"`)
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
      throw new Error(`DraftBuilder: point "${name}" is not finite`)
    const v = { x: p.x, y: p.y }
    this.points.set(name, v)
    return v
  }

  hasPoint(name: string): boolean {
    return this.points.has(name)
  }

  /** Look up a named point (throws if missing). */
  p(name: string): Vec {
    const v = this.points.get(name)
    if (!v) throw new Error(`DraftBuilder: unknown point "${name}"`)
    return v
  }

  /** Look up a segment by id (throws if missing). */
  seg(id: string): DraftSegment {
    const s = this.segments.get(id)
    if (!s) throw new Error(`DraftBuilder: unknown segment "${id}"`)
    return s
  }

  /** Register an arbitrary segment, optionally tagging the point names it joins. */
  segment<S extends Segment>(s: S, meta: { from?: string; to?: string } = {}): S {
    if (this.segments.has(s.id)) throw new Error(`DraftBuilder: duplicate segment "${s.id}"`)
    const tagged: DraftSegment = {
      ...s,
      ...(meta.from ? { from: meta.from } : {}),
      ...(meta.to ? { to: meta.to } : {}),
    }
    this.segments.set(s.id, tagged)
    return s
  }

  line(id: string, from: PointRef, to: PointRef): LineSeg {
    return this.segment(line(id, this.resolve(from), this.resolve(to)), this.names(from, to))
  }

  bezier(id: string, from: PointRef, c1: Vec, c2: Vec, to: PointRef): CubicBezier {
    return this.segment(
      cubic(id, this.resolve(from), c1, c2, this.resolve(to)),
      this.names(from, to),
    )
  }

  /** Curve leaving `from` along `dir0` and arriving at `to` along `dir3` (see curveWithTangents). */
  curveWithTangents(
    id: string,
    from: PointRef,
    dir0: Vec,
    to: PointRef,
    dir3: Vec,
    tension?: number,
  ): CubicBezier {
    const c = curveWithTangents(id, this.resolve(from), dir0, this.resolve(to), dir3, tension)
    return this.segment(c, this.names(from, to))
  }

  /** Smooth curve through points; segment ids are `${idPrefix}.0`, `${idPrefix}.1`… */
  smooth(idPrefix: string, through: readonly PointRef[]): CubicBezier[] {
    const curves = catmullRom(
      through.map((r) => this.resolve(r)),
      { idPrefix },
    )
    curves.forEach((c, i) => {
      const from = through[i]
      const to = through[i + 1]
      this.segment(c, this.names(from, to))
    })
    return curves
  }

  /**
   * Smooth curve through points with prescribed end tangents (see smoothWithTangents); segment ids
   * are `${idPrefix}.0`, `${idPrefix}.1`…
   */
  smoothWithTangents(
    idPrefix: string,
    through: readonly PointRef[],
    startDir: Vec,
    endDir: Vec,
  ): CubicBezier[] {
    const curves = smoothWithTangents(
      through.map((r) => this.resolve(r)),
      startDir,
      endDir,
      idPrefix,
    )
    curves.forEach((c, i) => this.segment(c, this.names(through[i], through[i + 1])))
    return curves
  }

  /**
   * Register a piece. `outline` lists segment ids in traversal order; orientation is detected from
   * shared endpoints unless given explicitly as an OutlineRef. The outline must close.
   */
  piece(
    id: string,
    name: string,
    outline: readonly (string | OutlineRef)[],
    options: { internalLines?: readonly string[]; marks?: readonly PieceMark[] } = {},
  ): Piece {
    if (this.pieces.has(id)) throw new Error(`DraftBuilder: duplicate piece "${id}"`)
    if (outline.length === 0) throw new Error(`DraftBuilder: piece "${id}" has an empty outline`)
    for (const l of options.internalLines ?? []) this.seg(l)
    const refs = orientOutline(
      outline.map((r) => (typeof r === 'string' ? { segment: r, reversed: null } : r)),
      (sid) => this.seg(sid),
      id,
    )
    const piece: Piece = {
      id,
      name,
      outline: refs,
      internalLines: [...(options.internalLines ?? [])],
      marks: [...(options.marks ?? [])],
    }
    this.pieces.set(id, piece)
    return piece
  }

  /** Snapshot as a plain-JSON Draft (deep copy). */
  build(): Draft {
    const draft: Draft = {
      version: 1,
      points: Object.fromEntries(this.points),
      segments: Object.fromEntries(this.segments),
      pieces: [...this.pieces.values()],
    }
    return JSON.parse(JSON.stringify(draft)) as Draft
  }

  private resolve(r: PointRef): Vec {
    return typeof r === 'string' ? this.p(r) : r
  }

  private names(from: PointRef, to: PointRef): { from?: string; to?: string } {
    return {
      ...(typeof from === 'string' ? { from } : {}),
      ...(typeof to === 'string' ? { to } : {}),
    }
  }
}

const orient = (s: Segment, reversed: boolean): [Vec, Vec] =>
  reversed ? [segEnd(s), s.p0] : [s.p0, segEnd(s)]

function orientOutline(
  refs: readonly { segment: string; reversed: boolean | null }[],
  get: (id: string) => Segment,
  pieceId: string,
): OutlineRef[] {
  const segs = refs.map((r) => get(r.segment))
  const out: OutlineRef[] = []
  const fail = (msg: string): never => {
    throw new Error(`DraftBuilder: piece "${pieceId}" ${msg}`)
  }
  // First segment: explicit, or the orientation whose end touches the next segment.
  let firstRev = refs[0].reversed
  if (firstRev === null) {
    if (segs.length === 1) firstRev = false
    else {
      const next = segs[1]
      const touches = (p: Vec) =>
        distance(p, next.p0) <= JOIN_TOL || distance(p, segEnd(next)) <= JOIN_TOL
      if (touches(segEnd(segs[0]))) firstRev = false
      else if (touches(segs[0].p0)) firstRev = true
      else fail(`: "${refs[0].segment}" does not connect to "${refs[1].segment}"`)
    }
  }
  out.push({ segment: refs[0].segment, reversed: firstRev as boolean })
  let cursor = orient(segs[0], firstRev as boolean)[1]
  for (let k = 1; k < refs.length; k++) {
    const s = segs[k]
    let rev = refs[k].reversed
    if (rev === null) {
      if (distance(cursor, s.p0) <= JOIN_TOL) rev = false
      else if (distance(cursor, segEnd(s)) <= JOIN_TOL) rev = true
      else fail(`: "${refs[k].segment}" does not connect to the previous segment`)
    }
    const [a, b] = orient(s, rev as boolean)
    if (distance(cursor, a) > JOIN_TOL) fail(`: gap before "${refs[k].segment}"`)
    out.push({ segment: refs[k].segment, reversed: rev as boolean })
    cursor = b
  }
  const start = orient(segs[0], out[0].reversed)[0]
  if (distance(cursor, start) > JOIN_TOL) fail('outline is not closed')
  return out
}

/** The closed outline of a piece as a Path (reversed segments keep their ids). */
export const piecePath = (draft: Draft, pieceId: string): Path => {
  const piece = draft.pieces.find((p) => p.id === pieceId)
  if (!piece) throw new Error(`piecePath: unknown piece "${pieceId}"`)
  return path(
    piece.outline.map((r) => {
      const s = draft.segments[r.segment]
      if (!s) throw new Error(`piecePath: unknown segment "${r.segment}"`)
      const plain = stripMeta(s)
      return r.reversed ? reverseSegment(plain) : plain
    }),
    true,
  )
}

/** Drop the from/to/role tags, returning a bare Segment. */
export const stripMeta = (s: DraftSegment): Segment =>
  s.kind === 'line' ? line(s.id, s.p0, s.p1) : cubic(s.id, s.p0, s.p1, s.p2, s.p3)
