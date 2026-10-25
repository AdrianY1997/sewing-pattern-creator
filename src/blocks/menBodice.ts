/**
 * Men's base bodice / base shirt block ("cuerpo base / camisa base hombre"), back + front, no darts,
 * with the back and front yoke lines marked as internal lines.
 *
 * Method: Tele Virtual Patronage ("Cómo cubrir un cuerpo"), "Trazado base de la camisa: el cuerpo"
 * (Spanish school, proportional shirt block), with the EASD Valencia measurements (radio de escote,
 * profundidad de sisa, ancho de espalda, largo de talle) taking the place of the method's
 * proportions wherever the table has them. Every step, formula and choice is documented in
 * docs/blocks/men-bodice.md.
 *
 * Frame: one combined construction box, back on the left (centre back at x = 0) and front on the
 * right (centre front at x = W), y down, A at the nape (back neck point on the top line). Units: mm.
 */
import {
  DraftBuilder,
  add,
  circleCircleIntersections,
  distance,
  dot,
  lineSegmentIntersections,
  midpoint,
  neg,
  normalize,
  perp,
  rotate,
  scale,
  segmentLength,
  sub,
  vec,
  type Draft,
  type PieceMark,
  type Segment,
  type Vec,
} from '../core'
import type { MenKey } from '../data'

/** Measurements the block reads (mm, as returned by getMeasurements for es-men-easd). */
export type MenBodiceMeasurementKey = Extract<
  MenKey,
  | 'neckRadius'
  | 'chest'
  | 'waist'
  | 'hip'
  | 'hipDepth'
  | 'halfBackWidth'
  | 'halfChestWidth'
  | 'waistLength'
  | 'armholeDepth'
  | 'shirtLength'
>

export type MenBodiceMeasurements = Readonly<Record<MenBodiceMeasurementKey, number>>

/** Ease (holgura) in mm. */
export interface MenBodiceEase {
  /** Added to the HALF chest (EASD "pecho") for the half-body box width. Method: 8 cm. */
  readonly chest: number
  /** Added to the armhole depth (EASD "profundidad de sisa"). Method: half the chest ease, 4 cm. */
  readonly armholeDepth: number
  /** Added to the half back width (EASD "ancho de espalda"). */
  readonly backWidth: number
  /** Added to the half chest width (complementary "ancho de pecho"). */
  readonly chestWidth: number
}

export interface MenBodiceOptions {
  /** Block length: shirt length (complementary "largo total de camisa") or to the hip line. */
  readonly length: 'shirt' | 'hip'
  readonly ease: MenBodiceEase
  /** The side seam is moved this much from the middle of the box towards the front (method 1 cm). */
  readonly sideSeamShift: number
}

export type MenBodiceOptionsInput = Partial<Omit<MenBodiceOptions, 'ease'>> & {
  readonly ease?: Partial<MenBodiceEase>
}

export const MEN_BODICE_DEFAULTS: MenBodiceOptions = {
  length: 'shirt',
  ease: { chest: 80, armholeDepth: 40, backWidth: 5, chestWidth: 10 },
  sideSeamShift: 10,
}

/** Fixed construction distances (mm). */
export const MEN_BODICE_CONSTANTS = {
  /** Back neck rise = radio de escote / 2 − this (method: "la mitad de dicho recorrido menos 1 cm"). */
  backNeckRiseReduction: 10,
  /** Shoulder point = back arc ∩ back width line, then this much further along the arc (method). */
  shoulderExtension: 10,
  /** Each side seam crosses the side line by this much at the armhole line (method: 0.5 cm). */
  underarmCross: 5,
  /** The armhole meets the back/front width lines at this fraction of the box height (method: 1/3). */
  armholeTouchFraction: 1 / 3,
  /** Armhole bisector points from the box corners (choice, see the method doc). */
  backArmholeBisector: 30,
  frontArmholeBisector: 25,
  /** Back yoke line below the nape = chest·(1/10 + 1/20) (method: (P/10)+(P/20), P = half chest). */
  backYokeFactor: 0.15,
  /** Front yoke line parallel to the shoulder at chest/20 (method figure: P/20). */
  frontYokeFactor: 0.05,
} as const

