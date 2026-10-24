/**
 * Men's base trousers ("pantalón base hombre"), front + back drafted on one shared frame.
 *
 * Method: Spanish half-measurement method of Feller, "Patronaje Hombre" (pantalón base, points
 * 1…35), which uses the same measurements as the EASD table (largo de cadera, largo de tiro,
 * largo de rodilla, largo total, ancho de rodilla, ancho de bajo/camal and the HALF hip and
 * waist). Feller's draft includes 1 cm seam allowances; here it is drafted net. Every step,
 * formula and choice is documented in docs/blocks/men-trousers.md. Point An = Feller's point n
 * (A0 and the crease points are added).
 *
 * Frame: crease line (grainline) at x = 0, waist line y = 0, y down; side seams towards −x and the
 * crotch towards +x; the back is drafted over the front. Units: mm.
 */
import {
  DraftBuilder,
  add,
  dot,
  lerp,
  midpoint,
  neg,
  normalize,
  perp,
  scale,
  segmentLength,
  smoothWithTangents,
  sub,
  vec,
  type Draft,
  type PieceMark,
  type Vec,
} from '../core'
import type { MenKey } from '../data'
import {
  DOWN,
  bisect,
  inseamCurve,
  measureTrousers,
  outseamHipCurve,
  outseamLegCurve,
  type TrouserMetrics,
} from './trousersShared'

export type MenTrousersMeasurementKey = Extract<
  MenKey,
  | 'waist'
  | 'hip'
  | 'hipDepth'
  | 'crotchDepth'
  | 'kneeLength'
  | 'trouserLength'
  | 'halfKneeWidth'
  | 'halfTrouserBottomWidth'
  | 'thigh'
>

/** EASD measurements in mm. `waist` and `hip` are HALF measurements (media medida). */
export type MenTrousersMeasurements = Readonly<Record<MenTrousersMeasurementKey, number>>

export interface MenTrousersOptions {
  /** Total waist ease on the full circumference (Feller: 0, net). */
  readonly waistEase: number
  /** Total hip ease on the full circumference (choice: 4 cm → 1 cm per quarter). */
  readonly hipEase: number
  /** Hip moved from the front quarter to the back quarter (Feller: 2 cm). */
  readonly hipShift: number
  /** Back inseam shorter than the front, stretched when sewing (Feller: 0.5 cm). */
  readonly backInseamEase: number
  /** Crotch-depth ease added to the table's largo de tiro before drafting (0 = table value). */
  readonly crotchEase: number
  /**
   * Extra crotch-extension width (mm) added to BOTH the front extension (A3→A10) and the back
   * extension (A10→A27). This is what actually controls the thigh ease: see docs §6.4.
   */
  readonly crotchExtensionEase: number
}

export const MEN_TROUSERS_DEFAULTS: MenTrousersOptions = {
  waistEase: 0,
  hipEase: 40,
  hipShift: 20,
  backInseamEase: 5,
  crotchEase: 0,
  crotchExtensionEase: 0,
}

/**
 * Values the block (registry) applies on top of MEN_TROUSERS_DEFAULTS: the draft function itself
 * defaults to the plain table draft (both 0). See docs/blocks/men-trousers.md §6.4.
 */
export const MEN_TROUSERS_BLOCK_DEFAULTS = {
  /** Crotch-depth ease: 21.5 + 2.5 = 24 cm at size 48 (lower end of the Feller–Aldrich range). */
  crotchEase: 25,
  /** Crotch-extension ease (front and back): the smallest 0.5 cm step giving >= 6 cm of thigh ease. */
  crotchExtensionEase: 30,
} as const

/** Fixed construction distances of the method (mm). */
export const MEN_TROUSERS_CONSTANTS = {
  /** 1→7: centre front moved in at the waist. */
  cfWaistIn: 10,
  /** 10→27: back extension beyond the front crotch point = half hip/10 + this. */
  backExtensionAdd: 15,
  /** 21→22: centre back raised along its line = half hip/10 − this. */
  cbRaiseSub: 10,
  /** 11→12: one third of 11→3; 12→31: back curve point this far beyond 12. */
  backCurveOffset: 10,
  /** Back dart (32): width and length (Feller: 2 cm, 8 cm). */
  backDart: { width: 20, length: 80 },
  /** Knee/hem: front = 2 × half width − this, back = 2 × half width + this. */
  widthAdjust: 20,
} as const

