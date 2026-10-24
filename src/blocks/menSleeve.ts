/**
 * Men's base sleeve ("manga base hombre"), one-piece shirt/jacket sleeve that fits the men's base
 * bodice of the same size.
 *
 * Method: Tele Virtual Patronage ("Cómo cubrir un cuerpo"), "Trazado base de la camisa: la manga".
 * Cap height = the bodice's "profundidad de sisa" (PS), cap diagonals = half the armhole, cap curve
 * through the method's guide offsets on the diagonals, underarm seams hollowed 1 cm at mid length.
 * The diagonal length is then trued (solved) so that the cap is exactly armholes + embebido. Every
 * step, formula and choice is documented in docs/blocks/men-sleeve.md.
 *
 * Frame: A (cap top) at the origin, y down, sleeve centre line (RH) on x = 0, back half on the left
 * (x < 0) and front half on the right (x > 0), as in the women's sleeve. Units: mm.
 */
import {
  DraftBuilder,
  add,
  bezierLength,
  distance,
  dot,
  nearestOnBezier,
  neg,
  normalize,
  path,
  pathPointAtLength,
  perp,
  pointAlong,
  reverseBezier,
  scale,
  segmentLength,
  smoothWithTangents,
  sub,
  vec,
  type CubicBezier,
  type Draft,
  type PieceMark,
  type Vec,
} from '../core'
import type { MenKey } from '../data'
import {
  draftMenBodice,
  measureMenBodice,
  type MenBodiceMeasurementKey,
  type MenBodiceMeasurements,
} from './menBodice'

export type MenSleeveMeasurementKey =
  MenBodiceMeasurementKey | Extract<MenKey, 'sleeveLength' | 'upperArm' | 'halfCuffWidth'>

export type MenSleeveMeasurements = Readonly<Record<MenSleeveMeasurementKey, number>>

/** What the sleeve needs from the bodice it is sewn into (mm). */
export interface MenBodiceArmhole {
  /** Back armhole Q → X. */
  readonly back: number
  /** Front armhole R → Y. */
  readonly front: number
  /** Back armhole below the notch S (S → X). */
  readonly backBelowNotch: number
  /** Front armhole below the notch T (T → Y). */
  readonly frontBelowNotch: number
  /** Profundidad de sisa PS of the drafted armhole = cap height. */
  readonly depth: number
}

export interface MenSleeveOptions {
  /** Total cap ease (embebido): cap length − (back + front armhole), mm. */
  readonly capEase: number
  /** Share of the embebido left below EACH armhole notch (the rest goes over the shoulder). */
  readonly notchEaseShare: number
}

export const MEN_SLEEVE_DEFAULTS: MenSleeveOptions = {
  capEase: 10,
  notchEaseShare: 0.25,
}

/** Fixed construction distances of the method (mm). */
export const MEN_SLEEVE_CONSTANTS = {
  /** Front diagonal (from the underarm towards the top): offsets at 1/4, 1/2 and 3/4. */
  frontOffsets: [
    [0.25, -12],
    [0.5, 0],
    [0.75, 12],
  ],
  /** Back diagonal (from the top towards the underarm): offsets at 1/3, 2/3 and 5/6. */
  backOffsets: [
    [1 / 3, 15],
    [2 / 3, 0],
    [5 / 6, -5],
  ],
  /** Underarm seams hollowed this much at mid length (method: "entraremos un cm"). */
  underarmHollow: 10,
  /** Minimum bicep ease over the upper arm checked by the tests (shirt/jacket), mm. */
  minBicepEase: 60,
} as const

/** Segment ids of the seams (stable for every size). */
export const MEN_SLEEVE_SEAMS = {
  capBack: ['sleeve.capBack.0', 'sleeve.capBack.1', 'sleeve.capBack.2', 'sleeve.capBack.3'],
  capFront: ['sleeve.capFront.0', 'sleeve.capFront.1', 'sleeve.capFront.2', 'sleeve.capFront.3'],
  underarmBack: ['sleeve.underarmBack.0', 'sleeve.underarmBack.1'],
  underarmFront: ['sleeve.underarmFront.0', 'sleeve.underarmFront.1'],
  hem: 'sleeve.hem',
} as const

/** Armhole data of draftMenBodice for the same measurements (default options). */
export function menBodiceArmhole(m: MenBodiceMeasurements): MenBodiceArmhole {
  const r = measureMenBodice(draftMenBodice(m))
  return {
    back: r.armhole.back,
    front: r.armhole.front,
    backBelowNotch: r.armholeBelowNotch.back,
    frontBelowNotch: r.armholeBelowNotch.front,
    depth: r.armholeDepth,
  }
}

/** Unit normal of the line a→b that points away from `ref`. */
const normalAway = (a: Vec, b: Vec, ref: Vec): Vec => {
  const n = perp(normalize(sub(b, a)))
  return dot(n, sub(ref, a)) > 0 ? neg(n) : n
}