/** Segment ids of the seams, shared by every size (stable ids). */
export const MEN_BODICE_SEAMS = {
  back: {
    armhole: ['back.armhole.0', 'back.armhole.1', 'back.armhole.2'],
    shoulder: 'back.shoulder',
    side: ['back.side', 'back.sideLower'],
    neck: 'back.neck',
    hem: 'back.hem',
  },
  front: {
    armhole: ['front.armhole.0', 'front.armhole.1', 'front.armhole.2'],
    shoulder: 'front.shoulder',
    side: ['front.side', 'front.sideLower'],
    neck: 'front.neck',
    hem: 'front.hem',
  },
} as const

const mergeOptions = (o: MenBodiceOptionsInput = {}): MenBodiceOptions => ({
  ...MEN_BODICE_DEFAULTS,
  ...o,
  ease: { ...MEN_BODICE_DEFAULTS.ease, ...o.ease },
})

/** Unit bisector of the angle a–vertex–b. */
const bisector = (a: Vec, vertex: Vec, b: Vec): Vec =>
  normalize(add(normalize(sub(a, vertex)), normalize(sub(b, vertex))))

/** The unit perpendicular of `dir` whose component along `ref` is positive. */
const perpToward = (dir: Vec, ref: Vec): Vec => {
  const n = perp(normalize(dir))
  return dot(n, ref) >= 0 ? n : neg(n)
}

const must = <T>(v: T | null | undefined, what: string): T => {
  if (v === null || v === undefined) throw new Error(`draftMenBodice: cannot construct ${what}`)
  return v
}

/** Intersections of the infinite line a–b with a chain of segments. */
const lineChainHits = (a: Vec, b: Vec, chain: readonly Segment[]): Vec[] =>
  chain.flatMap((s) => lineSegmentIntersections(a, b, s))

const closestTo = (pts: readonly Vec[], ref: Vec): Vec | undefined =>
  [...pts].sort((p, q) => distance(p, ref) - distance(q, ref))[0]

/**
 * Draft the men's base bodice / base shirt. `measurements` are in mm (getMeasurements of the
 * es-men-easd table: chest, waist and hip are HALF measures); options fall back to
 * MEN_BODICE_DEFAULTS.
 */