/** Segment ids of the seams (stable for every size). */
export const MEN_TROUSERS_SEAMS = {
  front: {
    waist: ['front.waist'],
    outseam: ['front.outseam.0', 'front.outseam.1', 'front.outseam.2'],
    hem: 'front.hem',
    inseam: ['front.inseam.1', 'front.inseam.0'],
    crotch: ['front.crotch.1', 'front.crotch.0'],
    cf: 'front.cf',
  },
  back: {
    waist: ['back.waist.0', 'back.waist.dart', 'back.waist.1'],
    outseam: ['back.outseam.0', 'back.outseam.1', 'back.outseam.2'],
    hem: 'back.hem',
    inseam: ['back.inseam.1', 'back.inseam.0'],
    crotch: ['back.crotch.1', 'back.crotch.0'],
    cb: 'back.cb',
  },
} as const

/** Point names used to measure the result (see measureMenTrousers). */
export const MEN_TROUSERS_LANDMARKS = {
  front: {
    hipSide: 'A6',
    hipCentre: 'A2',
    kneeOut: 'A18',
    kneeIn: 'A19',
    hemOut: 'A16',
    hemIn: 'A17',
  },
  back: {
    hipSide: 'A24',
    hipCentre: 'A20',
    kneeOut: 'A25',
    kneeIn: 'A28',
    hemOut: 'A26',
    hemIn: 'A29',
  },
} as const

const RIGHT = vec(1, 0)

/**
 * Draft the men's base trousers. `measurements` are in mm (getMeasurements of the es-men-easd
 * table: waist and hip are half measurements); options fall back to MEN_TROUSERS_DEFAULTS.
 */
