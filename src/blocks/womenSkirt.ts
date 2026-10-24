/**
 * Women's base skirt ("falda base / falda recta"), front + back with one waist dart per piece.
 *
 * Method: Fashion Patrón, "2.13 Patrón falda base, trazado con explicación detallada" (Seamly2D,
 * points A…A29, half body in one box: back on the left, front on the right). The darts are trued
 * so each waist quarter measures exactly waist/4 + ease/4. Every step, formula and choice is
 * documented in docs/blocks/women-skirt.md.
 *
 * Frame: one combined box, centre back at x = 0, centre front at x = W, y down, A at the centre
 * back waist (waist line y = 0, hip line y = hip depth, hem y = skirt length). Units: mm.
 */
import {
  DraftBuilder,
  add,
  dot,
  midpoint,
  neg,
  normalize,
  perp,
  scale,
  segmentLength,
  sub,
  vec,
  curveWithTangents,
  type Draft,
  type PieceMark,
  type Vec,
} from '../core'
import type { WomenKey } from '../data'

export type WomenSkirtMeasurementKey = Extract<
  WomenKey,
  'waist' | 'hip' | 'hipDepth' | 'skirtLength'
>

export type WomenSkirtMeasurements = Readonly<Record<WomenSkirtMeasurementKey, number>>

export interface WomenSkirtOptions {
  /** Total hip ease (method: 2–3 cm; 3 cm used in the lesson). */
  readonly hipEase: number
  /** Total waist ease (method: 2 cm). */
  readonly waistEase: number
  /** Share of the half-body suppression taken by the side seam (both sides together). */
  readonly sideShare: number
  /** Side seam moved towards the front at the hip (method: optional 1 cm). */
  readonly sideSeamShift: number
}

export const WOMEN_SKIRT_DEFAULTS: WomenSkirtOptions = {
  hipEase: 30,
  waistEase: 20,
  sideShare: 0.5,
  sideSeamShift: 0,
}

/** Fixed construction distances of the method (mm). */
export const WOMEN_SKIRT_CONSTANTS = {
  /** A11: the side hip curve ends this far above the hip line. */
  hipCurveAboveHip: 20,
  /** A12–A14: the side seam is raised at the waist. */
  sideRaise: 10,
  /** A17, A18: outward hip curve at the middle of the side line. */
  hipCurveBulge: 10,
  /** A19: back dart axis = middle of the back hip − this (towards centre back). */
  backDartShift: 15,
  /** A23: back dart apex above the hip line. */
  backDartApexAboveHip: 40,
  /** A25: front dart axis at this share of the front waist from centre front. */
  frontDartPosition: 0.4,
  /** A29: front dart apex above the hip line. */
  frontDartApexAboveHip: 80,
  /** A24: centre back waist lowered. */
  backWaistDrop: 10,
} as const

/** Segment ids of the seams (stable for every size). */
export const WOMEN_SKIRT_SEAMS = {
  back: {
    waist: ['back.waist.0', 'back.waist.1'],
    dartOpening: 'back.waist.dart',
    side: ['back.side', 'back.sideHip.1', 'back.sideHip.0'],
    hem: 'back.hem',
    cb: 'back.cb',
  },
  front: {
    waist: ['front.waist.0', 'front.waist.1'],
    dartOpening: 'front.waist.dart',
    side: ['front.side', 'front.sideHip.1', 'front.sideHip.0'],
    hem: 'front.hem',
    cf: 'front.cf',
  },
} as const

const RIGHT = vec(1, 0)
const LEFT = vec(-1, 0)
const DOWN = vec(0, 1)

/** Unit normal of the line a→b that points away from `ref`. */
const normalAway = (a: Vec, b: Vec, ref: Vec): Vec => {
  const n = perp(normalize(sub(b, a)))
  return dot(n, sub(ref, a)) > 0 ? neg(n) : n
}