interface CapGeometry {
  readonly points: Readonly<Record<string, Vec>>
  /** Back cap D → A (4 curves). */
  readonly back: readonly CubicBezier[]
  /** Front cap A → E (4 curves). */
  readonly front: readonly CubicBezier[]
  readonly backLength: number
  readonly frontLength: number
  readonly halfBicep: number
}

const RIGHT = vec(1, 0)
const total = (cs: readonly CubicBezier[]) => cs.reduce((s, c) => s + segmentLength(c), 0)

/** Cap points and curves for a diagonal length `diag` and cap height `h` (steps 2–5). */
function capGeometry(diag: number, h: number): CapGeometry {
  const C = MEN_SLEEVE_CONSTANTS
  const halfBicep = Math.sqrt(diag * diag - h * h)
  const A = vec(0, 0)
  const B = vec(0, h)
  const D = vec(-halfBicep, h)
  const E = vec(halfBicep, h)
  const outBack = normalAway(D, A, B)
  const outFront = normalAway(A, E, B)
  // Back: guide points on A → D, curve points offset from them.
  const [[bt1, bo1], [bt2, bo2], [bt3, bo3]] = C.backOffsets
  const H0 = pointAlong(A, D, diag * bt1)
  const I = pointAlong(A, D, diag * bt2)
  const J0 = pointAlong(A, D, diag * bt3)
  const H = add(H0, scale(outBack, bo1))
  const Ib = add(I, scale(outBack, bo2))
  const J = add(J0, scale(outBack, bo3))
  // Front: guide points on E → A.
  const [[ft1, fo1], [ft2, fo2], [ft3, fo3]] = C.frontOffsets
  const K0 = pointAlong(E, A, diag * ft1)
  const L0 = pointAlong(E, A, diag * ft2)
  const M0 = pointAlong(E, A, diag * ft3)
  const K = add(K0, scale(outFront, fo1))
  const L = add(L0, scale(outFront, fo2))
  const M = add(M0, scale(outFront, fo3))
  // Cap: horizontal at the underarm points and at the top.
  const back = smoothWithTangents([D, J, Ib, H, A], RIGHT, RIGHT, 'sleeve.capBack')
  const front = smoothWithTangents([A, M, L, K, E], RIGHT, RIGHT, 'sleeve.capFront')
  return {
    points: { A, B, D, E, H0, H, I: Ib, J0, J, K0, K, L, M0, M },
    back,
    front,
    backLength: total(back),
    frontLength: total(front),
    halfBicep,
  }
}

