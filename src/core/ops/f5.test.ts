import { describe, expect, it } from 'vitest'
import { WOMEN_BODICE_BLOCK, draftBlock, isHalfPiece } from '../../blocks'
import { splitBezier } from '../bezier'
import { stripMeta } from '../draft'
import {
  isContiguousChain,
  lengthBetweenOnClosedPath,
  positionOnPath,
  segmentsLength,
} from '../measure'
import {
  isContinuous,
  line,
  path,
  segEnd,
  segmentLength,
  segmentPointAtLength,
  type Segment,
} from '../path'
import { fitRulerToCurve, fitRulerToPoints, getRuler } from '../rulers'
import { distance, vec } from '../vec'
import { chainToChordFrame, chordFrameToChain } from './curves'
import { pieceLocalPath } from './pattern'
import { replay } from './replay'
import type { ChordBezier, Operation, OperationInput, PatternPiece, ReplayOptions } from './types'
import { isOperation } from './validate'

let n = 0
const ops = (...list: OperationInput[]) => list.map((o) => ({ ...o, id: `f5-${++n}` }) as Operation)
const options: ReplayOptions = {
  pieceDefaults: (id) => ({ halfPiece: isHalfPiece(WOMEN_BODICE_BLOCK, id) }),
}
const run = (size: string, list: readonly Operation[]) =>
  replay(draftBlock(WOMEN_BODICE_BLOCK, size, {}), list, options)
const front = (pieces: readonly PatternPiece[]) => pieces.find((p) => p.id === 'front')!

const ARMHOLE = 'front.armhole.1'

/** The armhole segment of `size`, re-shaped along the French curve: a chord-frame chain. */
const tracedArmhole = (size: string): ChordBezier[] => {
  const piece = front(run(size, ops({ type: 'extractAll' })).pattern.pieces)
  const s = stripMeta(piece.segments[ARMHOLE])
  const pts = Array.from(
    { length: 31 },
    (_, i) => segmentPointAtLength(s, (segmentLength(s) * i) / 30).point,
  )
  const french = getRuler('french')
  const fit = fitRulerToCurve(french, 'curve', pts)
  const trace = fitRulerToPoints(french, 'curve', fit.pose, s.p0, segEnd(s))!
  // At least two cubics, to exercise the chain.
  const chain = trace.beziers.length > 1 ? trace.beziers : splitBezier(trace.beziers[0], 0.5)
  return chainToChordFrame(chain)
}

const notchAt = (p: PatternPiece, id: string) => p.marks.find((m) => m.id === id)!

