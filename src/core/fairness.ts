/**
 * Fairness of a drafted curve (a chain of segments): how its signed curvature behaves along the
 * arc length. A fair armhole / neckline bends one way only (no inflection), has no visible jump in
 * curvature where two Béziers meet (G2 or close to it) and a curvature that rises and falls once,
 * like a stroke of a French curve.
 *
 * Curvature is κ = (B′ × B″) / |B′|³ (1/mm, positive when the curve turns clockwise on screen, i.e.
 * towards +y from +x, because y grows downwards). Lines have κ = 0.
 */
import { bezierDerivative, bezierLength, bezierSecondDerivative, type CubicBezier } from './bezier'
import type { Segment } from './path'
import { segmentLength } from './path'
import { cross, length } from './vec'

/** Signed curvature of a cubic at parameter t (1/mm). Degenerate ends are sampled just inside. */
export function bezierCurvature(b: CubicBezier, t: number): number {
  const at = (u: number) => {
    const d1 = bezierDerivative(b, u)
    const sp = length(d1)
    return { sp, k: sp < 1e-12 ? NaN : cross(d1, bezierSecondDerivative(b, u)) / sp ** 3 }
  }
  let r = at(t)
  // A zero-length handle makes B′ vanish at the end: take the limit from inside.
  for (let i = 0; Number.isNaN(r.k) && i < 6; i++) {
    const nudge = 10 ** -(6 - i)
    r = at(t <= 0.5 ? t + nudge : t - nudge)
  }
  return Number.isNaN(r.k) ? 0 : r.k
}

export const segmentCurvature = (s: Segment, t: number): number =>
  s.kind === 'line' ? 0 : bezierCurvature(s, t)

export interface CurvatureSample {
  /** Arc length from the start of the chain (mm). */
  readonly s: number
  /** Signed curvature (1/mm). */
  readonly k: number
  /** Index of the segment in the chain. */
  readonly segment: number
}

/** Signed curvature every ≈ `step` mm along a chain (both ends of every segment included). */
export function curvatureProfile(segs: readonly Segment[], step = 1): CurvatureSample[] {
  const out: CurvatureSample[] = []
  let before = 0
  segs.forEach((seg, i) => {
    const len = segmentLength(seg)
    const n = Math.max(8, Math.ceil(len / step))
    for (let j = 0; j <= n; j++) {
      const t = j / n
      const s = seg.kind === 'line' ? t * len : bezierLength(seg, 0, t)
      out.push({ s: before + s, k: segmentCurvature(seg, t), segment: i })
    }
    before += len
  })
  return out
}

export interface JoinCurvature {
  /** Index of the segment that ends at the join (the next one starts there). */
  readonly index: number
  /** Arc length of the join from the start of the chain (mm). */
  readonly s: number
  /** Curvature at the end of segment `index` and at the start of `index + 1` (1/mm). */
  readonly before: number
  readonly after: number
  /** |after − before| / max(|before|, |after|, flat): 0 = G2, 1 = from straight to curved. */
  readonly jump: number
}

export interface FairnessReport {
  readonly length: number
  /** Sign changes of the curvature (ignoring |κ| below the tolerance). */
  readonly inflections: number
  /** Arc lengths (mm) where the curvature changes sign. */
  readonly inflectionsAt: readonly number[]
  readonly joins: readonly JoinCurvature[]
  /** Largest relative curvature jump at an internal join (0 when there are none). */
  readonly maxJoinJump: number
  /** Tightest and widest radius along the chain (mm; Infinity where straight). */
  readonly minRadius: number
  readonly maxRadius: number
  /** Arc length (mm) of the tightest point. */
  readonly minRadiusAt: number
  /** Local maxima of |κ| (a fair armhole has one; a French-curve stroke one or none). */
  readonly peaks: number
}

export interface FairnessOptions {
  /** Sampling step along the chain (mm). */
  readonly step?: number
  /**
   * Curvatures with |κ| below max(absTolerance, relTolerance × max|κ|) count as straight: they
   * neither make nor break an inflection.
   */
  readonly absTolerance?: number
  readonly relTolerance?: number
  /**
   * Floor of the denominator of the relative join jump (1/mm): joins on nearly straight stretches
   * (R ≥ 1/flat) are compared against this instead of their own tiny curvature.
   */
  readonly flatCurvature?: number
}

export const FAIRNESS_DEFAULTS = {
  step: 1,
  absTolerance: 1e-4,
  relTolerance: 0.01,
  flatCurvature: 1 / 2000,
} as const

/** Fairness metrics of a chain of segments (see FairnessReport). */
export function curveFairness(
  segs: readonly Segment[],
  options: FairnessOptions = {},
): FairnessReport {
  const o = { ...FAIRNESS_DEFAULTS, ...options }
  const prof = curvatureProfile(segs, o.step)
  const maxAbs = Math.max(0, ...prof.map((p) => Math.abs(p.k)))
  const tol = Math.max(o.absTolerance, o.relTolerance * maxAbs)

  const inflectionsAt: number[] = []
  let sign = 0
  let lastS = 0
  for (const p of prof) {
    if (Math.abs(p.k) < tol) continue
    const sg = Math.sign(p.k)
    if (sign !== 0 && sg !== sign) inflectionsAt.push((lastS + p.s) / 2)
    sign = sg
    lastS = p.s
  }

  const joins: JoinCurvature[] = []
  let before = 0
  for (let i = 0; i < segs.length - 1; i++) {
    before += segmentLength(segs[i])
    const k0 = segmentCurvature(segs[i], 1)
    const k1 = segmentCurvature(segs[i + 1], 0)
    const den = Math.max(Math.abs(k0), Math.abs(k1), o.flatCurvature)
    joins.push({ index: i, s: before, before: k0, after: k1, jump: Math.abs(k1 - k0) / den })
  }

  let minR = Infinity
  let maxR = 0
  let minRadiusAt = 0
  for (const p of prof) {
    const r = Math.abs(p.k) < 1e-12 ? Infinity : 1 / Math.abs(p.k)
    if (r < minR) {
      minR = r
      minRadiusAt = p.s
    }
    if (r > maxR) maxR = r
  }

  // Peaks of |κ|, after merging the duplicate samples at joins and ignoring wiggles < 2 % of max.
  const ks = prof.map((p) => Math.abs(p.k))
  const prominence = 0.02 * maxAbs
  let peaks = 0
  let rising = true
  let lo = ks[0] ?? 0
  let hi = ks[0] ?? 0
  for (const k of ks) {
    if (rising) {
      if (k > hi) hi = k
      else if (hi - k > prominence) {
        peaks++
        rising = false
        lo = k
      }
    } else if (k < lo) lo = k
    else if (k - lo > prominence) {
      rising = true
      hi = k
    }
  }
  if (rising && hi - lo > prominence) peaks++

  return {
    length: prof.length ? prof[prof.length - 1].s : 0,
    inflections: inflectionsAt.length,
    inflectionsAt,
    joins,
    maxJoinJump: Math.max(0, ...joins.map((j) => j.jump)),
    minRadius: minR,
    maxRadius: maxR,
    minRadiusAt,
    peaks,
  }
}