/** Diagonal length whose cap length equals `target` (bisection; the cap grows with it). */
function solveDiagonal(target: number, h: number): number {
  const f = (d: number) => {
    const g = capGeometry(d, h)
    return g.backLength + g.frontLength - target
  }
  let lo = h * 1.2
  let hi = target
  if (f(lo) > 0 || f(hi) < 0)
    throw new Error('draftMenSleeve: cannot fit the cap to the armhole (check the measurements)')
  for (let i = 0; i < 80 && hi - lo > 1e-7; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) < 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export interface MenSleeveDraftInput {
  /** Override the bodice armhole (defaults to draftMenBodice with default options). */
  readonly armhole?: MenBodiceArmhole
}

/**
 * Draft the men's base sleeve. `measurements` are in mm (getMeasurements of the es-men-easd
 * table); options fall back to MEN_SLEEVE_DEFAULTS.
 */
export function draftMenSleeve(
  measurements: MenSleeveMeasurements,
  options: Partial<MenSleeveOptions> & MenSleeveDraftInput = {},
): Draft {
  const m = measurements
  const o: MenSleeveOptions = { ...MEN_SLEEVE_DEFAULTS, ...options }
  const C = MEN_SLEEVE_CONSTANTS
  const arm = options.armhole ?? menBodiceArmhole(m)
  const b = new DraftBuilder()
  const P = (name: string, p: Vec) => b.point(name, p)

  // ---- 1–5. Cap height = PS; diagonals (method: armhole/2) trued to armhole + embebido ----
  const armhole = arm.back + arm.front
  const capHeight = arm.depth
  const diag = solveDiagonal(armhole + o.capEase, capHeight)
  const g = capGeometry(diag, capHeight)
  for (const [name, p] of Object.entries(g.points)) P(name, p)

  // ---- 6. Length and hem (EASD "ancho bocamanga" is the half hem width) ----
  const L = m.sleeveLength
  const halfHem = m.halfCuffWidth
  if (halfHem >= g.halfBicep) throw new Error('draftMenSleeve: hem is wider than the bicep')
  P('C', vec(0, L))
  const D = g.points.D
  const E = g.points.E
  const F = P('F', vec(-halfHem, L))
  const G = P('G', vec(halfHem, L))

  // ---- 7. Underarm seams hollowed 1 cm at mid length ----
  const inward = (a: Vec, z: Vec) => normalAway(a, z, vec(a.x > 0 ? 1e6 : -1e6, (a.y + z.y) / 2))
  P('N', add(add(D, scale(sub(F, D), 0.5)), scale(inward(D, F), C.underarmHollow)))
  P('O', add(add(E, scale(sub(G, E), 0.5)), scale(inward(E, G), C.underarmHollow)))

  // ---- 8. Notches along the cap (D → A → E) ----
  const cap = path([...g.back, ...g.front])
  const capLength = g.backLength + g.frontLength
  const at = (s: number) => pathPointAtLength(cap, s).point
  const below = o.capEase * o.notchEaseShare
  const Pn = P('P', at(arm.backBelowNotch + below)) // back double notch (↔ S)
  const Qn = P('Q', at(capLength - arm.frontBelowNotch - below)) // front notch (↔ T)
  const Rn = P('R', at((arm.back + capLength - arm.front) / 2)) // shoulder notch

  // =================== segments ===================
  b.line('c.centre', 'A', 'C')
  b.line('c.bicep', 'D', 'E')
  b.line('c.capBack', 'A', 'D')
  b.line('c.capFront', 'A', 'E')
  b.line('c.backRaise', 'H0', 'H')
  b.line('c.backHollow', 'J0', 'J')
  b.line('c.frontRaise', 'M0', 'M')
  b.line('c.frontHollow', 'K0', 'K')
  b.line('c.underarmBack', 'D', 'F')
  b.line('c.underarmFront', 'E', 'G')

  const register = (curves: readonly CubicBezier[], names: readonly string[]) =>
    curves.forEach((c, i) => b.segment(c, { from: names[i], to: names[i + 1] }))
  register(g.back, ['D', 'J', 'I', 'H', 'A'])
  register(g.front, ['A', 'M', 'L', 'K', 'E'])
  b.smooth('sleeve.underarmBack', ['D', 'N', 'F'])
  b.smooth('sleeve.underarmFront', ['E', 'O', 'G'])
  b.line(MEN_SLEEVE_SEAMS.hem, 'G', 'F')

  // Grainline: on the sleeve centre line (RH).
  const grain = [vec(0, capHeight + 30), vec(0, L - 60)] as const
  b.line('sleeve.grain', grain[0], grain[1])

  const marks: PieceMark[] = [
    {
      id: 'sleeve.grainline',
      kind: 'grainline',
      at: scale(add(grain[0], grain[1]), 0.5),
      data: { segment: 'sleeve.grain' },
    },
    { id: 'sleeve.notch.back', kind: 'notch', at: Pn, data: { count: 2, matches: 'S' } },
    { id: 'sleeve.notch.front', kind: 'notch', at: Qn, data: { count: 1, matches: 'T' } },
    { id: 'sleeve.notch.shoulder', kind: 'notch', at: Rn, data: { count: 1, matches: 'shoulder' } },
  ]

  const S = MEN_SLEEVE_SEAMS
  b.piece(
    'sleeve',
    'Manga',
    [S.underarmBack[1], S.underarmBack[0], ...S.capBack, ...S.capFront, ...S.underarmFront, S.hem],
    { internalLines: ['sleeve.grain'], marks },
  )

  // =================== roles ===================
  b.role('cap', ...S.capBack, ...S.capFront)
  b.role('underarm', ...S.underarmBack, ...S.underarmFront)
  b.role('hem', S.hem)

  return b.build()
}

// =================== measurements of the result ===================

export interface MenSleeveMetrics {
  /** Cap seam length, back (D → A) and front (A → E), and the total. */
  readonly cap: { readonly back: number; readonly front: number; readonly total: number }
  readonly capHeight: number
  readonly bicepWidth: number
  readonly hemWidth: number
  readonly underarm: { readonly back: number; readonly front: number }
  /** Cap length from the back underarm point D to each notch, or from E for the front (mm). */
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

export function measureMenSleeve(draft: Draft): MenSleeveMetrics {
  const S = MEN_SLEEVE_SEAMS
  const seg = (id: string) => {
    const s = draft.segments[id]
    if (!s) throw new Error(`measureMenSleeve: missing segment "${id}"`)
    return s
  }
  const pt = (n: string) => {
    const v = draft.points[n]
    if (!v) throw new Error(`measureMenSleeve: missing point "${n}"`)
    return v
  }
  const curves = (ids: readonly string[]) =>
    ids.map((id) => {
      const s = seg(id)
      if (s.kind !== 'cubic') throw new Error(`measureMenSleeve: "${id}" is not a curve`)
      return s
    })
  const back = curves(S.capBack)
  const front = curves(S.capFront)
  const sum = (ids: readonly string[]) => ids.reduce((s, id) => s + segmentLength(seg(id)), 0)
  const backLen = total(back)
  const frontLen = total(front)
  const frontFromE = [...front].reverse().map((c) => reverseBezier(c))
  return {
    cap: { back: backLen, front: frontLen, total: backLen + frontLen },
    capHeight: pt('B').y - pt('A').y,
    bicepWidth: distance(pt('D'), pt('E')),
    hemWidth: distance(pt('F'), pt('G')),
    underarm: { back: sum(S.underarmBack), front: sum(S.underarmFront) },
    notches: {
      back: lengthTo(back, pt('P')),
      front: lengthTo(frontFromE, pt('Q')),
      shoulder: lengthTo([...back, ...front], pt('R')),
    },
  }
}