/** Bisection for the dart width d in [0, max] such that waistLength(d) = target (decreasing). */
const solveDart = (waistLength: (d: number) => number, target: number, max: number): number => {
  let lo = 0
  let hi = max
  if (waistLength(lo) < target || waistLength(hi) > target)
    throw new Error('draftWomenSkirt: cannot true the waist (check the measurements)')
  for (let i = 0; i < 60 && hi - lo > 1e-9; i++) {
    const mid = (lo + hi) / 2
    if (waistLength(mid) > target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Draft the women's base skirt. `measurements` are in mm (getMeasurements of the
 * co-women-industrial table); options fall back to WOMEN_SKIRT_DEFAULTS.
 */
export function draftWomenSkirt(
  measurements: WomenSkirtMeasurements,
  options: Partial<WomenSkirtOptions> = {},
): Draft {
  const m = measurements
  const o: WomenSkirtOptions = { ...WOMEN_SKIRT_DEFAULTS, ...options }
  const C = WOMEN_SKIRT_CONSTANTS
  const b = new DraftBuilder()
  const P = (name: string, p: Vec) => b.point(name, p)

  // ---- 1. Box: half hip wide, skirt length long ----
  const W = m.hip / 2 + o.hipEase / 2
  const L = m.skirtLength
  const hipY = m.hipDepth
  P('A', vec(0, 0))
  P('A1', vec(0, L))
  P('A2', vec(0, hipY))
  P('A3', vec(W, hipY))
  P('A4', vec(W, L))
  const A5 = P('A5', vec(W / 2 + o.sideSeamShift, hipY))
  const A6 = P('A6', vec(W, 0))
  P('A7', vec(A5.x, L))
  const A8 = P('A8', vec(A5.x, 0))

  // ---- 2. Waist suppression: half body (hip + ease − waist − ease)/2 ----
  const D = (m.hip + o.hipEase - (m.waist + o.waistEase)) / 2
  const side = (o.sideShare * D) / 2 // taken at EACH side of A8
  const A9 = P('A9', vec(A8.x + side, 0))
  const A10 = P('A10', vec(A8.x - side, 0))

  // ---- 3. Side seam: raised 1 cm at the waist, hip curve down to 2 cm above the hip ----
  const A11 = P('A11', vec(A5.x, hipY - C.hipCurveAboveHip))
  P('A12', vec(A8.x, -C.sideRaise))
  const A13 = P('A13', vec(A9.x, -C.sideRaise))
  const A14 = P('A14', vec(A10.x, -C.sideRaise))
  const A15 = P('A15', midpoint(A9, A11))
  const A16 = P('A16', midpoint(A10, A11))
  const A17 = P('A17', add(A15, scale(normalAway(A9, A11, A6), C.hipCurveBulge)))
  const A18 = P('A18', add(A16, scale(normalAway(A10, A11, vec(0, 0)), C.hipCurveBulge)))

  const frontSide = b.smoothWithTangents(
    'front.sideHip',
    ['A13', 'A17', 'A11'],
    normalize(sub(A17, A13)),
    DOWN,
  )
  const backSide = b.smoothWithTangents(
    'back.sideHip',
    ['A14', 'A18', 'A11'],
    normalize(sub(A18, A14)),
    DOWN,
  )
  // Waist leaves the side seam at a right angle.
  const frontWaistStart = normalAway(A13, frontSide[0].p1, A8) // towards centre front
  const backWaistStart = normalAway(A14, backSide[0].p1, A8) // towards centre back

  // ---- 4. Back dart (axis near the middle of the back hip) and centre back drop ----
  const quarterWaist = m.waist / 4 + o.waistEase / 4
  const A19 = P('A19', vec(A5.x / 2 - C.backDartShift, hipY))
  const A20 = P('A20', vec(A19.x, 0))
  P('A23', vec(A19.x, hipY - C.backDartApexAboveHip))
  const A24 = P('A24', vec(0, C.backWaistDrop))
  const backWaist = (d: number) => {
    const A21 = vec(A20.x + d / 2, 0)
    const A22 = vec(A20.x - d / 2, 0)
    const w0 = curveWithTangents('w0', A14, backWaistStart, A21, LEFT)
    const w1 = curveWithTangents('w1', A22, LEFT, A24, LEFT)
    return segmentLength(w0) + segmentLength(w1)
  }
  const backDart = solveDart(backWaist, quarterWaist, 2 * (A10.x - A20.x))
  P('A21', vec(A20.x + backDart / 2, 0))
  P('A22', vec(A20.x - backDart / 2, 0))

  // ---- 5. Front dart (axis at 40 % of the front waist from centre front) ----
  const A25 = P('A25', vec(W - C.frontDartPosition * (W - A9.x), 0))
  const A26 = P('A26', vec(A25.x, hipY))
  P('A29', vec(A26.x, hipY - C.frontDartApexAboveHip))
  const frontWaist = (d: number) => {
    const A27 = vec(A25.x - d / 2, 0)
    const A28 = vec(A25.x + d / 2, 0)
    const w0 = curveWithTangents('w0', A13, frontWaistStart, A27, RIGHT)
    return segmentLength(w0) + (A6.x - A28.x)
  }
  const frontDart = solveDart(frontWaist, quarterWaist, 2 * (A25.x - A9.x))
  P('A27', vec(A25.x - frontDart / 2, 0))
  P('A28', vec(A25.x + frontDart / 2, 0))

  // =================== segments ===================
  b.line('c.waist', 'A', 'A6')
  b.line('c.hip', 'A2', 'A3')
  b.line('c.cb', 'A', 'A1')
  b.line('c.sideLine', 'A8', 'A7')
  b.line('c.sideRaise', 'A14', 'A13')
  b.line('c.frontSideRef', 'A9', 'A11')
  b.line('c.backSideRef', 'A10', 'A11')
  b.line('c.frontBulge', 'A15', 'A17')
  b.line('c.backBulge', 'A16', 'A18')
  b.line('c.backDartAxis', 'A20', 'A19')
  b.line('c.frontDartAxis', 'A25', 'A26')

  // Back
  b.line('back.cb', 'A24', 'A1')
  b.line('back.hem', 'A1', 'A7')
  b.line('back.side', 'A7', 'A11')
  b.curveWithTangents('back.waist.0', 'A14', backWaistStart, 'A21', LEFT)
  b.line('back.waist.dart', 'A21', 'A22')
  b.curveWithTangents('back.waist.1', 'A22', LEFT, 'A24', LEFT)
  b.line('back.dart.left', 'A22', 'A23')
  b.line('back.dart.right', 'A21', 'A23')

  // Front
  b.line('front.cf', 'A6', 'A4')
  b.line('front.hem', 'A4', 'A7')
  b.line('front.side', 'A7', 'A11')
  b.curveWithTangents('front.waist.0', 'A13', frontWaistStart, 'A27', RIGHT)
  b.line('front.waist.dart', 'A27', 'A28')
  b.line('front.waist.1', 'A28', 'A6')
  b.line('front.dart.left', 'A27', 'A29')
  b.line('front.dart.right', 'A28', 'A29')

  // Grainlines (parallel to centre back / centre front).
  const backGrainX = A20.x / 2
  const backGrain = [vec(backGrainX, 60), vec(backGrainX, L - 60)] as const
  b.line('back.grain', backGrain[0], backGrain[1])
  const frontGrainX = (A25.x + W) / 2
  const frontGrain = [vec(frontGrainX, 60), vec(frontGrainX, L - 60)] as const
  b.line('front.grain', frontGrain[0], frontGrain[1])

  const grainMark = (pieceId: string, seg: string, ends: readonly [Vec, Vec]): PieceMark => ({
    id: `${pieceId}.grainline`,
    kind: 'grainline',
    at: scale(add(ends[0], ends[1]), 0.5),
    data: { segment: seg },
  })
  const hipNotch = (pieceId: string): PieceMark => ({
    id: `${pieceId}.notch.hip`,
    kind: 'notch',
    at: A5,
    data: { count: 1, matches: 'hip' },
  })

  // =================== pieces ===================
  b.piece(
    'back',
    'Espalda',
    [
      WOMEN_SKIRT_SEAMS.back.cb,
      WOMEN_SKIRT_SEAMS.back.hem,
      ...WOMEN_SKIRT_SEAMS.back.side,
      WOMEN_SKIRT_SEAMS.back.waist[0],
      WOMEN_SKIRT_SEAMS.back.dartOpening,
      WOMEN_SKIRT_SEAMS.back.waist[1],
    ],
    {
      internalLines: ['back.dart.left', 'back.dart.right', 'back.grain'],
      marks: [grainMark('back', 'back.grain', backGrain), hipNotch('back')],
    },
  )
  b.piece(
    'front',
    'Delantero',
    [
      WOMEN_SKIRT_SEAMS.front.cf,
      WOMEN_SKIRT_SEAMS.front.hem,
      ...WOMEN_SKIRT_SEAMS.front.side,
      WOMEN_SKIRT_SEAMS.front.waist[0],
      WOMEN_SKIRT_SEAMS.front.dartOpening,
      WOMEN_SKIRT_SEAMS.front.waist[1],
    ],
    {
      internalLines: ['front.dart.left', 'front.dart.right', 'front.grain'],
      marks: [grainMark('front', 'front.grain', frontGrain), hipNotch('front')],
    },
  )

  return b.build()
}

// =================== measurements of the result ===================

export interface WomenSkirtMetrics {
  /** Side seam length per piece (waist to hem), mm. */
  readonly sideSeam: { readonly front: number; readonly back: number }
  /** Waist seam length per piece with the dart closed (opening excluded), mm. */
  readonly waist: { readonly front: number; readonly back: number }
  /** Hip line per piece (centre to side seam), mm. */
  readonly hip: { readonly front: number; readonly back: number }
  readonly darts: { readonly front: number; readonly back: number }
}

export function measureWomenSkirt(draft: Draft): WomenSkirtMetrics {
  const len = (id: string) => {
    const s = draft.segments[id]
    if (!s) throw new Error(`measureWomenSkirt: missing segment "${id}"`)
    return segmentLength(s)
  }
  const pt = (n: string) => {
    const v = draft.points[n]
    if (!v) throw new Error(`measureWomenSkirt: missing point "${n}"`)
    return v
  }
  const sum = (ids: readonly string[]) => ids.reduce((s, id) => s + len(id), 0)
  const S = WOMEN_SKIRT_SEAMS
  return {
    sideSeam: { front: sum(S.front.side), back: sum(S.back.side) },
    waist: {
      front: len(S.front.waist[0]) + len(S.front.waist[1]),
      back: len(S.back.waist[0]) + len(S.back.waist[1]),
    },
    hip: { front: pt('A3').x - pt('A5').x, back: pt('A5').x - pt('A2').x },
    darts: { front: len(S.front.dartOpening), back: len(S.back.dartOpening) },
  }
}
