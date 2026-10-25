/**
 * Women's base sleeve ("manga base"), one-piece set-in sleeve that fits the women's base bodice.
 *
 * Method: Fashion Patrón, "2.7. Trazado de Patrón de la manga base" (Seamly2D, points B…B21).
 * Cap height = (back armhole + front armhole)/3, bicep = upper arm + 4 cm, wrist = bicep − 10 cm,
 * cap curve through the method's control points on the two cap diagonals. The cap height is then
 * trued (solved) so that the cap length is exactly armholes + embebido. Every step, formula and
 * choice is documented in docs/blocks/women-sleeve.md.
 *
 * Frame: B (cap top) at the origin, y down, sleeve centre line on x = 0, back half on the left
 * (x < 0) and front half on the right (x > 0), as in the method's figure. Units: mm.
 */
import {
  DraftBuilder,
  add,
  bezierLength,
  nearestOnBezier,
  distance,
  midpoint,
  neg,
  normalize,
  path,
  pathPointAtLength,
  perp,
  pointAlong,
  reverseBezier,
  scale,
  segmentLength,
  cubic,
  fitFairCurve,
  sub,
  vec,
  dot,
  type CubicBezier,
  type Draft,
  type FairCurveShape,
  type PieceMark,
  type Vec,
} from '../core'
import type { WomenKey } from '../data'
import {
  WOMEN_BODICE_SEAMS,
  draftWomenBodice,
  type WomenBodiceMeasurementKey,
  type WomenBodiceMeasurements,
} from './womenBodice'

export type WomenSleeveMeasurementKey =
  WomenBodiceMeasurementKey | Extract<WomenKey, 'upperArm' | 'sleeveLength' | 'wrist'>

export type WomenSleeveMeasurements = Readonly<Record<WomenSleeveMeasurementKey, number>>

/** Armhole lengths (mm) of the bodice the sleeve is sewn into. */
export interface BodiceArmhole {
  /** Back armhole A11 → A16. */
  readonly back: number
  /** Front armhole A26 → A27. */
  readonly front: number
  /** Back armhole below the control point, A20 → A16. */
  readonly backBelowNotch: number
  /** Front armhole below the control point, A29 → A27. */
  readonly frontBelowNotch: number
}

export interface WomenSleeveOptions {
  /**
   * Total cap ease (embebido): cap length − (back + front armhole), mm. The method has no rule
   * (it is whatever cap height = armhole/3 gives); 15 mm by default, see the method doc.
   */
  readonly capEase: number
  /** Ease added to the upper arm for the bicep width (method: 4 cm). */
  readonly bicepEase: number
  /** Half wrist width = half bicep − this (method: 5 cm). */
  readonly wristReduction: number
  /** Ease left below each control notch (method: 0.35 cm). */
  readonly notchEase: number
}

export const WOMEN_SLEEVE_DEFAULTS: WomenSleeveOptions = {
  capEase: 15,
  bicepEase: 40,
  wristReduction: 50,
  notchEase: 3.5,
}

/** Fixed construction distances of the method (mm). */
export const WOMEN_SLEEVE_CONSTANTS = {
  /** Cap height = armhole sum / this (method: "la tercera parte de la sisa completa"). */
  capHeightDivisor: 3,
  /** B10 = B + |B B3|/2 + this, towards B3. */
  frontDiagonalShift: 20,
  /** B13 and B14: outward offsets at B8 and B11. */
  capRaise: 20,
  /** B15: inward offset at B9 (back). */
  backHollow: 5,
  /** B16: inward offset at B12 (front: deeper hollow). */
  frontHollow: 15,
} as const

/** Segment ids of the seams (stable for every size). */
export const WOMEN_SLEEVE_SEAMS = {
  capBack: ['sleeve.capBack.0', 'sleeve.capBack.1', 'sleeve.capBack.2', 'sleeve.capBack.3'],
  capFront: ['sleeve.capFront.0', 'sleeve.capFront.1', 'sleeve.capFront.2', 'sleeve.capFront.3'],
  underarmBack: 'sleeve.underarm.back',
  underarmFront: 'sleeve.underarm.front',
  hem: 'sleeve.hem',
} as const

