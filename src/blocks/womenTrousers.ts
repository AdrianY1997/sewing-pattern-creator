/**
 * Women's base trousers ("pantalón base mujer"), front + back drafted on one shared frame.
 *
 * Method: Winifred Aldrich's trouser block (Metric Pattern Cutting for Women's Wear), because
 * Fashion Patrón only publishes its trouser draft in a paid e-book. Proportions of the classic
 * block (ease, crotch extensions, darts, knee and hem) as tabulated by Lim & Cassidy (2017); frame
 * and back construction from Aldrich's close-fitting trouser/jeans block. Every step, formula and
 * choice is documented in docs/blocks/women-trousers.md.
 *
 * Frame: crease line (grainline) at x = 0, waist line y = 0, y down; side seams towards −x and the
 * crotch towards +x; the back is drafted over the front. Units: mm.
 */
import {
  DraftBuilder,
  add,
  dot,
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
import type { WomenKey } from '../data'
import {
  DOWN,
  bisect,
  inseamCurve,
  measureTrousers,
  outseamHipCurve,
  outseamLegCurve,
  type TrouserMetrics,
} from './trousersShared'

export type WomenTrousersMeasurementKey = Extract<
  WomenKey,
  | 'waist'
  | 'hip'
  | 'hipDepth'
  | 'bodyRise'
  | 'waistToKnee'
  | 'trouserLength'
  | 'thigh'
  | 'knee'
  | 'halfTrouserBottomWidth'
  | 'halfJeansBottomWidth'
>

export type WomenTrousersMeasurements = Readonly<Record<WomenTrousersMeasurementKey, number>>

export interface WomenTrousersOptions {
  /** Total waist ease (Aldrich: 0.25 cm per quarter → 1 cm). */
  readonly waistEase: number
  /** Hip ease of the front quarter (Aldrich: hip/4 + 0.5 cm). */
  readonly frontHipEase: number
  /** Hip ease of the back quarter (Aldrich: hip/4 + 1.5 cm). */
  readonly backHipEase: number
  /** Added to the body rise for the crotch line (Aldrich: body rise + 1 cm). */
  readonly crotchEase: number
  /** Total knee ease: front knee + back knee = knee + this (calibrated, see the doc). */
  readonly kneeEase: number
  /** Bottom width row: straight trouser (default) or jeans. */
  readonly bottom: 'straight' | 'jeans'
}

export const WOMEN_TROUSERS_DEFAULTS: WomenTrousersOptions = {
  waistEase: 10,
  frontHipEase: 5,
  backHipEase: 15,
  crotchEase: 10,
  kneeEase: 160,
  bottom: 'straight',
}

/** Fixed construction distances of the method (mm). */
export const WOMEN_TROUSERS_CONSTANTS = {
  /** Front crotch extension = hip/16 + this. */
  frontExtensionAdd: 5,
  /** Back crotch extension = hip × this, from the centre back line. */
  backExtensionFactor: 1 / 8,
  /** Centre front moved in at the waist. */
  cfWaistIn: 10,
  /** Centre back at the waist: moved towards the crease and raised. */
  cbWaistIn: 20,
  cbWaistRaise: 20,
  /** Front crotch curve: distance from the corner along the bisector (hip < / ≥ 102 cm). */
  frontCurve: [32.5, 35],
  /** Back crotch curve: distance from the corner along the bisector (hip < / ≥ 102 cm). */
  backCurve: [45, 47.5],
  curveHipLimit: 1020,
  /** Front dart on the crease line. */
  frontDart: { width: 20, length: 100 },
  /** Two back darts at 1/3 and 2/3 of the back waist (from centre back). */
  backDarts: [
    { width: 20, length: 120 },
    { width: 20, length: 100 },
  ],
  /** Front knee/hem are 1 cm narrower than the mean, back 1 cm wider (back = front + 2 cm). */
  frontBackWidthDiff: 20,
  /** Search range of the back crotch drop that trues the inseams. */
  maxBackDrop: 20,
} as const

/** Segment ids of the seams (stable for every size). */
export const WOMEN_TROUSERS_SEAMS = {
  front: {
    waist: ['front.waist.0', 'front.waist.dart', 'front.waist.1'],
    outseam: ['front.outseam.0', 'front.outseam.1', 'front.outseam.2'],
    hem: 'front.hem',
    inseam: ['front.inseam.1', 'front.inseam.0'],
    crotch: ['front.crotch.1', 'front.crotch.0'],
    cf: 'front.cf',
  },
  back: {
    waist: ['back.waist.0', 'back.waist.dart1', 'back.waist.1', 'back.waist.dart2', 'back.waist.2'],
    outseam: ['back.outseam.0', 'back.outseam.1', 'back.outseam.2'],
    hem: 'back.hem',
    inseam: ['back.inseam.1', 'back.inseam.0'],
    crotch: ['back.crotch.1', 'back.crotch.0'],
    cb: 'back.cb',
  },
} as const

/** Point names used to measure the result (see measureWomenTrousers). */
export const WOMEN_TROUSERS_LANDMARKS = {
  front: {
    hipSide: 'A8',
    hipCentre: 'A9',
    kneeOut: 'A17',
    kneeIn: 'A18',
    hemOut: 'A19',
    hemIn: 'A20',
  },
  back: {
    hipSide: 'A24',
    hipCentre: 'A22',
    kneeOut: 'A37',
    kneeIn: 'A38',
    hemOut: 'A39',
    hemIn: 'A40',
  },
} as const

const RIGHT = vec(1, 0)
const BISECTOR = normalize(vec(1, -1))

/** Crotch curve from the centre line at the hip, through the bisector point, to the crotch point. */
const crotchCurve = (prefix: string, hip: Vec, startDir: Vec, mid: Vec, crotch: Vec) =>
  smoothWithTangents([hip, mid, crotch], startDir, RIGHT, prefix)

/**
 * Draft the women's base trousers. `measurements` are in mm (getMeasurements of the
 * co-women-industrial table); options fall back to WOMEN_TROUSERS_DEFAULTS.
 */
export function draftWomenTrousers(
  measurements: WomenTrousersMeasurements,
  options: Partial<WomenTrousersOptions> = {},
): Draft {
  const m = measurements
  const o: WomenTrousersOptions = { ...WOMEN_TROUSERS_DEFAULTS, ...options }
  const C = WOMEN_TROUSERS_CONSTANTS
  const b = new DraftBuilder()
  const P = (name: string, p: Vec) => b.point(name, p)
  const H = m.hip
  const big = H >= C.curveHipLimit ? 1 : 0

  // ---- 1. Frame on the crease line: waist, hip, crotch, knee and hem lines ----
  const crotchY = m.bodyRise + o.crotchEase
  const hipY = m.hipDepth
  const kneeY = m.waistToKnee
  const hemY = m.trouserLength
  P('A', vec(0, 0))
  P('A1', vec(0, crotchY))
  P('A2', vec(0, hipY))
  P('A3', vec(0, kneeY))
  P('A4', vec(0, hemY))

  // ---- 2. Front: hip quarter + crotch extension, crease halfway across the crotch line ----
  const frontHip = H / 4 + o.frontHipEase
  const frontExt = H / 16 + C.frontExtensionAdd
  const halfFront = (frontHip + frontExt) / 2
  const A5 = P('A5', vec(-halfFront, crotchY)) // side on the crotch line
  const A6 = P('A6', vec(halfFront, crotchY)) // front crotch point
  const A7 = P('A7', vec(A5.x + frontHip, crotchY)) // centre front on the crotch line
  const A8 = P('A8', vec(A5.x, hipY))
  const A9 = P('A9', vec(A7.x, hipY))
  P('A10', vec(A7.x, 0))
  const A11 = P('A11', vec(A7.x - C.cfWaistIn, 0)) // centre front waist
  const A12 = P('A12', add(A7, scale(BISECTOR, C.frontCurve[big])))

  // ---- 3. Front waist: quarter + ease + dart on the crease ----
  const quarterWaist = m.waist / 4 + o.waistEase / 4
  const fd = C.frontDart
  const A13 = P('A13', vec(A11.x - (quarterWaist + fd.width), 0)) // side waist
  P('A14', vec(-fd.width / 2, 0))
  P('A15', vec(fd.width / 2, 0))
  P('A16', vec(0, fd.length))

  // ---- 4. Front knee and hem, centred on the crease ----
  const bottom = o.bottom === 'jeans' ? m.halfJeansBottomWidth : m.halfTrouserBottomWidth
  const frontKnee = (m.knee + o.kneeEase) / 2 - C.frontBackWidthDiff / 2
  const frontHem = bottom - C.frontBackWidthDiff / 2
  const A17 = P('A17', vec(-frontKnee / 2, kneeY))
  const A18 = P('A18', vec(frontKnee / 2, kneeY))
  const A19 = P('A19', vec(-frontHem / 2, hemY))
  const A20 = P('A20', vec(frontHem / 2, hemY))

  // ---- 5. Back: centre back a quarter of the way from the front centre line to the crease ----
  const A21 = P('A21', vec(A7.x * 0.75, crotchY))
  const A22 = P('A22', vec(A21.x, hipY))
  const A23 = P('A23', vec(A21.x - C.cbWaistIn, -C.cbWaistRaise)) // centre back waist
  const backHip = H / 4 + o.backHipEase
  const A24 = P('A24', vec(A22.x - backHip, hipY)) // back side on the hip line
  const A25 = P('A25', vec(A21.x + H * C.backExtensionFactor, crotchY)) // back extension

  // ---- 6. Back knee and hem: 1 cm wider than the front at each side ----
  const backKnee = frontKnee + C.frontBackWidthDiff
  const backHem = frontHem + C.frontBackWidthDiff
  const A37 = vec(-backKnee / 2, kneeY)
  const A38 = vec(backKnee / 2, kneeY)
  const A39 = vec(-backHem / 2, hemY)
  const A40 = vec(backHem / 2, hemY)

  // ---- 7. True the inseams: drop the back crotch point until back inseam = front inseam ----
  const frontInseam =
    segmentLength(inseamCurve('i', A6, A18, A20)) + Math.hypot(A20.x - A18.x, A20.y - A18.y)
  const backInseam = (drop: number) =>
    segmentLength(inseamCurve('i', vec(A25.x, crotchY + drop), A38, A40)) +
    Math.hypot(A40.x - A38.x, A40.y - A38.y)
  const drop = bisect(
    (d) => backInseam(d) - frontInseam,
    0,
    C.maxBackDrop,
    'draftWomenTrousers: back crotch drop',
  )
  const A26 = P('A26', vec(A25.x, crotchY + drop)) // back crotch point
  const A27 = P('A27', add(A21, scale(BISECTOR, C.backCurve[big])))

  // ---- 8. Back waist: side point on the circle (centre A23) that trues the outseams ----
  const backDartsTotal = C.backDarts.reduce((s, d) => s + d.width, 0)
  const backWaistLen = quarterWaist + backDartsTotal
  const frontOutseam =
    segmentLength(outseamHipCurve('o', A13, A8)) +
    segmentLength(outseamLegCurve('o', A8, A17, A19)) +
    Math.hypot(A19.x - A17.x, A19.y - A17.y)
  const backLower =
    segmentLength(outseamLegCurve('o', A24, A37, A39)) + Math.hypot(A39.x - A37.x, A39.y - A37.y)
  const sideAt = (y: number) => vec(A23.x - Math.sqrt(backWaistLen ** 2 - (y - A23.y) ** 2), y)
  const sideY = bisect(
    (y) => segmentLength(outseamHipCurve('o', sideAt(y), A24)) + backLower - frontOutseam,
    A23.y - backWaistLen * 0.5,
    A23.y + backWaistLen * 0.5,
    'draftWomenTrousers: back side waist',
  )
  const A28 = P('A28', sideAt(sideY))

  // ---- 9. Back darts at 1/3 and 2/3 of the waist, perpendicular to it ----
  const u = normalize(sub(A28, A23))
  const nIn = dot(perp(u), DOWN) > 0 ? perp(u) : neg(perp(u))
  const dartNames = [
    ['A29', 'A30', 'A31', 'A32'],
    ['A33', 'A34', 'A35', 'A36'],
  ] as const
  C.backDarts.forEach((d, i) => {
    const [c, l0, l1, apex] = dartNames[i]
    const centre = P(c, add(A23, scale(u, (backWaistLen * (i + 1)) / 3)))
    P(l0, add(centre, scale(u, -d.width / 2)))
    P(l1, add(centre, scale(u, d.width / 2)))
    P(apex, add(centre, scale(nIn, d.length)))
  })
  P('A37', A37)
  P('A38', A38)
  P('A39', A39)
  P('A40', A40)

  // =================== segments ===================
  // Shared frame (construction lines).
  const left = Math.min(A24.x, A39.x) - 30
  const right = A26.x + 30
  b.line('c.crease', vec(0, A23.y - 20), 'A4')
  b.line('c.waist', vec(left, 0), vec(right, 0))
  b.line('c.hip', vec(left, hipY), vec(right, hipY))
  b.line('c.crotch', vec(left, crotchY), vec(right, crotchY))
  b.line('c.knee', vec(left, kneeY), vec(right, kneeY))
  b.line('c.hem', vec(left, hemY), vec(right, hemY))
  b.line('c.frontCentre', 'A10', 'A7')
  b.line('c.backCentre', 'A23', 'A21')
  b.line('c.frontCurve', 'A7', 'A12')
  b.line('c.backCurve', 'A21', 'A27')
  b.line('c.backExtension', 'A25', 'A26')

  // Front
  b.line('front.waist.0', 'A11', 'A15')
  b.line('front.waist.dart', 'A15', 'A14')
  b.line('front.waist.1', 'A14', 'A13')
  b.segment(outseamHipCurve('front.outseam.0', A13, A8), { from: 'A13', to: 'A8' })
  b.segment(outseamLegCurve('front.outseam.1', A8, A17, A19), { from: 'A8', to: 'A17' })
  b.line('front.outseam.2', 'A17', 'A19')
  b.line('front.hem', 'A19', 'A20')
  b.segment(inseamCurve('front.inseam.0', A6, A18, A20), { from: 'A6', to: 'A18' })
  b.line('front.inseam.1', 'A18', 'A20')
  const cfDir = normalize(sub(A9, A11))
  crotchCurve('front.crotch', A9, cfDir, A12, A6).forEach((c, i) =>
    b.segment(c, i === 0 ? { from: 'A9', to: 'A12' } : { from: 'A12', to: 'A6' }),
  )
  b.line('front.cf', 'A11', 'A9')
  b.line('front.dart.left', 'A14', 'A16')
  b.line('front.dart.right', 'A15', 'A16')

  // Back
  b.line('back.waist.0', 'A23', 'A30')
  b.line('back.waist.dart1', 'A30', 'A31')
  b.line('back.waist.1', 'A31', 'A34')
  b.line('back.waist.dart2', 'A34', 'A35')
  b.line('back.waist.2', 'A35', 'A28')
  b.segment(outseamHipCurve('back.outseam.0', A28, A24), { from: 'A28', to: 'A24' })
  b.segment(outseamLegCurve('back.outseam.1', A24, A37, A39), { from: 'A24', to: 'A37' })
  b.line('back.outseam.2', 'A37', 'A39')
  b.line('back.hem', 'A39', 'A40')
  b.segment(inseamCurve('back.inseam.0', A26, A38, A40), { from: 'A26', to: 'A38' })
  b.line('back.inseam.1', 'A38', 'A40')
  const cbDir = normalize(sub(A22, A23))
  crotchCurve('back.crotch', A22, cbDir, A27, A26).forEach((c, i) =>
    b.segment(c, i === 0 ? { from: 'A22', to: 'A27' } : { from: 'A27', to: 'A26' }),
  )
  b.line('back.cb', 'A23', 'A22')
  b.line('back.dart1.left', 'A30', 'A32')
  b.line('back.dart1.right', 'A31', 'A32')
  b.line('back.dart2.left', 'A34', 'A36')
  b.line('back.dart2.right', 'A35', 'A36')

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
  const S = WOMEN_TROUSERS_SEAMS
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
      internalLines: ['front.dart.left', 'front.dart.right', 'front.grain'],
      marks: [
        grainMark('front', frontGrain),
        notch('front.notch.hip', A8, 1, 'hip'),
        notch('front.notch.kneeOut', A17, 1, 'kneeOut'),
        notch('front.notch.kneeIn', A18, 1, 'kneeIn'),
      ],
    },
  )
  b.piece(
    'back',
    'Espalda',
    [...S.back.waist, ...S.back.outseam, S.back.hem, ...S.back.inseam, ...S.back.crotch, S.back.cb],
    {
      internalLines: [
        'back.dart1.left',
        'back.dart1.right',
        'back.dart2.left',
        'back.dart2.right',
        'back.grain',
      ],
      marks: [
        grainMark('back', backGrain),
        notch('back.notch.hip', A24, 1, 'hip'),
        notch('back.notch.kneeOut', A37, 2, 'kneeOut'),
        notch('back.notch.kneeIn', A38, 2, 'kneeIn'),
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
  b.role(
    'dart',
    'front.dart.left',
    'front.dart.right',
    'back.dart1.left',
    'back.dart1.right',
    'back.dart2.left',
    'back.dart2.right',
  )

  return b.build()
}

/** Seam lengths and widths of a women's trouser draft (mm). */
export const measureWomenTrousers = (draft: Draft): TrouserMetrics => {
  const A1 = draft.points.A1
  if (!A1) throw new Error('measureWomenTrousers: missing point "A1"')
  return measureTrousers(draft, WOMEN_TROUSERS_LANDMARKS, A1.y)
}
