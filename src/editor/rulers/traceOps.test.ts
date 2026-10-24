import { describe, expect, it } from 'vitest'
import { WOMEN_BODICE_BLOCK, draftBlock } from '../../blocks'
import {
  applyAffine,
  applyOperations,
  autoAlignRuler,
  bestRulerTrace,
  distance,
  fitRulerToCurve,
  fitRulerToPoints,
  getRuler,
  replay,
  segmentLength,
  segmentPointAtLength,
  stripMeta,
  patternToWorldDraft,
  type Operation,
  type PatternPiece,
} from '../../core'
import { pieceMetrics } from '../canvas/draftGeometry'
import { existingCurveBetween, piecesCurveSources, planTrace } from './traceOps'

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

describe('Trazar across several edges (replaceSegmentChain) and Ajuste automático', () => {
  const sources = piecesCurveSources(pattern.pieces)
  const A26 = applyAffine(front.transform, front.points.A26)
  const A27 = applyAffine(front.transform, front.points.A27)
  const armholeIds = ['front.armhole.0', 'front.armhole.1', 'front.armhole.2']
  const oldSisa = armholeIds.reduce((t, id) => t + segmentLength(stripMeta(front.segments[id])), 0)

  it('the existing curve between two vertices is the outline between them, the shorter way', () => {
    const curve = existingCurveBetween(sources.outlines, sources.segments, A26, A27)!
    expect(distance(curve[0], A26)).toBeLessThan(0.01)
    expect(distance(curve[curve.length - 1], A27)).toBeLessThan(0.01)
    let len = 0
    for (let i = 1; i < curve.length; i++) len += distance(curve[i - 1], curve[i])
    expect(Math.abs(len - oldSisa)).toBeLessThan(0.5)
    // A single edge: its own samples, in click order.
    const { a, b } = world('front.armhole.1')
    const one = existingCurveBetween(sources.outlines, sources.segments, b, a)!
    expect(distance(one[0], b)).toBeLessThan(1e-9)
    expect(distance(one[one.length - 1], a)).toBeLessThan(1e-9)
  })

  it('auto-aligned French curve over the whole front armhole: one curve, Sisa, size 16', () => {
    const curve = existingCurveBetween(sources.outlines, sources.segments, A26, A27)!
    const fit = autoAlignRuler(french, A26, A27, { curve })!
    expect(fit.curveDeviation).toBeLessThan(6.1)
    for (const [p, q] of [
      [A26, A27],
      [A27, A26],
    ]) {
      const trace = bestRulerTrace(french, fit.pose, p, q)!
      expect(trace.warn).toBe(false)
      const plan = planTrace(
        trace,
        { at: p, snap: null },
        { at: q, snap: null },
        pattern.pieces,
        newId,
      )
      expect(plan.kind).toBe('chain')
      if (plan.kind !== 'chain') return
      const op = plan.ops[0] as { from: unknown; to: unknown; direction: unknown }
      expect([op.from, op.to].sort()).toEqual(['A26', 'A27'])
      const list = plan.ops.map((o, i) => ({ id: `c${i}`, ...o }) as Operation)
      const r = applyOperations(pattern, list)
      expect(r.issues).toEqual([])
      const p2 = r.pattern.pieces.find((x) => x.id === 'front')!
      const first = p === A26 ? 'front.armhole.0' : 'front.armhole.2'
      const ids = Object.keys(p2.segments).filter((k) => k.startsWith(`${first}~c`))
      expect(ids.length).toBe(trace.beziers.length)
      for (const id of armholeIds) expect(p2.segments[id]).toBeUndefined()
      // The Sisa readout (Piezas view) measures the new armhole.
      const sisa = pieceMetrics(patternToWorldDraft(r.pattern.pieces), 'front').armhole!
      const newLen = ids.reduce((t, id) => t + segmentLength(stripMeta(p2.segments[id])), 0)
      expect(sisa).toBeCloseTo(newLen, 6)
      expect(Math.abs(sisa - oldSisa)).toBeGreaterThan(0.01)
      // The same operations replay at size 16 without issues.
      const big = replay(draftBlock(WOMEN_BODICE_BLOCK, '16', {}), [
        { id: 'x', type: 'extractAll' },
        ...list,
      ])
      expect(big.issues).toEqual([])
    }
  }, 30_000)

  it('a run over a dart is refused before applying', () => {
    const A32 = applyAffine(front.transform, front.points.A32)
    const pose = fitRulerToCurve(french, 'curve', [A27, A32]).pose
    const trace = fitRulerToPoints(french, 'curve', pose, A27, A32)!
    const plan = planTrace(
      trace,
      { at: A27, snap: null },
      { at: A32, snap: null },
      pattern.pieces,
      newId,
    )
    expect(plan.kind).toBe('error')
    if (plan.kind === 'error') expect(plan.message).toMatch(/pinza/)
  })
})
