/**
 * Helpers shared by the trouser blocks (womenTrousers, menTrousers): leg seam curves, a bisection
 * solver for truing seams, and measurement of the resulting draft.
 *
 * Both blocks use the same frame: crease line at x = 0 (the grainline), waist line at y = 0, y
 * down, side seams towards −x and the crotch towards +x. Front and back are drafted on top of each
 * other on that frame. Units: mm.
 */
import {
  curveWithTangents,
  flattenPath,
  normalize,
  piecePath,
  segmentLength,
  sub,
  vec,
  type CubicBezier,
  type Draft,
  type Vec,
} from '../core'

export const DOWN = vec(0, 1)

/** Crotch point → knee: leaves along the chord, arrives along the lower leg (knee → hem). */
export const inseamCurve = (id: string, crotch: Vec, knee: Vec, hem: Vec): CubicBezier =>
  curveWithTangents(id, crotch, normalize(sub(knee, crotch)), knee, normalize(sub(hem, knee)))

/** Hip → knee on the side seam: vertical at the hip, along the lower leg at the knee. */
export const outseamLegCurve = (id: string, hip: Vec, knee: Vec, hem: Vec): CubicBezier =>
  curveWithTangents(id, hip, DOWN, knee, normalize(sub(hem, knee)))

/** Waist → hip on the side seam: leaves along the chord and reaches the hip vertically. */
export const outseamHipCurve = (id: string, waist: Vec, hip: Vec): CubicBezier =>
  curveWithTangents(id, waist, normalize(sub(hip, waist)), hip, DOWN)

/**
 * Root of a continuous function that changes sign on [lo, hi] (bisection, 1e-9 mm).
 * Throws with `what` when the bracket does not contain a sign change.
 */
export function bisect(f: (x: number) => number, lo: number, hi: number, what: string): number {
  let a = lo
  let b = hi
  let fa = f(a)
  const fb = f(b)
  if (fa === 0) return a
  if (fb === 0) return b
  if (Math.sign(fa) === Math.sign(fb))
    throw new Error(`${what}: no solution in [${lo.toFixed(2)}, ${hi.toFixed(2)}]`)
  for (let i = 0; i < 200 && b - a > 1e-9; i++) {
    const m = (a + b) / 2
    const fm = f(m)
    if (fm === 0) return m
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m
      fa = fm
    } else b = m
  }
  return (a + b) / 2
}

/** Point names of one piece used to measure widths. */
export interface TrouserLandmarks {
  readonly hipSide: string
  readonly hipCentre: string
  readonly kneeOut: string
  readonly kneeIn: string
  readonly hemOut: string
  readonly hemIn: string
}

export interface TrouserPieceMetrics {
  /** Crotch point → hem along the inseam. */
  readonly inseam: number
  /** Waist → hem along the side seam. */
  readonly outseam: number
  /** Waist seam with the darts closed (dart openings excluded). */
  readonly waist: number
  /** Sum of the dart openings at the waist. */
  readonly darts: number
  /** Hip line, centre front/back to side seam (horizontal). */
  readonly hip: number
  readonly knee: number
  readonly hem: number
  /** Centre front/back seam: centre line plus the crotch curve. */
  readonly crotchSeam: number
  /** Leg width on the crotch line (outline span at that height). */
  readonly crotchLineWidth: number
}

export interface TrouserMetrics {
  readonly front: TrouserPieceMetrics
  readonly back: TrouserPieceMetrics
}

/** Horizontal span of a closed outline at height y (max − min of the crossings). */
export function outlineSpanAt(draft: Draft, pieceId: string, y: number): number {
  const pts = flattenPath(piecePath(draft, pieceId), 0.01)
  const xs: number[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y)
      xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
  }
  if (xs.length < 2) throw new Error(`outlineSpanAt: "${pieceId}" does not cross y = ${y}`)
  return Math.max(...xs) - Math.min(...xs)
}

/**
 * Seam lengths and widths of a trouser draft. Segment ids follow the trouser convention:
 * `${piece}.inseam.*`, `${piece}.outseam.*`, `${piece}.waist.*` (openings contain "dart"),
 * `${piece}.crotch.*` and the straight centre line `front.cf` / `back.cb`.
 */
export function measureTrousers(
  draft: Draft,
  landmarks: { readonly front: TrouserLandmarks; readonly back: TrouserLandmarks },
  crotchLineY: number,
): TrouserMetrics {
  const pt = (n: string) => {
    const v = draft.points[n]
    if (!v) throw new Error(`measureTrousers: missing point "${n}"`)
    return v
  }
  const ids = Object.keys(draft.segments)
  const sum = (pred: (id: string) => boolean) =>
    ids.filter(pred).reduce((s, id) => s + segmentLength(draft.segments[id]), 0)
  const piece = (p: 'front' | 'back', centre: string): TrouserPieceMetrics => {
    const L = landmarks[p]
    const has = (part: string) => (id: string) => id.startsWith(`${p}.${part}`)
    return {
      inseam: sum(has('inseam')),
      outseam: sum(has('outseam')),
      waist: sum((id) => has('waist')(id) && !id.includes('dart')),
      darts: sum((id) => has('waist')(id) && id.includes('dart')),
      hip: Math.abs(pt(L.hipCentre).x - pt(L.hipSide).x),
      knee: Math.abs(pt(L.kneeIn).x - pt(L.kneeOut).x),
      hem: Math.abs(pt(L.hemIn).x - pt(L.hemOut).x),
      crotchSeam: sum((id) => has('crotch')(id) || id === `${p}.${centre}`),
      crotchLineWidth: outlineSpanAt(draft, p, crotchLineY),
    }
  }
  return { front: piece('front', 'cf'), back: piece('back', 'cb') }
}
