import { describe, expect, it } from 'vitest'
import { WOMEN_BODICE_BLOCK, draftBlock } from '../../blocks'
import {
  applyAffine,
  applyOperations,
  fitRulerToCurve,
  fitRulerToPoints,
  getRuler,
  replay,
  segmentLength,
  segmentPointAtLength,
  stripMeta,
  type Operation,
  type PatternPiece,
} from '../../core'
import { planTrace } from './traceOps'

const pattern = replay(draftBlock(WOMEN_BODICE_BLOCK, '10', {}), [
  { id: 'x', type: 'extractAll' },
]).pattern
const front = pattern.pieces.find((p) => p.id === 'front') as PatternPiece
const world = (id: string) => {
  const s = stripMeta(front.segments[id])
  const pts = Array.from({ length: 31 }, (_, i) =>
    applyAffine(front.transform, segmentPointAtLength(s, (segmentLength(s) * i) / 30).point),
  )
  return { pts, a: pts[0], b: pts[30] }
}
const french = getRuler('french')
let n = 0
const newId = () => `line-${++n}`

describe('planTrace', () => {
  it('between the ends of a segment: replaceSegmentCurve (either click order)', () => {
    const { pts, a, b } = world('front.armhole.1')
    const pose = fitRulerToCurve(french, 'curve', pts).pose
    for (const [p, q] of [
      [a, b],
      [b, a],
    ]) {
      const trace = fitRulerToPoints(french, 'curve', pose, p, q)!
      const plan = planTrace(
        trace,
        { at: p, snap: null },
        { at: q, snap: null },
        pattern.pieces,
        newId,
      )
      expect(plan.kind).toBe('replace')
      if (plan.kind !== 'replace') return
      expect(plan.segmentId).toBe('front.armhole.1')
      const r = applyOperations(
        pattern,
        plan.ops.map((o, i) => ({ id: `t${i}`, ...o }) as Operation),
      )
      expect(r.issues).toEqual([])
      // The new curve still starts where the segment started.
      const p2 = r.pattern.pieces.find((x) => x.id === 'front')!
      const first = Object.keys(p2.segments).find((k) => k.startsWith('front.armhole.1'))!
      const start = applyAffine(p2.transform, stripMeta(p2.segments[first]).p0)
      expect(Math.hypot(start.x - a.x, start.y - a.y)).toBeLessThan(1e-6)
    }
  })

  it('between two other points of a piece: a curved internal line', () => {
    const arm = world('front.armhole.1')
    const side = world('front.side')
    const p = arm.pts[15]
    const q = side.pts[15]
    const pose = fitRulerToCurve(french, 'curve', [p, q]).pose
    const trace = fitRulerToPoints(french, 'curve', pose, p, q)!
    const plan = planTrace(
      trace,
      { at: p, snap: null },
      { at: q, snap: null },
      pattern.pieces,
      newId,
    )
    expect(plan.kind).toBe('line')
    if (plan.kind !== 'line') return
    expect(plan.ops[0].type).toBe('addInternalLine')
    const r = applyOperations(
      pattern,
      plan.ops.map((o, i) => ({ id: `u${i}`, ...o }) as Operation),
    )
    expect(r.issues).toEqual([])
  })

  it('points outside every piece: an error to show', () => {
    const p = { x: -5000, y: 0 }
    const q = { x: -4800, y: 40 }
    const pose = fitRulerToCurve(french, 'curve', [p, q]).pose
    const trace = fitRulerToPoints(french, 'curve', pose, p, q)!
    const plan = planTrace(
      trace,
      { at: p, snap: null },
      { at: q, snap: null },
      pattern.pieces,
      newId,
    )
    expect(plan.kind).toBe('error')
  })
})