export function draftMenBodice(
  measurements: MenBodiceMeasurements,
  options: MenBodiceOptionsInput = {},
): Draft {
  const m = measurements
  const o = mergeOptions(options)
  const e = o.ease
  const C = MEN_BODICE_CONSTANTS
  const b = new DraftBuilder()
  const P = (name: string, p: Vec) => b.point(name, p)

  // ---- 1. Construction box: width = half chest + ease; armhole, waist, hip and hem lines ----
  const W = m.chest + e.chest
  const armholeY = m.armholeDepth + e.armholeDepth
  const waistY = m.waistLength
  const hipY = waistY + m.hipDepth
  const hemY = o.length === 'shirt' ? m.shirtLength : hipY
  if (!(armholeY < waistY && waistY < hipY && hipY <= hemY))
    throw new Error('draftMenBodice: armhole, waist, hip and hem lines are out of order')
  P('A', vec(0, 0))
  P('A1', vec(W, 0))
  P('B', vec(0, armholeY))
  P('B1', vec(W, armholeY))
  const Cw = P('C', vec(0, waistY))
  const C1 = P('C1', vec(W, waistY))
  P('D', vec(0, hipY))
  P('D1', vec(W, hipY))
  P('E', vec(0, hemY))
  P('E1', vec(W, hemY))

  // ---- 2. Side seam: middle of the box moved towards the front ----
  const sideX = W / 2 + o.sideSeamShift
  P('F', vec(sideX, armholeY))
  const G = P('G', vec(sideX, waistY))
  P('H', vec(sideX, hipY))
  P('I', vec(sideX, hemY))

  // ---- 3. Armhole box: back width and chest (front) width lines ----
  const backX = m.halfBackWidth + e.backWidth
  const frontX = W - (m.halfChestWidth + e.chestWidth)
  if (!(backX < sideX && sideX < frontX)) throw new Error('draftMenBodice: armhole box is inverted')
  const J = P('J', vec(backX, armholeY))
  P('J1', vec(backX, 0))
  const K = P('K', vec(frontX, armholeY))
  P('K1', vec(frontX, 0))

  // ---- 4. Necklines: radio de escote (= neck/5) ----
  const r = m.neckRadius
  P('L', vec(r, 0))
  const M = P('M', vec(r, -(r / 2 - C.backNeckRiseReduction)))
  const N = P('N', vec(W - r, 0))
  P('O', vec(W, r))
  P('O1', vec(W - r, r))

  // ---- 5. Back shoulder: arc centred at the CB waist through M, cut by the back width line ----
  const backR = distance(Cw, M)
  const dy = Math.sqrt(Math.max(0, backR ** 2 - backX ** 2))
  if (backR <= backX)
    throw new Error('draftMenBodice: back shoulder arc misses the back width line')
  const Pp = P('P', vec(backX, waistY - dy))
  // One cm further along the arc (away from the neck): rotate about the centre.
  const Q = P('Q', rotate(Pp, C.shoulderExtension / backR, Cw))
  const shoulder = distance(M, Q)

  // ---- 6. Front shoulder: same length, on the arc centred at the CF waist through N ----
  const R = P(
    'R',
    must(
      circleCircleIntersections(C1, distance(C1, N), N, shoulder).find((q) => q.x < N.x),
      'R (front shoulder point)',
    ),
  )

  // ---- 7. Armhole control points ----
  const touchY = armholeY * (1 - C.armholeTouchFraction)
  const S = P('S', vec(backX, touchY))
  const T = P('T', vec(frontX, touchY))
  const X = P('X', vec(sideX + C.underarmCross, armholeY))
  const Y = P('Y', vec(sideX - C.underarmCross, armholeY))
  P('U', add(J, scale(bisector(S, J, X), C.backArmholeBisector)))
  P('V', add(K, scale(bisector(T, K, Y), C.frontArmholeBisector)))

  // ---- 8. Profundidad de sisa of the drafted armhole (used by the sleeve) ----
  const Z = P('Z', midpoint(Q, R))
  const Z1 = P('Z1', vec(Z.x, armholeY))
  P('Z2', midpoint(Z, Z1))

  // =================== segments ===================
  const down = vec(0, 1)
  const right = vec(1, 0)

  // Construction lines (not part of any piece).
  b.line('c.top', 'A', 'A1')
  b.line('c.armholeLine', 'B', 'B1')
  b.line('c.waist', 'C', 'C1')
  b.line('c.hip', 'D', 'D1')
  b.line('c.cf', 'A1', 'O')
  b.line('c.side', 'F', 'I')
  b.line('c.backWidth', 'J1', 'J')
  b.line('c.frontWidth', 'K1', 'K')
  b.line('c.backNeckRise', 'L', 'M')
  b.line('c.frontNeck.v', 'N', 'O1')
  b.line('c.frontNeck.h', 'O1', 'O')
  b.line('c.backShoulderRef', 'C', 'M')
  b.line('c.frontShoulderRef', 'C1', 'N')
  b.line('c.shoulderJoin', 'Q', 'R')
  b.line('c.armholeDepth', 'Z', 'Z1')

  // Back
  const backShoulderDir = normalize(sub(Q, M))
  const backSideDir = normalize(sub(G, X))
  b.line('back.cb', 'A', 'E')
  b.curveWithTangents('back.neck', 'A', right, 'M', perpToward(backShoulderDir, vec(0, -1)))
  b.line('back.shoulder', 'M', 'Q')
  const backArmhole = b.fairCurve(
    'back.armhole',
    ['Q', 'S', 'U', 'X'],
    perpToward(backShoulderDir, down),
    perpToward(backSideDir, right),
  )
  b.line('back.side', 'X', 'G')
  b.line('back.sideLower', 'G', 'I')
  b.line('back.hem', 'E', 'I')

  // Front
  const frontShoulderDir = normalize(sub(R, N))
  const frontSideDir = normalize(sub(G, Y))
  b.line('front.cf', 'O', 'E1')
  const frontNeck = b.curveWithTangents(
    'front.neck',
    'N',
    perpToward(frontShoulderDir, down),
    'O',
    right,
  )
  b.line('front.shoulder', 'N', 'R')
  const frontArmhole = b.fairCurve(
    'front.armhole',
    ['R', 'T', 'V', 'Y'],
    perpToward(frontShoulderDir, down),
    perpToward(frontSideDir, neg(right)),
  )
  b.line('front.side', 'Y', 'G')
  b.line('front.sideLower', 'G', 'I')
  b.line('front.hem', 'I', 'E1')

  // ---- 9. Yoke lines (internal) ----
  const yokeY = m.chest * C.backYokeFactor
  if (yokeY <= Q.y) throw new Error('draftMenBodice: back yoke line is above the shoulder point')
  P('A2', vec(0, yokeY))
  P(
    'A3',
    must(
      closestTo(
        lineChainHits(vec(0, yokeY), vec(1, yokeY), backArmhole).filter((h) => h.x > 0),
        vec(backX, yokeY),
      ),
      'A3 (back yoke on the armhole)',
    ),
  )
  b.line('back.yoke', 'A2', 'A3')

  const yokeOffset = scale(perpToward(frontShoulderDir, down), m.chest * C.frontYokeFactor)
  const fy0 = add(N, yokeOffset)
  const fy1 = add(R, yokeOffset)
  P('A4', must(closestTo(lineChainHits(fy0, fy1, [frontNeck]), N), 'A4 (front yoke on the neck)'))
  P(
    'A5',
    must(closestTo(lineChainHits(fy0, fy1, frontArmhole), R), 'A5 (front yoke on the armhole)'),
  )
  b.line('front.yoke', 'A4', 'A5')

  // Level lines inside each piece.
  b.line('back.waistLine', 'C', 'G')
  b.line('front.waistLine', 'G', 'C1')
  const hipLines = o.length === 'shirt'
  if (hipLines) {
    b.line('back.hipLine', 'D', 'H')
    b.line('front.hipLine', 'H', 'D1')
  }

  // Grainlines (parallel to centre back / centre front).
  const backGrainX = backX / 2
  const backGrain = [vec(backGrainX, yokeY + 40), vec(backGrainX, hemY - 40)] as const
  b.line('back.grain', backGrain[0], backGrain[1])
  const frontGrainX = (frontX + W) / 2
  const frontGrain = [vec(frontGrainX, r + 60), vec(frontGrainX, hemY - 40)] as const
  b.line('front.grain', frontGrain[0], frontGrain[1])

  const grainMark = (pieceId: string, seg: string, ends: readonly [Vec, Vec]): PieceMark => ({
    id: `${pieceId}.grainline`,
    kind: 'grainline',
    at: scale(add(ends[0], ends[1]), 0.5),
    data: { segment: seg },
  })

  // =================== pieces ===================
  const S_ = MEN_BODICE_SEAMS
  b.piece(
    'back',
    'Espalda',
    [
      'back.cb',
      'back.hem',
      'back.sideLower',
      'back.side',
      ...[...S_.back.armhole].reverse(),
      'back.shoulder',
      'back.neck',
    ],
    {
      internalLines: [
        'back.yoke',
        'back.waistLine',
        ...(hipLines ? ['back.hipLine'] : []),
        'back.grain',
      ],
      marks: [
        grainMark('back', 'back.grain', backGrain),
        { id: 'back.notch.armhole', kind: 'notch', at: S, data: { count: 2, matches: 'sleeve' } },
      ],
    },
  )

  b.piece(
    'front',
    'Delantero',
    [
      'front.cf',
      'front.hem',
      'front.sideLower',
      'front.side',
      ...[...S_.front.armhole].reverse(),
      'front.shoulder',
      'front.neck',
    ],
    {
      internalLines: [
        'front.yoke',
        'front.waistLine',
        ...(hipLines ? ['front.hipLine'] : []),
        'front.grain',
      ],
      marks: [
        grainMark('front', 'front.grain', frontGrain),
        { id: 'front.notch.armhole', kind: 'notch', at: T, data: { count: 1, matches: 'sleeve' } },
      ],
    },
  )

  // =================== roles ===================
  b.role('centerBack', 'back.cb')
  b.role('centerFront', 'front.cf')
  b.role('neckline', 'back.neck', 'front.neck')
  b.role('shoulder', 'back.shoulder', 'front.shoulder')
  b.role('armhole', ...S_.back.armhole, ...S_.front.armhole)
  b.role('side', ...S_.back.side, ...S_.front.side)
  b.role('hem', 'back.hem', 'front.hem')
  // Yoke lines: style lines that become seams when the piece is split along them (splitPiece).
  b.role('seam', 'back.yoke', 'front.yoke')

  return b.build()
}

