/**
 * Women's base bodice block ("cuerpo base / base de blusa"), front + back with bust and waist darts.
 *
 * Method: Fashion Patrón, "Patrón base cuerpo mujer" (Seamly2D, points A…A55). Steps A–A30 follow
 * the published instructions; A31–A55 (waist, darts, hip) are reconstructed from the published
 * figure. Every step, formula and choice is documented in docs/blocks/women-bodice.md.
 *
 * Frame: one combined construction box, back on the left (centre back at x = 0) and front on the
 * right (centre front at x = W), y down, A at the back neck level. Units: mm.
 */
import {
  DraftBuilder,
  add,
  circleCircleIntersections,
  distance,
  lineLineIntersection,
  neg,
  normalize,
  perp,
  pointAlong,
  scale,
  segmentLength,
  sub,
  vec,
  type Draft,
  type PieceMark,
  type Vec,
} from '../core'
import type { WomenKey } from '../data'

/** Measurements the block reads (mm, as returned by getMeasurements for co-women-industrial). */
export type WomenBodiceMeasurementKey = Extract<
  WomenKey,
  | 'bust'
  | 'waist'
  | 'hip'
  | 'shoulderLength'
  | 'hipDepth'
  | 'bustDepth'
  | 'neck'
  | 'frontWaistLength'
  | 'backWaistLength'
  | 'halfChestWidth'
  | 'halfBackWidth'
  | 'halfBustSpan'
>

export type WomenBodiceMeasurements = Readonly<Record<WomenBodiceMeasurementKey, number>>

/** Ease (holgura) in mm. bust, waist and hip are totals over the whole body. */
export interface WomenBodiceEase {
  /** Total bust ease. Method: box = pecho/2 + 1 cm → 20 mm in total. */
  readonly bust: number
  /** Total waist ease (waist/4 + waist ease/4 per quarter after darts). */
  readonly waist: number
  /** Total hip ease. */
  readonly hip: number
  /** Added to the half back width (method: + 0.55 cm). */
  readonly backWidth: number
  /** Added to the half chest width (method: + 0.45 cm). */
  readonly chestWidth: number
  /** Added to neck/6 for the neck width (method: + 0.5 cm). */
  readonly neckWidth: number
}

/** Armhole depth from the back neck line: the two formulas the method gives. */
export type ArmholeDepthFormula = 'bust/6+6' | 'bust/10+10.5+neck/18'

export interface WomenBodiceOptions {
  /** Block length: to the waist or to the hip line. */
  readonly length: 'waist' | 'hip'
  readonly ease: WomenBodiceEase
  readonly armholeDepth: ArmholeDepthFormula
  /** A16 is the mid point of the underarm minus this amount towards the back (method: 0.7 cm). */
  readonly sideSeamShift: number
  /** Share of the half-body waist suppression taken at EACH side seam (rest goes to the darts). */
  readonly waistSideShare: number
}

export type WomenBodiceOptionsInput = Partial<Omit<WomenBodiceOptions, 'ease'>> & {
  readonly ease?: Partial<WomenBodiceEase>
}

export const WOMEN_BODICE_DEFAULTS: WomenBodiceOptions = {
  length: 'hip',
  ease: { bust: 20, waist: 20, hip: 20, backWidth: 5.5, chestWidth: 4.5, neckWidth: 5 },
  armholeDepth: 'bust/6+6',
  sideSeamShift: 7,
  waistSideShare: 0.25,
}

/** Fixed construction distances (mm), read from the method's figure. */
export const WOMEN_BODICE_CONSTANTS = {
  /** Back dart top apex (A44) below the chest/armhole line. */
  backDartApexBelowChest: 20,
  /** Front waist dart top apex (A50) below the bust point. */
  frontDartApexBelowBust: 30,
  /** Lower dart apexes (A45, A51) above the hip line. */
  dartApexAboveHip: 50,
  /** Front neck depth = neck width + this (method: + 1 cm). */
  frontNeckExtraDepth: 10,
  /** Back armhole control A20 = |A12A19|/3 + this (method: + 2 cm). */
  backArmholeControl: 20,
  /** Front armhole control A29 = (|A12A19| − this)/3 (method: − 1 cm). */
  frontArmholeControl: 10,
  /** Bisector points: A21 = |A12A13|·0.2 + 3 mm, A30 = |A12A13|·0.2 − 3 mm. */
  armholeBisectorFactor: 0.2,
  armholeBisectorOffset: 3,
} as const

