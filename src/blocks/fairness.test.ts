/**
 * Fairness of the curved outline chains of every block at every size (see core/fairness.ts).
 *
 * Limited (the method's armholes, necklines and sleeve caps, drafted with fairCurve): no inflection
 * (a sleeve cap has exactly one on each half, its S from the underarm hollow into the crown) and a
 * curvature jump of at most 30 % where two Béziers meet.
 *
 * Audited only (not drafted with fairCurve; see docs/blocks/*.md): the side hip curves of the
 * bodice and the skirt and the trouser hip curves are one S by construction (they leave the waist
 * along the side seam and reach the hip vertically), and the trouser crotch curves are two
 * Catmull–Rom spans whose curvature jumps at the bisector point. They must keep at most that one
 * inflection.
 */
import { describe, expect, it } from 'vitest'
import { curveFairness, stripMeta, type Draft, type Segment } from '../core'
import {
  MEN_BODICE_BLOCK,
  MEN_SLEEVE_BLOCK,
  MEN_TROUSERS_BLOCK,
  WOMEN_BODICE_BLOCK,
  WOMEN_SKIRT_BLOCK,
  WOMEN_SLEEVE_BLOCK,
  WOMEN_TROUSERS_BLOCK,
  blockSizes,
  draftBlock,
  type AnyBlockDef,
  type BlockOptions,
} from './registry'

/** Largest relative curvature jump allowed at an internal join of a limited chain. */
const MAX_JOIN_JUMP = 0.3

interface Chain {
  readonly name: string
  readonly ids: readonly string[]
  /** Exact number of inflections the method calls for (limited chains). */
  readonly inflections: number
  /** False for the chains that are only audited (at most one inflection, joins not limited). */
  readonly limited: boolean
}

const fair = (name: string, ids: readonly string[], inflections = 0): Chain => ({
  name,
  ids,
  inflections,
  limited: true,
})
const audited = (name: string, ids: readonly string[]): Chain => ({
  name,
  ids,
  inflections: 1,
  limited: false,
})

const armholes = (back: string[], front: string[]) => [
  fair('back armhole', back),
  fair('front armhole', front),
  fair('back neckline', ['back.neck']),
  fair('front neckline', ['front.neck']),
]
const ARMHOLE_IDS = (piece: string) => [0, 1, 2].map((i) => `${piece}.armhole.${i}`)
const BODICE = armholes(ARMHOLE_IDS('back'), ARMHOLE_IDS('front'))
const CAP_BACK = [0, 1, 2, 3].map((i) => `sleeve.capBack.${i}`)
const CAP_FRONT = [0, 1, 2, 3].map((i) => `sleeve.capFront.${i}`)
const CAP = [
  fair('back cap', CAP_BACK, 1),
  fair('front cap', CAP_FRONT, 1),
  fair('cap', [...CAP_BACK, ...CAP_FRONT], 2),
]
const TROUSERS = [
  audited('front crotch', ['front.crotch.0', 'front.crotch.1']),
  audited('back crotch', ['back.crotch.0', 'back.crotch.1']),
  audited('front hip curve', ['front.outseam.0']),
  audited('back hip curve', ['back.outseam.0']),
]

interface Case {
  readonly block: AnyBlockDef
  readonly options: BlockOptions
  readonly chains: readonly Chain[]
}

const CASES: readonly Case[] = [
  {
    block: WOMEN_BODICE_BLOCK,
    options: { length: 'hip' },
    chains: [
      ...BODICE,
      audited('back hip curve', ['back.sideHip']),
      audited('front hip curve', ['front.sideHip']),
    ],
  },
  { block: WOMEN_BODICE_BLOCK, options: { length: 'waist' }, chains: BODICE },
  { block: MEN_BODICE_BLOCK, options: {}, chains: BODICE },
  { block: WOMEN_SLEEVE_BLOCK, options: {}, chains: CAP },
  { block: MEN_SLEEVE_BLOCK, options: {}, chains: CAP },
  {
    block: WOMEN_SKIRT_BLOCK,
    options: {},
    chains: [
      audited('front hip curve', ['front.sideHip.0', 'front.sideHip.1']),
      audited('back hip curve', ['back.sideHip.0', 'back.sideHip.1']),
    ],
  },
  { block: WOMEN_TROUSERS_BLOCK, options: {}, chains: TROUSERS },
  { block: MEN_TROUSERS_BLOCK, options: {}, chains: TROUSERS },
]

const chainSegments = (draft: Draft, ids: readonly string[]): Segment[] =>
  ids.map((id) => {
    const s = draft.segments[id]
    if (!s) throw new Error(`missing segment "${id}"`)
    return stripMeta(s)
  })

describe('curve fairness of every block at every size', () => {
  const rows = CASES.flatMap((c) =>
    blockSizes(c.block).map(
      (size) => [`${c.block.id} ${JSON.stringify(c.options)} ${size}`, c, size] as const,
    ),
  )
  it.each(rows)('%s', (_, c, size) => {
    const draft = draftBlock(c.block, size, c.options)
    for (const ch of c.chains) {
      const r = curveFairness(chainSegments(draft, ch.ids))
      const where = `${ch.name}: inflections at ${r.inflectionsAt.map((s) => s.toFixed(1)).join(', ')} mm`
      if (ch.limited) {
        expect(r.inflections, where).toBe(ch.inflections)
        expect(r.maxJoinJump, `${ch.name}: join jump`).toBeLessThanOrEqual(MAX_JOIN_JUMP)
      } else expect(r.inflections, where).toBeLessThanOrEqual(ch.inflections)
    }
  })

  it('each half of a sleeve cap has its inflection', () => {
    for (const block of [WOMEN_SLEEVE_BLOCK, MEN_SLEEVE_BLOCK])
      for (const size of blockSizes(block)) {
        const draft = draftBlock(block, size)
        const back = curveFairness(chainSegments(draft, CAP_BACK))
        const whole = curveFairness(chainSegments(draft, [...CAP_BACK, ...CAP_FRONT]))
        expect(whole.inflectionsAt[0]).toBeLessThan(back.length)
        expect(whole.inflectionsAt[1]).toBeGreaterThan(back.length)
      }
  })
})