// =================== measurements of the result ===================

export interface MenFrontBack {
  readonly front: number
  readonly back: number
}

export interface MenBodiceMetrics {
  /** Armhole seam length per piece (mm). */
  readonly armhole: MenFrontBack
  /** Armhole length from the underarm point up to the notch (S / T), per piece (mm). */
  readonly armholeBelowNotch: MenFrontBack
  readonly shoulder: MenFrontBack
  /** Side seam length per piece (mm). */
  readonly sideSeam: MenFrontBack
  /** Piece width on the armhole line measured to the side line F (mm). */
  readonly chestWidth: MenFrontBack
  /** "Profundidad de sisa" of the drafted armhole, PS = |Z Z1|/2 (mm): the sleeve cap height. */
  readonly armholeDepth: number
}

const segLen = (draft: Draft, id: string): number => {
  const s = draft.segments[id]
  if (!s) throw new Error(`measureMenBodice: missing segment "${id}"`)
  return segmentLength(s)
}

const sumLen = (draft: Draft, ids: readonly string[]): number =>
  ids.reduce((acc, id) => acc + segLen(draft, id), 0)

/** Seam lengths, widths and armhole depth of a drafted men's bodice. */
export function measureMenBodice(draft: Draft): MenBodiceMetrics {
  const S = MEN_BODICE_SEAMS
  const pt = (n: string): Vec => {
    const v = draft.points[n]
    if (!v) throw new Error(`measureMenBodice: missing point "${n}"`)
    return v
  }
  return {
    armhole: { front: sumLen(draft, S.front.armhole), back: sumLen(draft, S.back.armhole) },
    armholeBelowNotch: {
      front: sumLen(draft, S.front.armhole.slice(1)),
      back: sumLen(draft, S.back.armhole.slice(1)),
    },
    shoulder: { front: segLen(draft, S.front.shoulder), back: segLen(draft, S.back.shoulder) },
    sideSeam: { front: sumLen(draft, S.front.side), back: sumLen(draft, S.back.side) },
    chestWidth: { back: pt('F').x - pt('B').x, front: pt('B1').x - pt('F').x },
    armholeDepth: distance(pt('Z'), pt('Z1')) / 2,
  }
}