/** Segment ids of the seams, shared by every size (stable ids). */
export const WOMEN_BODICE_SEAMS = {
  back: {
    armhole: ['back.armhole.0', 'back.armhole.1', 'back.armhole.2'],
    shoulder: 'back.shoulder',
    side: ['back.side'],
    sideHip: 'back.sideHip',
    waist: 'back.waist',
  },
  front: {
    armhole: ['front.armhole.0', 'front.armhole.1', 'front.armhole.2'],
    shoulder: 'front.shoulder',
    side: ['front.side', 'front.sideLower'],
    sideHip: 'front.sideHip',
    waist: 'front.waist',
  },
} as const

const mergeOptions = (o: WomenBodiceOptionsInput = {}): WomenBodiceOptions => ({
  ...WOMEN_BODICE_DEFAULTS,
  ...o,
  ease: { ...WOMEN_BODICE_DEFAULTS.ease, ...o.ease },
})

/** Unit bisector of the angle a–vertex–b. */
const bisector = (a: Vec, vertex: Vec, b: Vec): Vec =>
  normalize(add(normalize(sub(a, vertex)), normalize(sub(b, vertex))))

const must = <T>(v: T | null | undefined, what: string): T => {
  if (v === null || v === undefined) throw new Error(`draftWomenBodice: cannot construct ${what}`)
  return v
}

/**
 * Draft the women's base bodice. `measurements` are in mm (getMeasurements of the
 * co-women-industrial table); options fall back to WOMEN_BODICE_DEFAULTS.
 */