/** Armhole lengths of draftWomenBodice for the same measurements (default options). */
export function womenBodiceArmhole(m: WomenBodiceMeasurements): BodiceArmhole {
  const d = draftWomenBodice(m)
  const len = (id: string) => {
    const s = d.segments[id]
    if (!s) throw new Error(`womenBodiceArmhole: missing segment "${id}"`)
    return segmentLength(s)
  }
  const [b0, b1, b2] = WOMEN_BODICE_SEAMS.back.armhole
  const [f0, f1, f2] = WOMEN_BODICE_SEAMS.front.armhole
  return {
    back: len(b0) + len(b1) + len(b2),
    front: len(f0) + len(f1) + len(f2),
    backBelowNotch: len(b1) + len(b2),
    frontBelowNotch: len(f1) + len(f2),
  }
}

/** Unit normal of the line a→b that points away from `ref`. */
const normalAway = (a: Vec, b: Vec, ref: Vec): Vec => {
  const n = perp(normalize(sub(b, a)))
  return dot(n, sub(ref, a)) > 0 ? neg(n) : n
}

interface CapGeometry {
  readonly points: Readonly<Record<string, Vec>>
  /** Back cap B4 → B (4 curves). */
  readonly back: readonly CubicBezier[]
  /** Front cap B → B3 (4 curves). */
  readonly front: readonly CubicBezier[]
  readonly backLength: number
  readonly frontLength: number
  /** Shape of the fair cap curve (reused while solving for the cap height). */
  readonly shape: FairCurveShape
}

const RIGHT = vec(1, 0)

/**
 * Cap points and curves for a given cap height (steps 3–6 of the method). The cap is ONE fair
 * curve B4 → B → B3 through the method's points: horizontal at the underarm points and at the top
 * (method: 180° / 0°), curvature continuous everywhere (also at B), and one inflection on each
 * half (the hollow below the notch turning into the crown). `shape` fixes the curve's shape
 * parameters instead of fitting them.
 */
function capGeometry(capHeight: number, halfBicep: number, shape?: FairCurveShape): CapGeometry {
  const C = WOMEN_SLEEVE_CONSTANTS
  const B = vec(0, 0)
  const B2 = vec(0, capHeight)
  const B3 = vec(halfBicep, capHeight)
  const B4 = vec(-halfBicep, capHeight)
  // Back diagonal B4–B in three equal parts; B9 halves the lowest third.
  const backDiag = distance(B4, B)
  const B7 = pointAlong(B4, B, backDiag / 3)
  const B8 = pointAlong(B4, B, (2 * backDiag) / 3)
  const B9 = midpoint(B4, B7)
  // Front diagonal B–B3 in four unequal parts.
  const B10 = pointAlong(B, B3, distance(B, B3) / 2 + C.frontDiagonalShift)
  const B11 = midpoint(B, B10)
  const B12 = midpoint(B10, B3)
  const outBack = normalAway(B4, B, B2)
  const outFront = normalAway(B, B3, B2)
  const B13 = add(B8, scale(outBack, C.capRaise))
  const B14 = add(B11, scale(outFront, C.capRaise))
  const B15 = add(B9, scale(outBack, -C.backHollow))
  const B16 = add(B12, scale(outFront, -C.frontHollow))
  const fit = fitFairCurve([B4, B15, B7, B13, B, B14, B10, B16, B3], RIGHT, RIGHT, {
    tangents: { 4: RIGHT },
    inflections: 2,
    shape,
  })
  const rename = (c: CubicBezier, id: string) => cubic(id, c.p0, c.p1, c.p2, c.p3)
  const back = fit.curves.slice(0, 4).map((c, i) => rename(c, WOMEN_SLEEVE_SEAMS.capBack[i]))
  const front = fit.curves.slice(4).map((c, i) => rename(c, WOMEN_SLEEVE_SEAMS.capFront[i]))
  const total = (cs: readonly CubicBezier[]) => cs.reduce((s, c) => s + segmentLength(c), 0)
  return {
    points: { B, B2, B3, B4, B7, B8, B9, B10, B11, B12, B13, B14, B15, B16 },
    back,
    front,
    backLength: total(back),
    frontLength: total(front),
    shape: fit.shape,
  }
}

/** Chord-length cap (no search): only used to estimate the size before fitting the fair shape. */
const CHORD_SHAPE: FairCurveShape = { speeds: [1, 1, 1, 1], knots: [1, 1, 1, 1, 1, 1, 1, 1] }

/**
 * Cap whose length equals `target`. The height is first solved with a plain chord-length cap,
 * the fair shape fitted at that height, and the height solved again with the shape fixed, so the
 * final cap is fair AND exactly the target length (bisection; cap length grows with the height).
 */