describe('replaceSegmentCurve', () => {
  it('chord frame round trip', () => {
    const p0 = vec(10, 20)
    const p3 = vec(80, -5)
    const q = vec(33.3, 7.1)
    const cf = chainToChordFrame([
      { kind: 'cubic', id: 'a', p0, p1: q, p2: vec(50, 50), p3: vec(60, 0) },
      { kind: 'cubic', id: 'b', p0: vec(60, 0), p1: vec(70, -1), p2: vec(75, -3), p3 },
    ])
    const back = chordFrameToChain(p0, p3, cf, ['a', 'b'])
    expect(distance(back[0].p1, q)).toBeLessThan(1e-9)
    expect(distance(back[1].p3, p3)).toBe(0)
    expect(cf[1].to).toEqual({ x: 1, y: 0 })
  })

  it('replaces the armhole by the traced chain, keeps notches (atRatio) and allowances, replays at another size', () => {
    const beziers = tracedArmhole('10')
    expect(beziers.length).toBeGreaterThan(1)
    const list = ops(
      { type: 'extractAll' },
      { type: 'setSeamAllowance', pieceId: 'front', segmentIds: [ARMHOLE], mm: 12 },
      { type: 'addNotch', pieceId: 'front', segmentId: ARMHOLE, atRatio: 0.4 },
      { type: 'replaceSegmentCurve', pieceId: 'front', segmentId: ARMHOLE, beziers },
    )
    const notchId = list[2].id
    for (const size of ['10', '6', '16']) {
      const before = front(run(size, list.slice(0, 3)).pattern.pieces)
      const old = stripMeta(before.segments[ARMHOLE])
      const r = run(size, list)
      expect(r.issues, size).toEqual([])
      const p = front(r.pattern.pieces)
      const ids = beziers.map((_, i) => `${ARMHOLE}~${i + 1}`)
      expect(p.segments[ARMHOLE]).toBeUndefined()
      for (const id of ids) {
        expect(p.segments[id].role).toBe('armhole')
        expect(p.allowance[id]).toBe(12)
      }
      // Same endpoints as the original edge; the outline stays closed and continuous.
      const chain = ids.map((id) => stripMeta(p.segments[id]))
      expect(distance(chain[0].p0, old.p0)).toBeLessThan(1e-9)
      expect(distance(segEnd(chain[chain.length - 1]), segEnd(old))).toBeLessThan(1e-9)
      expect(isContinuous(pieceLocalPath(p), 1e-6)).toBe(true)
      expect(p.outline.filter((o) => ids.includes(o.segment))).toHaveLength(ids.length)
      // The notch keeps 40 % of the length of the (new) edge.
      const notch = notchAt(p, notchId)
      const total = segmentsLength(chain)
      const want = (() => {
        let rest = 0.4 * total
        for (const s of chain) {
          if (rest <= segmentLength(s)) return segmentPointAtLength(s, rest).point
          rest -= segmentLength(s)
        }
        return segEnd(chain[chain.length - 1])
      })()
      expect(distance(notch.at, want)).toBeLessThan(1e-6)
      expect(ids).toContain(notch.data?.segment)
      // Interior joins are named points of the piece.
      expect(distance(p.points[`${ARMHOLE}~p1`], segEnd(chain[0]))).toBeLessThan(1e-9)
      // The armhole length changes only slightly (the curve is the ruler's, not a new shape).
      expect(Math.abs(total - segmentLength(old)) / segmentLength(old)).toBeLessThan(0.05)
    }
  })

  it('a single cubic keeps the id; the op is validated', () => {
    const one: ChordBezier[] = [
      { c1: { x: 0.3, y: 0.1 }, c2: { x: 0.7, y: 0.1 }, to: { x: 1, y: 0 } },
    ]
    const list = ops(
      { type: 'extractAll' },
      { type: 'replaceSegmentCurve', pieceId: 'front', segmentId: ARMHOLE, beziers: one },
    )
    const r = run('10', list)
    expect(r.issues).toEqual([])
    expect(front(r.pattern.pieces).segments[ARMHOLE].kind).toBe('cubic')
    expect(isOperation(list[1])).toBe(true)
    expect(isOperation({ ...list[1], beziers: [] })).toBe(false)
    expect(
      isOperation({
        ...list[1],
        beziers: [{ c1: { x: 0 }, c2: { x: 0, y: 0 }, to: { x: 1, y: 0 } }],
      }),
    ).toBe(false)
    // A missing segment or a grainline is an issue, not a crash.
    const bad = run('10', [
      ...list.slice(0, 1),
      ...ops({ type: 'replaceSegmentCurve', pieceId: 'front', segmentId: 'nope', beziers: one }),
    ])
    expect(bad.issues).toHaveLength(1)
  })
})

describe('measure', () => {
  const sq: Segment[] = [
    line('a', vec(0, 0), vec(100, 0)),
    line('b', vec(100, 0), vec(100, 50)),
    line('c', vec(100, 50), vec(0, 50)),
    line('d', vec(0, 50), vec(0, 0)),
  ]
  const outline = path(sq, true)

  it('path length between two points of a closed outline, both ways round', () => {
    const span = lengthBetweenOnClosedPath(outline, vec(20, 0), vec(100, 30))
    expect(span.forward).toBeCloseTo(110, 9)
    expect(span.backward).toBeCloseTo(190, 9)
    expect(span.shortest).toBeCloseTo(110, 9)
    const back = lengthBetweenOnClosedPath(outline, vec(100, 30), vec(20, 0.4))
    expect(back.forward).toBeCloseTo(190, 9)
    expect(back.offB).toBeCloseTo(0.4, 9)
    expect(positionOnPath(outline, vec(-3, 25)).s).toBeCloseTo(275, 9)
  })

  it('on a curved outline (the bodice front)', () => {
    const p = front(run('10', ops({ type: 'extractAll' })).pattern.pieces)
    const local = pieceLocalPath(p)
    const arm = stripMeta(p.segments[ARMHOLE])
    const span = lengthBetweenOnClosedPath(local, arm.p0, segEnd(arm))
    expect(Math.min(span.forward, span.backward)).toBeCloseTo(segmentLength(arm), 4)
  })

  it('contiguous chains of segments', () => {
    expect(isContiguousChain([sq[0], sq[1], sq[2]])).toBe(true)
    // Directions do not matter.
    expect(isContiguousChain([sq[1], sq[0]])).toBe(true)
    expect(isContiguousChain([sq[0], sq[2]])).toBe(false)
    expect(segmentsLength([sq[0], sq[1]])).toBe(150)
  })
})