export function draftWomenBodice(
  measurements: WomenBodiceMeasurements,
  options: WomenBodiceOptionsInput = {},
): Draft {
  const m = measurements
  const o = mergeOptions(options)
  const e = o.ease
  const C = WOMEN_BODICE_CONSTANTS
  const hip = o.length === 'hip'
  const b = new DraftBuilder()
  const P = (name: string, p: Vec) => b.point(name, p)

  // ---- 1. Construction box (caja base) ----
  const W = m.bust / 2 + e.bust / 2 // half body width = half back + half front
  const waistY = m.backWaistLength
  const hipY = waistY + m.hipDepth
  P('A', vec(0, 0))
  P('A1', vec(W, 0))
  const A2 = P('A2', vec(0, waistY))
  P('A3', vec(0, hipY))
  const A4 = P('A4', vec(W, waistY))
  P('A5', vec(W, hipY))

  // ---- 2. Back neckline ----
  const neckW = m.neck / 6 + e.neckWidth
  const A6 = P('A6', vec(neckW, 0))
  const A7 = P('A7', vec(0, neckW / 3))
  P('A8', vec(A6.x, A7.y))

  // ---- 3. Armhole depth (chest line) ----
  const depth = o.armholeDepth === 'bust/6+6' ? m.bust / 6 + 60 : m.bust / 10 + 105 + m.neck / 18
  P('A9', vec(0, depth))
  P('A10', vec(W, depth))

  // ---- 4. Back shoulder: arc from A2 (radius |A2A6|) ∩ arc from A6 (radius shoulder) ----
  const A11 = P(
    'A11',
    must(
      circleCircleIntersections(A2, distance(A2, A6), A6, m.shoulderLength).find((q) => q.x > A6.x),
      'A11 (back shoulder point)',
    ),
  )

  // ---- 5. Back width, chest width, underarm split ----
  const A12 = P('A12', vec(m.halfBackWidth + e.backWidth, depth))
  const A13 = P('A13', vec(W - (m.halfChestWidth + e.chestWidth), depth))
  P('A14', vec(A12.x, 0))
  P('A15', vec(A13.x, 0))
  const underarm = A13.x - A12.x
  const A16 = P('A16', vec(A12.x + underarm / 2 - o.sideSeamShift, depth))

  // ---- 6. Back armhole control points ----
  const A19 = P('A19', vec(A12.x, A11.y))
  const backArmholeHeight = distance(A12, A19)
  const A20 = P('A20', vec(A12.x, depth - (backArmholeHeight / 3 + C.backArmholeControl)))
  P(
    'A21',
    add(
      A12,
      scale(bisector(A20, A12, A16), underarm * C.armholeBisectorFactor + C.armholeBisectorOffset),
    ),
  )

  // ---- 7. Front neckline ----
  const A22 = P('A22', vec(W, waistY - m.frontWaistLength))
  const A23 = P('A23', vec(W - neckW, A22.y))
  const A24 = P('A24', vec(W, A22.y + neckW + C.frontNeckExtraDepth))
  P('A25', vec(A23.x, A24.y))

  // ---- 8. Front shoulder: arc from A4 (radius |A4A23|) ∩ arc from A23 (radius shoulder) ----
  const A26 = P(
    'A26',
    must(
      circleCircleIntersections(A4, distance(A4, A23), A23, m.shoulderLength).find(
        (q) => q.x < A23.x,
      ),
      'A26 (front shoulder point)',
    ),
  )

  // ---- 9. Front armhole: raised by the bust dart (front − back waist length) ----
  const bustDart = m.frontWaistLength - m.backWaistLength
  const A27 = P('A27', vec(A16.x, depth - bustDart))
  const A28 = P('A28', vec(A13.x, A27.y))
  const A29 = P('A29', vec(A13.x, A28.y - (backArmholeHeight - C.frontArmholeControl) / 3))
  P(
    'A30',
    add(
      A28,
      scale(bisector(A27, A28, A29), underarm * C.armholeBisectorFactor - C.armholeBisectorOffset),
    ),
  )

  // ---- 10. Waist: side suppression and dart widths (per quarter = waist/4 + ease/4) ----
  const A17 = P('A17', vec(A16.x, waistY))
  const quarterWaist = m.waist / 4 + e.waist / 4
  const backExcess = A17.x - quarterWaist
  const frontExcess = W - A17.x - quarterWaist
  const sideSuppression = o.waistSideShare * (backExcess + frontExcess)
  const backDart = backExcess - sideSuppression
  const frontDart = frontExcess - sideSuppression
  const A31 = P('A31', vec(A17.x - sideSuppression, waistY))
  const A32 = P('A32', vec(A17.x + sideSuppression, waistY))

  // ---- 11. Bust point: below the bust span, at "alto de pecho" from the front neck point ----
  const A33 = P('A33', vec(W - m.halfBustSpan, depth))
  const dx = A23.x - A33.x
  if (Math.abs(dx) >= m.bustDepth) throw new Error('draftWomenBodice: bust depth too short')
  const A34 = P('A34', vec(A33.x, A23.y + Math.sqrt(m.bustDepth ** 2 - dx ** 2)))

  // ---- 12. Side bust dart on the guide line A27–A32 ----
  const A35 = P(
    'A35',
    must(lineLineIntersection(A27, A32, A34, add(A34, vec(1, 0))), 'A35 (bust level at side)'),
  )
  const A36 = P('A36', pointAlong(A35, A27, bustDart / 2))
  const A37 = P('A37', pointAlong(A35, A32, bustDart / 2))
  const bustLeg = distance(A34, A36)
  const A38 = P('A38', pointAlong(A34, A37, bustLeg)) // lower leg trued to the upper leg length
  P('A40', add(A34, scale(bisector(A36, A34, A38), bustLeg))) // dart cap

  // ---- 13. Back waist dart ----
  const A41 = P('A41', vec(A31.x / 2, waistY))
  P('A42', vec(A41.x, depth))
  P('A44', vec(A41.x, depth + C.backDartApexBelowChest))
  P('A46', vec(A41.x - backDart / 2, waistY))
  P('A47', vec(A41.x + backDart / 2, waistY))

  // ---- 14. Front waist dart (under the bust point) ----
  const A48 = P('A48', vec(A34.x, waistY))
  P('A50', vec(A34.x, A34.y + C.frontDartApexBelowBust))
  P('A52', vec(A48.x - frontDart / 2, waistY))
  P('A53', vec(A48.x + frontDart / 2, waistY))

  // ---- 15. Hip (only for the hip-length block) ----
  if (hip) {
    const A18 = P('A18', vec(A16.x, hipY))
    const hipExtension = (m.hip / 2 + e.hip / 2 - W) / 2 // same at both sides of A18
    P('A43', vec(A41.x, hipY))
    P('A45', vec(A41.x, hipY - C.dartApexAboveHip))
    P('A49', vec(A48.x, hipY))
    P('A51', vec(A48.x, hipY - C.dartApexAboveHip))
    P('A54', vec(A18.x + hipExtension, hipY))
    P('A55', vec(A18.x - hipExtension, hipY))
  }

  // =================== segments ===================
  const down = vec(0, 1)
  const right = vec(1, 0)

  // Construction lines (not part of any piece).
  b.line('c.top', 'A', 'A1')
  b.line('c.cb', 'A', 'A3')
  b.line('c.cf', 'A1', 'A5')
  b.line('c.chest', 'A9', 'A10')
  b.line('c.waist', 'A2', 'A4')
  b.line('c.hip', 'A3', 'A5')
  b.line('c.backNeck.h', 'A7', 'A8')
  b.line('c.backNeck.v', 'A8', 'A6')
  b.line('c.backShoulderRef', 'A2', 'A6')
  b.line('c.backWidth', 'A14', 'A12')
  b.line('c.chestWidth', 'A15', 'A13')
  b.line('c.backArmhole', 'A19', 'A11')
  b.line('c.side', 'A16', hip ? 'A18' : 'A17')
  b.line('c.frontTop', 'A22', 'A23')
  b.line('c.frontNeck.v', 'A23', 'A25')
  b.line('c.frontNeck.h', 'A25', 'A24')
  b.line('c.frontShoulderRef', 'A4', 'A23')
  b.line('c.raise', 'A16', 'A27')
  b.line('c.frontArmhole', 'A27', 'A28')
  b.line('c.bustDepth', 'A33', 'A34')
  b.line('c.sideGuide', 'A27', 'A32')
  b.line('c.bustDartCentre', 'A34', 'A35')
  b.line('c.backDartAxis', 'A42', hip ? 'A43' : 'A41')
  b.line('c.frontDartAxis', 'A34', hip ? 'A49' : 'A48')

  // Back
  const backShoulderDir = normalize(sub(A11, A6))
  const backSideDir = normalize(sub(A31, A16))
  b.line('back.cb', 'A7', 'A2')
  b.curveWithTangents('back.neck', 'A7', right, 'A6', neg(perp(backShoulderDir)))
  b.line('back.shoulder', 'A6', 'A11')
  b.smoothWithTangents(
    'back.armhole',
    ['A11', 'A20', 'A21', 'A16'],
    perp(backShoulderDir),
    neg(perp(backSideDir)),
  )
  b.line('back.side', 'A16', 'A31')
  b.line('back.waist', 'A2', 'A31')
  b.line('back.dart.left', 'A46', 'A44')
  b.line('back.dart.right', 'A47', 'A44')

  // Front
  const frontShoulderDir = normalize(sub(A26, A23))
  const frontSideDir = normalize(sub(A36, A27))
  b.line('front.cf', 'A24', 'A4')
  b.curveWithTangents('front.neck', 'A23', neg(perp(frontShoulderDir)), 'A24', right)
  b.line('front.shoulder', 'A23', 'A26')
  b.smoothWithTangents(
    'front.armhole',
    ['A26', 'A29', 'A30', 'A27'],
    neg(perp(frontShoulderDir)),
    perp(frontSideDir),
  )
  b.line('front.side', 'A27', 'A36')
  b.line('front.dartCap.0', 'A36', 'A40')
  b.line('front.dartCap.1', 'A40', 'A38')
  b.line('front.sideLower', 'A38', 'A32')
  b.line('front.waist', 'A32', 'A4')
  b.line('front.bustDart.upper', 'A34', 'A36')
  b.line('front.bustDart.lower', 'A34', 'A38')
  b.line('front.waistDart.left', 'A52', 'A50')
  b.line('front.waistDart.right', 'A53', 'A50')

  if (hip) {
    b.line('back.cbHip', 'A2', 'A3')
    b.curveWithTangents('back.sideHip', 'A31', down, 'A54', down)
    b.line('back.hem', 'A3', 'A54')
    b.line('back.dart.leftLow', 'A46', 'A45')
    b.line('back.dart.rightLow', 'A47', 'A45')
    b.line('front.cfHip', 'A4', 'A5')
    b.curveWithTangents('front.sideHip', 'A32', down, 'A55', down)
    b.line('front.hem', 'A55', 'A5')
    b.line('front.waistDart.leftLow', 'A52', 'A51')
    b.line('front.waistDart.rightLow', 'A53', 'A51')
  }

  // Grainlines (parallel to centre back / centre front).
  const bottom = hip ? hipY : waistY
  const backGrainX = A41.x / 2
  const backGrain = [vec(backGrainX, A7.y + 60), vec(backGrainX, bottom - 40)] as const
  b.line('back.grain', backGrain[0], backGrain[1])
  const frontGrainX = (A48.x + W) / 2
  const frontGrain = [vec(frontGrainX, A24.y + 40), vec(frontGrainX, bottom - 40)] as const
  b.line('front.grain', frontGrain[0], frontGrain[1])

  const grainMark = (pieceId: string, seg: string, ends: readonly [Vec, Vec]): PieceMark => ({
    id: `${pieceId}.grainline`,
    kind: 'grainline',
    at: scale(add(ends[0], ends[1]), 0.5),
    data: { segment: seg },
  })

  // =================== pieces ===================
  const backOutline = [
    'back.cb',
    'back.neck',
    'back.shoulder',
    ...WOMEN_BODICE_SEAMS.back.armhole,
    'back.side',
    ...(hip ? ['back.sideHip', 'back.hem', 'back.cbHip'] : ['back.waist']),
  ]
  b.piece('back', 'Espalda', backOutline, {
    internalLines: [
      'back.dart.left',
      'back.dart.right',
      ...(hip ? ['back.dart.leftLow', 'back.dart.rightLow', 'back.waist'] : []),
      'back.grain',
    ],
    marks: [grainMark('back', 'back.grain', backGrain)],
    // Hip length: a diamond (fish) dart through the waist; waist length: it opens on the waist.
    darts: [
      hip
        ? {
            id: 'back.waistDart',
            apex: 'A44',
            legs: ['back.dart.left', 'back.dart.right'],
            type: 'internal',
            apex2: 'A45',
            legs2: ['back.dart.leftLow', 'back.dart.rightLow'],
          }
        : {
            id: 'back.waistDart',
            apex: 'A44',
            legs: ['back.dart.left', 'back.dart.right'],
            type: 'edge',
          },
    ],
  })

  const frontOutline = [
    'front.cf',
    ...(hip ? ['front.cfHip', 'front.hem', 'front.sideHip'] : ['front.waist']),
    'front.sideLower',
    'front.dartCap.1',
    'front.dartCap.0',
    'front.side',
    ...[...WOMEN_BODICE_SEAMS.front.armhole].reverse(),
    'front.shoulder',
    'front.neck',
  ]
  b.piece('front', 'Delantero', frontOutline, {
    internalLines: [
      'front.bustDart.upper',
      'front.bustDart.lower',
      'front.waistDart.left',
      'front.waistDart.right',
      ...(hip ? ['front.waistDart.leftLow', 'front.waistDart.rightLow', 'front.waist'] : []),
      'front.grain',
    ],
    marks: [
      grainMark('front', 'front.grain', frontGrain),
      { id: 'front.bustPoint', kind: 'bustPoint', at: A34 },
    ],
    darts: [
      // Side bust dart: apex on the bust point, opening (with its cap) on the side seam.
      {
        id: 'front.bustDart',
        apex: 'A34',
        legs: ['front.bustDart.upper', 'front.bustDart.lower'],
        type: 'edge',
      },
      hip
        ? {
            id: 'front.waistDart',
            apex: 'A50',
            legs: ['front.waistDart.left', 'front.waistDart.right'],
            type: 'internal',
            apex2: 'A51',
            legs2: ['front.waistDart.leftLow', 'front.waistDart.rightLow'],
          }
        : {
            id: 'front.waistDart',
            apex: 'A50',
            legs: ['front.waistDart.left', 'front.waistDart.right'],
            type: 'edge',
          },
    ],
  })

  // =================== roles ===================
  b.role('centerBack', 'back.cb')
  b.role('neckline', 'back.neck', 'front.neck')
  b.role('shoulder', 'back.shoulder', 'front.shoulder')
  b.role('armhole', ...WOMEN_BODICE_SEAMS.back.armhole, ...WOMEN_BODICE_SEAMS.front.armhole)
  b.role('side', 'back.side', 'front.side', 'front.sideLower')
  b.role('dart', 'front.dartCap.0', 'front.dartCap.1')
  b.role('waist', 'back.waist', 'front.waist')
  b.role('centerFront', 'front.cf')
  b.role(
    'dart',
    'back.dart.left',
    'back.dart.right',
    'front.bustDart.upper',
    'front.bustDart.lower',
    'front.waistDart.left',
    'front.waistDart.right',
  )
  if (hip) {
    b.role('centerBack', 'back.cbHip')
    b.role('centerFront', 'front.cfHip')
    b.role('side', 'back.sideHip', 'front.sideHip')
    b.role('hem', 'back.hem', 'front.hem')
    b.role(
      'dart',
      'back.dart.leftLow',
      'back.dart.rightLow',
      'front.waistDart.leftLow',
      'front.waistDart.rightLow',
    )
  }

  return b.build()
}