function solveCap(target: number, halfBicep: number, guess: number): CapGeometry {
  const h1 = solveCapHeight(target, halfBicep, guess, CHORD_SHAPE)
  const shape = capGeometry(h1, halfBicep).shape
  return capGeometry(solveCapHeight(target, halfBicep, h1, shape), halfBicep, shape)
}

function solveCapHeight(
  target: number,
  halfBicep: number,
  guess: number,
  shape: FairCurveShape,
): number {
  const f = (h: number) => {
    const g = capGeometry(h, halfBicep, shape)
    return g.backLength + g.frontLength - target
  }
  let lo = guess * 0.4
  let hi = guess * 1.8
  if (f(lo) > 0 || f(hi) < 0)
    throw new Error('draftWomenSleeve: cannot fit the cap to the armhole (check the measurements)')
  for (let i = 0; i < 60 && hi - lo > 1e-7; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) < 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export interface WomenSleeveDraftInput {
  /** Override the bodice armhole (defaults to draftWomenBodice with default options). */
  readonly armhole?: BodiceArmhole
}

/**
 * Draft the women's base sleeve. `measurements` are in mm (getMeasurements of the
 * co-women-industrial table); options fall back to WOMEN_SLEEVE_DEFAULTS.
 */
export function draftWomenSleeve(
  measurements: WomenSleeveMeasurements,
  options: Partial<WomenSleeveOptions> & WomenSleeveDraftInput = {},
): Draft {
  const m = measurements
  const o: WomenSleeveOptions = { ...WOMEN_SLEEVE_DEFAULTS, ...options }
  const arm = options.armhole ?? womenBodiceArmhole(m)
  const b = new DraftBuilder()
  const P = (name: string, p: Vec) => b.point(name, p)

  // ---- 1–2. Sleeve length, bicep and cap height (trued to the armhole + embebido) ----
  const halfBicep = (m.upperArm + o.bicepEase) / 2
  const methodCapHeight = (arm.back + arm.front) / WOMEN_SLEEVE_CONSTANTS.capHeightDivisor
  const g = solveCap(arm.back + arm.front + o.capEase, halfBicep, methodCapHeight)
  const capHeight = g.points.B2.y
  for (const [name, p] of Object.entries(g.points)) P(name, p)
  P('B1', vec(0, m.sleeveLength))

  // ---- 3. Wrist ----
  const halfWrist = halfBicep - o.wristReduction
  if (halfWrist <= 0) throw new Error('draftWomenSleeve: wrist width is not positive')
  P('B5', vec(halfWrist, m.sleeveLength))
  P('B6', vec(-halfWrist, m.sleeveLength))

  // ---- 7. Ease distribution and notches along the cap (B4 → B → B3) ----
  const cap = path([...g.back, ...g.front])
  const capLength = g.backLength + g.frontLength
  const at = (s: number) => pathPointAtLength(cap, s).point
  P('B18', at(arm.back)) // end of the back armhole measured from B4
  P('B19', at(capLength - arm.front)) // end of the front armhole measured from B3
  const B21 = P('B21', at((arm.back + capLength - arm.front) / 2)) // shoulder notch
  const B20 = P('B20', at(arm.backBelowNotch + o.notchEase)) // back control notch (↔ A20)
  const B17 = P('B17', at(capLength - arm.frontBelowNotch - o.notchEase)) // front notch (↔ A29)

  // =================== segments ===================
  b.line('c.centre', 'B', 'B1')
  b.line('c.bicep', 'B4', 'B3')
  b.line('c.capBack', 'B4', 'B')
  b.line('c.capFront', 'B', 'B3')
  b.line('c.backRaise', 'B8', 'B13')
  b.line('c.frontRaise', 'B11', 'B14')
  b.line('c.backHollow', 'B9', 'B15')
  b.line('c.frontHollow', 'B12', 'B16')

  const names = (ids: readonly string[], pts: readonly string[]) =>
    ids.forEach((id, i) => {
      const c = id.startsWith('sleeve.capBack') ? g.back[i] : g.front[i]
      b.segment(c, { from: pts[i], to: pts[i + 1] })
    })
  names(WOMEN_SLEEVE_SEAMS.capBack, ['B4', 'B15', 'B7', 'B13', 'B'])
  names(WOMEN_SLEEVE_SEAMS.capFront, ['B', 'B14', 'B10', 'B16', 'B3'])
  b.line(WOMEN_SLEEVE_SEAMS.underarmBack, 'B4', 'B6')
  b.line(WOMEN_SLEEVE_SEAMS.underarmFront, 'B3', 'B5')
  b.line(WOMEN_SLEEVE_SEAMS.hem, 'B5', 'B6')

  // Grainline: parallel to the centre line, through the shoulder notch.
  const grain = [vec(B21.x, capHeight + 30), vec(B21.x, m.sleeveLength - 60)] as const
  b.line('sleeve.grain', grain[0], grain[1])

  const marks: PieceMark[] = [
    {
      id: 'sleeve.grainline',
      kind: 'grainline',
      at: scale(add(grain[0], grain[1]), 0.5),
      data: { segment: 'sleeve.grain' },
    },
    { id: 'sleeve.notch.front', kind: 'notch', at: B17, data: { count: 1, matches: 'A29' } },
    { id: 'sleeve.notch.back', kind: 'notch', at: B20, data: { count: 2, matches: 'A20' } },
    {
      id: 'sleeve.notch.shoulder',
      kind: 'notch',
      at: B21,
      data: { count: 1, matches: 'shoulder' },
    },
  ]

  b.piece(
    'sleeve',
    'Manga',
    [
      WOMEN_SLEEVE_SEAMS.underarmBack,
      ...WOMEN_SLEEVE_SEAMS.capBack,
      ...WOMEN_SLEEVE_SEAMS.capFront,
      WOMEN_SLEEVE_SEAMS.underarmFront,
      WOMEN_SLEEVE_SEAMS.hem,
    ],
    { internalLines: ['sleeve.grain'], marks },
  )

  // =================== roles ===================
  b.role('cap', ...WOMEN_SLEEVE_SEAMS.capBack, ...WOMEN_SLEEVE_SEAMS.capFront)
  b.role('underarm', WOMEN_SLEEVE_SEAMS.underarmBack, WOMEN_SLEEVE_SEAMS.underarmFront)
  b.role('hem', WOMEN_SLEEVE_SEAMS.hem)

  return b.build()
}

// =================== measurements of the result ===================

export interface WomenSleeveMetrics {
  /** Cap seam length, back (B4 → B) and front (B → B3), and the total. */
  readonly cap: { readonly back: number; readonly front: number; readonly total: number }
  readonly capHeight: number
  readonly bicepWidth: number
  readonly wristWidth: number
  readonly underarm: { readonly back: number; readonly front: number }
  /** Cap length from each underarm point to each notch (mm). */
  readonly notches: { readonly back: number; readonly front: number; readonly shoulder: number }
}

/** Arc length from the start of a chain of curves to the point of the chain closest to `p`. */
const lengthTo = (curves: readonly CubicBezier[], p: Vec): number => {
  let best = { d: Infinity, s: 0 }
  let before = 0
  for (const c of curves) {
    const hit = nearestOnBezier(c, p, 96)
    if (hit.distance < best.d) best = { d: hit.distance, s: before + bezierLength(c, 0, hit.t) }
    before += segmentLength(c)
  }
  return best.s
}

export function measureWomenSleeve(draft: Draft): WomenSleeveMetrics {
  const S = WOMEN_SLEEVE_SEAMS
  const seg = (id: string) => {
    const s = draft.segments[id]
    if (!s) throw new Error(`measureWomenSleeve: missing segment "${id}"`)
    return s
  }
  const pt = (n: string) => {
    const v = draft.points[n]
    if (!v) throw new Error(`measureWomenSleeve: missing point "${n}"`)
    return v
  }
  const curves = (ids: readonly string[]) =>
    ids.map((id) => {
      const s = seg(id)
      if (s.kind !== 'cubic') throw new Error(`measureWomenSleeve: "${id}" is not a curve`)
      return s
    })
  const back = curves(S.capBack)
  const front = curves(S.capFront)
  const sum = (cs: readonly CubicBezier[]) => cs.reduce((s, c) => s + segmentLength(c), 0)
  const backLen = sum(back)
  const frontLen = sum(front)
  const frontFromB3 = [...front].reverse().map((c) => reverseBezier(c))
  return {
    cap: { back: backLen, front: frontLen, total: backLen + frontLen },
    capHeight: pt('B2').y - pt('B').y,
    bicepWidth: distance(pt('B4'), pt('B3')),
    wristWidth: distance(pt('B6'), pt('B5')),
    underarm: {
      back: segmentLength(seg(S.underarmBack)),
      front: segmentLength(seg(S.underarmFront)),
    },
    notches: {
      back: lengthTo(back, pt('B20')),
      front: lengthTo(frontFromB3, pt('B17')),
      shoulder: lengthTo([...back, ...front], pt('B21')),
    },
  }
}