export function draftMenTrousers(
  measurements: MenTrousersMeasurements,
  options: Partial<MenTrousersOptions> = {},
): Draft {
  const m = measurements
  const o: MenTrousersOptions = { ...MEN_TROUSERS_DEFAULTS, ...options }
  const C = MEN_TROUSERS_CONSTANTS
  const b = new DraftBuilder()
  const P = (name: string, p: Vec) => b.point(name, p)
  // EASD hip and waist are half circumferences: a quarter of the body is half of the value.
  const halfHip = m.hip
  const quarterHip = m.hip / 2
  const quarterWaist = m.waist / 2 + o.waistEase / 4

  // ---- 1. Lengths from the waist: hip, crotch (largo de tiro), knee and hem ----
  const hipY = m.hipDepth
  const crotchY = m.crotchDepth + o.crotchEase
  const kneeY = m.kneeLength
  const hemY = m.trouserLength

  // ---- 2. Front widths: hip quarter (−2 cm to the back) and crotch extension ----
  const frontHip = quarterHip - o.hipShift + o.hipEase / 4
  const frontExt = halfHip / 10 + o.crotchExtensionEase
  const half = (frontHip + frontExt) / 2 // crease halfway between side and crotch point
  const cfX = -half + frontHip
  P('A0', vec(0, 0)) // crease on the waist line
  const A1 = P('A1', vec(cfX, 0))
  const A2 = P('A2', vec(cfX, hipY))
  const A3 = P('A3', vec(cfX, crotchY))
  P('A4', vec(cfX, kneeY))
  P('A5', vec(cfX, hemY))
  const A6 = P('A6', vec(-half, hipY)) // side on the hip line
  const A7 = P('A7', vec(A1.x - C.cfWaistIn, 0)) // centre front waist
  const A8 = P('A8', vec(A7.x - quarterWaist, 0)) // side waist (no front dart)
  P('A9', vec(-half, crotchY))
  const A10 = P('A10', vec(half, crotchY)) // front crotch point
  const A11 = P('A11', midpoint(A10, A2))
  const A12 = P('A12', lerp(A11, A3, 1 / 3))
  P('A13', vec(0, crotchY))
  P('A14', vec(0, kneeY))
  P('A15', vec(0, hemY))

  // ---- 3. Front knee and hem: half widths each side of the crease, net of seam allowance ----
  const frontKnee = 2 * m.halfKneeWidth - C.widthAdjust
  const frontHem = 2 * m.halfTrouserBottomWidth - C.widthAdjust
  const A16 = P('A16', vec(-frontHem / 2, hemY))
  const A17 = P('A17', vec(frontHem / 2, hemY))
  const A18 = P('A18', vec(-frontKnee / 2, kneeY))
  const A19 = P('A19', vec(frontKnee / 2, kneeY))

  // ---- 4. Back centre line: from the hip at the front centre line, up through 21 ----
  const A20 = P('A20', A2) // net: 2→20 (1 cm) only removes Feller's centre front allowance
  const A21 = P('A21', vec(A2.x - halfHip / 10, 0))
  const cbUp = normalize(sub(A21, A20))
  const A22 = P('A22', add(A21, scale(cbUp, halfHip / 10 - C.cbRaiseSub))) // centre back waist
  const backHip = quarterHip + o.hipShift + o.hipEase / 4
  const A24 = P('A24', vec(A20.x - backHip, hipY)) // back side on the hip line

  // ---- 5. Back knee and hem: 2 cm wider than the front at each side ----
  const A25 = P('A25', vec(A18.x - C.widthAdjust, kneeY))
  const A26 = P('A26', vec(A16.x - C.widthAdjust, hemY))
  const A27 = P(
    'A27',
    vec(A10.x + halfHip / 10 + o.crotchExtensionEase + C.backExtensionAdd, crotchY),
  )
  const A28 = P('A28', vec(A19.x + C.widthAdjust, kneeY))
  const A29 = P('A29', vec(A17.x + C.widthAdjust, hemY))

  // ---- 6. Back crotch point 30 on 28→27: back inseam = front inseam − ease ----
  const frontInseam =
    segmentLength(inseamCurve('i', A10, A19, A17)) + Math.hypot(A17.x - A19.x, A17.y - A19.y)
  const lowerBack = Math.hypot(A29.x - A28.x, A29.y - A28.y)
  const upperBack = frontInseam - o.backInseamEase - lowerBack
  const along = (t: number) => lerp(A28, A27, t)
  const t30 = bisect(
    (t) => segmentLength(inseamCurve('i', along(t), A28, A29)) - upperBack,
    0.5,
    1.2,
    'draftMenTrousers: back crotch point',
  )
  const A30 = P('A30', along(t30))
  const A31 = P('A31', add(A12, scale(normalize(sub(A3, A12)), C.backCurveOffset)))

  // ---- 7. Back waist: 23 on the circle (centre 22) that trues the side seams ----
  const backWaistLen = quarterWaist + C.backDart.width
  const frontOutseam =
    segmentLength(outseamHipCurve('o', A8, A6)) +
    segmentLength(outseamLegCurve('o', A6, A18, A16)) +
    Math.hypot(A16.x - A18.x, A16.y - A18.y)
  const backLower =
    segmentLength(outseamLegCurve('o', A24, A25, A26)) + Math.hypot(A26.x - A25.x, A26.y - A25.y)
  const sideAt = (y: number) => vec(A22.x - Math.sqrt(backWaistLen ** 2 - (y - A22.y) ** 2), y)
  const sideY = bisect(
    (y) => segmentLength(outseamHipCurve('o', sideAt(y), A24)) + backLower - frontOutseam,
    A22.y - backWaistLen * 0.5,
    A22.y + backWaistLen * 0.5,
    'draftMenTrousers: back side waist',
  )
  const A23 = P('A23', sideAt(sideY))

  // ---- 8. Back dart at the middle of the waist, perpendicular to it ----
  const u = normalize(sub(A23, A22))
  const nIn = dot(perp(u), DOWN) > 0 ? perp(u) : neg(perp(u))
  const A32 = P('A32', midpoint(A22, A23))
  P('A33', add(A32, scale(nIn, C.backDart.length)))
  P('A34', add(A32, scale(u, -C.backDart.width / 2)))
  P('A35', add(A32, scale(u, C.backDart.width / 2)))

  // =================== segments ===================
  const left = Math.min(A24.x, A26.x) - 30
  const right = Math.max(A27.x, A30.x) + 30
  b.line('c.crease', vec(0, A22.y - 20), 'A15')
  b.line('c.waist', vec(left, 0), vec(right, 0))
  b.line('c.hip', vec(left, hipY), vec(right, hipY))
  b.line('c.crotch', vec(left, crotchY), vec(right, crotchY))
  b.line('c.knee', vec(left, kneeY), vec(right, kneeY))
  b.line('c.hem', vec(left, hemY), vec(right, hemY))
  b.line('c.frontCentre', 'A1', 'A5')
  b.line('c.frontCurve', 'A10', 'A2')
  b.line('c.frontCurveRef', 'A11', 'A3')
  b.line('c.backCentre', 'A21', 'A20')
  b.line('c.backInseamRef', 'A28', 'A27')

  // Front
  b.line('front.waist', 'A7', 'A8')
  b.segment(outseamHipCurve('front.outseam.0', A8, A6), { from: 'A8', to: 'A6' })
  b.segment(outseamLegCurve('front.outseam.1', A6, A18, A16), { from: 'A6', to: 'A18' })
  b.line('front.outseam.2', 'A18', 'A16')
  b.line('front.hem', 'A16', 'A17')
  b.segment(inseamCurve('front.inseam.0', A10, A19, A17), { from: 'A10', to: 'A19' })
  b.line('front.inseam.1', 'A19', 'A17')
  smoothWithTangents([A2, A12, A10], normalize(sub(A2, A7)), RIGHT, 'front.crotch').forEach(
    (c, i) => b.segment(c, i === 0 ? { from: 'A2', to: 'A12' } : { from: 'A12', to: 'A10' }),
  )
  b.line('front.cf', 'A7', 'A2')

  // Back
  b.line('back.waist.0', 'A22', 'A34')
  b.line('back.waist.dart', 'A34', 'A35')
  b.line('back.waist.1', 'A35', 'A23')
  b.segment(outseamHipCurve('back.outseam.0', A23, A24), { from: 'A23', to: 'A24' })
  b.segment(outseamLegCurve('back.outseam.1', A24, A25, A26), { from: 'A24', to: 'A25' })
  b.line('back.outseam.2', 'A25', 'A26')
  b.line('back.hem', 'A26', 'A29')
  b.segment(inseamCurve('back.inseam.0', A30, A28, A29), { from: 'A30', to: 'A28' })
  b.line('back.inseam.1', 'A28', 'A29')
  smoothWithTangents([A20, A31, A30], neg(cbUp), RIGHT, 'back.crotch').forEach((c, i) =>
    b.segment(c, i === 0 ? { from: 'A20', to: 'A31' } : { from: 'A31', to: 'A30' }),
  )
  b.line('back.cb', 'A22', 'A20')
  b.line('back.dart.left', 'A34', 'A33')
  b.line('back.dart.right', 'A35', 'A33')

  // Grainlines on the crease line.
  const frontGrain = [vec(0, hipY), vec(0, hemY - 100)] as const
  const backGrain = [vec(0, crotchY + 40), vec(0, hemY - 60)] as const
  b.line('front.grain', frontGrain[0], frontGrain[1])
  b.line('back.grain', backGrain[0], backGrain[1])

  const grainMark = (pieceId: string, ends: readonly [Vec, Vec]): PieceMark => ({
    id: `${pieceId}.grainline`,
    kind: 'grainline',
    at: scale(add(ends[0], ends[1]), 0.5),
    data: { segment: `${pieceId}.grain` },
  })
  const notch = (id: string, at: Vec, count: number, matches: string): PieceMark => ({
    id,
    kind: 'notch',
    at,
    data: { count, matches },
  })

  // =================== pieces ===================
  const S = MEN_TROUSERS_SEAMS
  b.piece(
    'front',
    'Delantero',
    [
      ...S.front.waist,
      ...S.front.outseam,
      S.front.hem,
      ...S.front.inseam,
      ...S.front.crotch,
      S.front.cf,
    ],
    {
      internalLines: ['front.grain'],
      marks: [
        grainMark('front', frontGrain),
        notch('front.notch.hip', A6, 1, 'hip'),
        notch('front.notch.kneeOut', A18, 1, 'kneeOut'),
        notch('front.notch.kneeIn', A19, 1, 'kneeIn'),
      ],
    },
  )
  b.piece(
    'back',
    'Espalda',
    [...S.back.waist, ...S.back.outseam, S.back.hem, ...S.back.inseam, ...S.back.crotch, S.back.cb],
    {
      internalLines: ['back.dart.left', 'back.dart.right', 'back.grain'],
      marks: [
        grainMark('back', backGrain),
        notch('back.notch.hip', A24, 1, 'hip'),
        notch('back.notch.kneeOut', A25, 2, 'kneeOut'),
        notch('back.notch.kneeIn', A28, 2, 'kneeIn'),
      ],
    },
  )

  // =================== roles ===================
  for (const p of [S.front, S.back]) {
    b.role('waist', ...p.waist.filter((id) => !id.includes('dart')))
    b.role('dart', ...p.waist.filter((id) => id.includes('dart')))
    b.role('outseam', ...p.outseam)
    b.role('hem', p.hem)
    b.role('inseam', ...p.inseam)
    b.role('crotch', ...p.crotch)
  }
  b.role('centerFront', S.front.cf)
  b.role('centerBack', S.back.cb)
  b.role('dart', 'back.dart.left', 'back.dart.right')

  return b.build()
}

/** Seam lengths and widths of a men's trouser draft (mm). */
export const measureMenTrousers = (draft: Draft): TrouserMetrics => {
  const A13 = draft.points.A13
  if (!A13) throw new Error('measureMenTrousers: missing point "A13"')
  return measureTrousers(draft, MEN_TROUSERS_LANDMARKS, A13.y)
}