// =================== measurements of the result ===================

export interface FrontBack {
  readonly front: number
  readonly back: number
}

export interface WomenBodiceMetrics {
  /** Armhole seam length per piece (mm). */
  readonly armhole: FrontBack
  readonly shoulder: FrontBack
  /** Side seam length per piece as sewn (dart opening excluded), mm. */
  readonly sideSeam: FrontBack
  /** Waist length per piece after removing the waist dart, mm. */
  readonly waist: FrontBack
  /** Dart openings (mm): bust dart at the side seam, waist darts at the waist. */
  readonly darts: { readonly bust: number; readonly frontWaist: number; readonly backWaist: number }
}

const segLen = (draft: Draft, id: string): number => {
  const s = draft.segments[id]
  if (!s) throw new Error(`measureWomenBodice: missing segment "${id}"`)
  return segmentLength(s)
}

const sumLen = (draft: Draft, ids: readonly string[]): number =>
  ids.reduce((acc, id) => acc + segLen(draft, id), 0)

/** Seam lengths and dart sizes of a drafted bodice. */
export function measureWomenBodice(draft: Draft): WomenBodiceMetrics {
  const S = WOMEN_BODICE_SEAMS
  const pt = (n: string): Vec => {
    const v = draft.points[n]
    if (!v) throw new Error(`measureWomenBodice: missing point "${n}"`)
    return v
  }
  const hasHip = S.back.sideHip in draft.segments
  const side = (ids: readonly string[], hipSeg: string) =>
    sumLen(draft, ids) + (hasHip ? segLen(draft, hipSeg) : 0)
  const backWaistDart = distance(pt('A46'), pt('A47'))
  const frontWaistDart = distance(pt('A52'), pt('A53'))
  return {
    armhole: { front: sumLen(draft, S.front.armhole), back: sumLen(draft, S.back.armhole) },
    shoulder: { front: segLen(draft, S.front.shoulder), back: segLen(draft, S.back.shoulder) },
    sideSeam: {
      front: side(S.front.side, S.front.sideHip),
      back: side(S.back.side, S.back.sideHip),
    },
    waist: {
      front: segLen(draft, S.front.waist) - frontWaistDart,
      back: segLen(draft, S.back.waist) - backWaistDart,
    },
    darts: {
      bust: distance(pt('A36'), pt('A38')),
      frontWaist: frontWaistDart,
      backWaist: backWaistDart,
    },
  }
}
