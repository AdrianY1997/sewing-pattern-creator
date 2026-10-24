import { describe, expect, it } from 'vitest'
import { WOMEN_BODICE_BLOCK, draftBlock, isHalfPiece } from '../../blocks'
import { DraftBuilder, stripMeta } from '../draft'
import {
  flattenPath,
  isContinuous,
  polygonSignedArea,
  segEnd,
  segmentLength,
  segmentPointAtLength,
  type Segment,
} from '../path'
import { autoAlignRuler, getRuler, sampleSegments } from '../rulers'
import { distance, vec, type Vec } from '../vec'
import { chainToChordFrame, outlineChainBetween } from './curves'
import { orientedOutline, vertexIndexAt } from './edit'
import { pieceLocalPath } from './pattern'
import { replay } from './replay'
import type { ChordBezier, Operation, OperationInput, PatternPiece, ReplayOptions } from './types'
import { isOperation } from './validate'

let n = 0
const ops = (...list: OperationInput[]) =>
  list.map((o) => ({ ...o, id: `f5b-${++n}` }) as Operation)
const options: ReplayOptions = {
  pieceDefaults: (id) => ({ halfPiece: isHalfPiece(WOMEN_BODICE_BLOCK, id) }),
}
const run = (size: string, list: readonly Operation[]) =>
  replay(draftBlock(WOMEN_BODICE_BLOCK, size, {}), list, options)
const pieceOf = (pieces: readonly PatternPiece[], id: string) => {
  const p = pieces.find((q) => q.id === id)
  if (!p) throw new Error(`no piece ${id}`)
  return p
}
const area = (p: PatternPiece) => Math.abs(polygonSignedArea(flattenPath(pieceLocalPath(p), 0.05)))
const sumRole = (p: PatternPiece, role: string) =>
  p.outline
    .filter((r) => p.segments[r.segment].role === role)
    .reduce((a, r) => a + segmentLength(stripMeta(p.segments[r.segment])), 0)

/** Point at `ratio` of the arc length of a chain of segments. */
const chainPoint = (segs: readonly Segment[], ratio: number): Vec => {
  let rest = ratio * segs.reduce((a, s) => a + segmentLength(s), 0)
  for (const s of segs) {
    if (rest <= segmentLength(s)) return segmentPointAtLength(s, rest).point
    rest -= segmentLength(s)
  }
  return segEnd(segs[segs.length - 1])
}

const ARMHOLE = ['front.armhole.0', 'front.armhole.1', 'front.armhole.2'] as const

/** The front armhole of `size` from the shoulder (A26) to the side (A27), oriented. */
const armholeChain = (p: PatternPiece): Segment[] => ARMHOLE.map((id) => stripMeta(p.segments[id]))

/** The French curve traced along the whole front armhole of size 10 at its best-fit pose. */
const tracedArmhole = () => {
  const base = pieceOf(run('10', ops({ type: 'extractAll' })).pattern.pieces, 'front')
  const segs = armholeChain(base)
  const curve = sampleSegments(segs, 1)
  const fit = autoAlignRuler(getRuler('french'), curve[0], curve[curve.length - 1], { curve })
  if (!fit) throw new Error('no fit')
  return { fit, beziers: chainToChordFrame(fit.trace.beziers), base }
}

describe('replaceSegmentChain', () => {
  it('traces the 3-segment front armhole as one curve: closed outline, role, notches, size 16', () => {
    const { fit, beziers, base } = tracedArmhole()
    expect(fit.trace.beziers.length).toBeGreaterThan(1)
    // The front piece is extracted untransformed: world = local.
    expect(distance(fit.trace.beziers[0].p0, base.points.A26)).toBeLessThan(1e-9)
    const list = ops(
      { type: 'extractAll' },
      { type: 'setSeamAllowance', pieceId: 'front', segmentIds: [...ARMHOLE], mm: 8 },
      { type: 'addNotch', pieceId: 'front', segmentId: 'front.armhole.0', atRatio: 0.5 },
      { type: 'addNotch', pieceId: 'front', segmentId: 'front.armhole.2', atRatio: 0.3 },
      { type: 'replaceSegmentChain', pieceId: 'front', from: 'A26', to: 'A27', beziers },
    )
    const notchIds = [list[2].id, list[3].id]
    for (const size of ['10', '6', '16']) {
      const before = pieceOf(run(size, list.slice(0, 4)).pattern.pieces, 'front')
      const old = armholeChain(before)
      const oldLen = old.reduce((a, s) => a + segmentLength(s), 0)
      // Arc-length ratio of each notch along the old armhole (both edges run A26 → A27).
      const lens = old.map((s) => segmentLength(s))
      const ratios = [(0.5 * lens[0]) / oldLen, (lens[0] + lens[1] + 0.3 * lens[2]) / oldLen]
      const r = run(size, list)
      expect(r.issues, size).toEqual([])
      const p = pieceOf(r.pattern.pieces, 'front')
      const ids = beziers.map((_, i) => `front.armhole.0~c${i + 1}`)
      for (const id of ARMHOLE) expect(p.segments[id], id).toBeUndefined()
      for (const id of ids) {
        expect(p.segments[id].role).toBe('armhole')
        expect(p.allowance[id]).toBe(8)
      }
      // One continuous closed outline; the new run sits where the armhole was.
      expect(isContinuous(pieceLocalPath(p), 1e-6)).toBe(true)
      expect(p.outline).toHaveLength(before.outline.length - 3 + ids.length)
      const chain = ids.map((id) => stripMeta(p.segments[id]))
      expect(distance(chain[0].p0, before.points.A26)).toBeLessThan(1e-9)
      expect(distance(segEnd(chain[chain.length - 1]), before.points.A27)).toBeLessThan(1e-9)
      // Area changes only by the shape of the new curve (within the 6 mm fit, ~1 %).
      expect(Math.abs(area(p) - area(before)) / area(before)).toBeLessThan(0.02)
      // The armhole length ("Sisa") is the new curve's.
      const newLen = chain.reduce((a, s) => a + segmentLength(s), 0)
      expect(sumRole(p, 'armhole')).toBeCloseTo(newLen, 6)
      expect(Math.abs(newLen - oldLen) / oldLen).toBeLessThan(0.03)
      // The interior vertices of the old armhole are gone; the new joins are named points.
      expect(p.points.A29).toBeUndefined()
      expect(p.points.A30).toBeUndefined()
      expect(distance(p.points['front.armhole.0~cp1'], segEnd(chain[0]))).toBeLessThan(1e-9)
      // Notches keep their arc-length ratio along the run, on the new edges.
      notchIds.forEach((id, i) => {
        const m = p.marks.find((x) => x.id === id)!
        expect(ids).toContain(m.data?.segment)
        expect(distance(m.at, chainPoint(chain, ratios[i]))).toBeLessThan(1e-6)
      })
    }
  })

  it('the shorter way round by default, a direction on request, also across the outline start', () => {
    const b = new DraftBuilder()
    b.point('A', vec(0, 0))
    b.point('B', vec(100, 0))
    b.point('C', vec(100, 100))
    b.point('D', vec(0, 100))
    b.line('s.top', 'A', 'B')
    b.bezier('s.right', 'B', vec(160, 30), vec(160, 70), 'C')
    b.line('s.bottom', 'C', 'D')
    b.line('s.left', 'D', 'A')
    b.piece('sq', 'Cuadrado', ['s.top', 's.right', 's.bottom', 's.left'])
    const draft = b.build()
    const one: ChordBezier[] = [
      { c1: { x: 0.3, y: -0.2 }, c2: { x: 0.7, y: -0.2 }, to: { x: 1, y: 0 } },
    ]
    const sqOps = (o: OperationInput) => replay(draft, ops({ type: 'extractAll' }, o))
    // A → C: left + bottom (200 mm) is shorter than top + the bulging right edge.
    const short = sqOps({
      type: 'replaceSegmentChain',
      pieceId: 'sq',
      from: 'A',
      to: 'C',
      beziers: one,
    })
    expect(short.issues).toEqual([])
    const p = pieceOf(short.pattern.pieces, 'sq')
    expect(p.outline.map((r) => r.segment)).toEqual(['s.top', 's.right', 's.left~c1'])
    expect(p.outline[2].reversed).toBe(true)
    expect(isContinuous(pieceLocalPath(p), 1e-6)).toBe(true)
    // forward: top + right.
    const fwd = sqOps({
      type: 'replaceSegmentChain',
      pieceId: 'sq',
      from: 'A',
      to: 'C',
      beziers: one,
      direction: 'forward',
    })
    expect(fwd.issues).toEqual([])
    const q = pieceOf(fwd.pattern.pieces, 'sq')
    expect(q.outline.map((r) => r.segment)).toEqual(['s.top~c1', 's.bottom', 's.left'])
    expect(isContinuous(pieceLocalPath(q), 1e-6)).toBe(true)
    // D → B forward runs left then top: across the start of the outline.
    const wrap = sqOps({
      type: 'replaceSegmentChain',
      pieceId: 'sq',
      from: { segmentId: 's.left', end: 'start' },
      to: 'B',
      beziers: [...one, ...one],
      direction: 'forward',
    })
    expect(wrap.issues).toEqual([])
    const w = pieceOf(wrap.pattern.pieces, 'sq')
    expect(w.outline.map((r) => r.segment)).toEqual([
      's.left~c1',
      's.left~c2',
      's.right',
      's.bottom',
    ])
    expect(isContinuous(pieceLocalPath(w), 1e-6)).toBe(true)
    // The run is found again from the vertices (helper used by the Trazar tool).
    const base = pieceOf(replay(draft, ops({ type: 'extractAll' })).pattern.pieces, 'sq')
    const ia = vertexIndexAt(base, base.points.A)
    const ic = vertexIndexAt(base, base.points.C)
    expect(outlineChainBetween(base, ia, ic).links.map((l) => l.id)).toEqual(['s.left', 's.bottom'])
    expect(orientedOutline(base, ia).p0).toEqual(base.points.A)
  })

  it('reports bad references and runs through a dart; validates the operation', () => {
    const one: ChordBezier[] = [{ c1: { x: 0.3, y: 0 }, c2: { x: 0.7, y: 0 }, to: { x: 1, y: 0 } }]
    const bad = run(
      '10',
      ops(
        { type: 'extractAll' },
        { type: 'replaceSegmentChain', pieceId: 'front', from: 'A26', to: 'A26', beziers: one },
        { type: 'replaceSegmentChain', pieceId: 'front', from: 'A26', to: 'A34', beziers: one },
        // A27 → A32 runs over the side bust dart opening.
        { type: 'replaceSegmentChain', pieceId: 'front', from: 'A27', to: 'A32', beziers: one },
      ),
    )
    expect(bad.issues.map((i) => i.message)).toEqual([
      'Los dos puntos son el mismo vértice',
      'Los dos puntos deben ser vértices del contorno de la pieza',
      'El tramo pasa por una pinza: traza a cada lado de ella',
    ])
    const op = ops({
      type: 'replaceSegmentChain',
      pieceId: 'front',
      from: 'A26',
      to: { segmentId: 'front.side', end: 'start' },
      beziers: one,
      direction: 'backward',
    })[0]
    expect(isOperation(op)).toBe(true)
    expect(isOperation({ ...op, direction: 'up' })).toBe(false)
    expect(isOperation({ ...op, from: 3 })).toBe(false)
    expect(isOperation({ ...op, beziers: [] })).toBe(false)
  })
})

describe('splitPiece with traced and vertex-ended lines', () => {
  const square = () => {
    const b = new DraftBuilder()
    b.point('A', vec(0, 0))
    b.point('B', vec(100, 0))
    b.point('C', vec(100, 100))
    b.point('D', vec(0, 100))
    b.line('s.top', 'A', 'B')
    b.line('s.right', 'B', 'C')
    b.line('s.bottom', 'C', 'D')
    b.line('s.left', 'D', 'A')
    b.line('s.grain', vec(50, 20), vec(50, 80))
    b.piece('sq', 'Cuadrado', ['s.top', 's.right', 's.bottom', 's.left'], {
      internalLines: ['s.grain'],
      marks: [
        { id: 'sq.grainline', kind: 'grainline', at: vec(50, 50), data: { segment: 's.grain' } },
      ],
    })
    return b.build()
  }
  const whole = area(pieceOf(replay(square(), ops({ type: 'extractAll' })).pattern.pieces, 'sq'))
  /** A curved line traced as three cubics (as F5 makes when one cubic cannot follow the ruler). */
  const traced: Operation[] = [
    ...ops({ type: 'extractAll' }),
    {
      id: 'cut',
      type: 'addInternalLine',
      pieceId: 'sq',
      from: { segmentId: 's.left', atRatio: 0.7 },
      to: { segmentId: 's.right', atRatio: 0.4 },
      kind: 'curve',
    },
    ...ops({
      type: 'replaceSegmentCurve',
      pieceId: 'sq',
      segmentId: 'cut',
      beziers: [
        { c1: { x: 0.1, y: 0.1 }, c2: { x: 0.25, y: 0.15 }, to: { x: 0.33, y: 0.12 } },
        { c1: { x: 0.4, y: 0.1 }, c2: { x: 0.6, y: -0.1 }, to: { x: 0.66, y: -0.08 } },
        { c1: { x: 0.75, y: -0.06 }, c2: { x: 0.9, y: -0.02 }, to: { x: 1, y: 0 } },
      ],
    }),
  ]

  it('splits along a multi-segment traced line, by its id or by any of its segments', () => {
    const lined = replay(square(), traced)
    expect(lined.issues).toEqual([])
    expect(pieceOf(lined.pattern.pieces, 'sq').internalLines).toContain('cut~2')
    for (const lineId of ['cut', 'cut~2', 'cut~3']) {
      const r = replay(square(), [...traced, ...ops({ type: 'splitPiece', pieceId: 'sq', lineId })])
      expect(r.issues, lineId).toEqual([])
      expect(r.pattern.pieces.map((p) => p.id)).toEqual(['sq~a', 'sq~b'])
      const [a, b] = r.pattern.pieces
      expect(Math.abs(area(a) + area(b) - whole) / whole).toBeLessThan(0.001)
      for (const p of [a, b]) {
        expect(isContinuous(pieceLocalPath(p), 1e-6)).toBe(true)
        for (const id of ['cut~1', 'cut~2', 'cut~3']) {
          expect(p.outline.some((x) => x.segment === id)).toBe(true)
          expect(p.segments[id].role).toBe('seam')
          expect(p.allowance[id]).toBe(10)
          expect(p.internalLines).not.toContain(id)
        }
      }
    }
  })

  it('splits along a line that ends on an outline vertex (or two)', () => {
    for (const [from, to] of [
      ['A', { segmentId: 's.bottom', atRatio: 0.5 }],
      ['B', 'D'],
      [
        { segmentId: 's.top', atRatio: 0 },
        { segmentId: 's.right', atRatio: 1 },
      ],
    ] as const) {
      const r = replay(square(), [
        ...ops({ type: 'extractAll' }),
        { id: 'v', type: 'addInternalLine', pieceId: 'sq', from, to, kind: 'line' },
        ...ops({ type: 'splitPiece', pieceId: 'sq', lineId: 'v' }),
      ])
      expect(r.issues, JSON.stringify([from, to])).toEqual([])
      const [a, b] = r.pattern.pieces
      expect(Math.abs(area(a) + area(b) - whole) / whole).toBeLessThan(0.001)
      for (const p of [a, b]) {
        expect(isContinuous(pieceLocalPath(p), 1e-6)).toBe(true)
        // No sliver edge was made at the vertex.
        for (const x of p.outline)
          expect(segmentLength(stripMeta(p.segments[x.segment]))).toBeGreaterThan(1)
      }
    }
  })

  it('a traced chain whose ends are short of the outline is still reported', () => {
    const r = replay(square(), [
      ...ops({ type: 'extractAll' }),
      {
        id: 'in',
        type: 'addInternalLine',
        pieceId: 'sq',
        from: { piecePointMm: { x: 20, y: 20 } },
        to: { piecePointMm: { x: 80, y: 60 } },
        kind: 'curve',
      },
      ...ops(
        {
          type: 'replaceSegmentCurve',
          pieceId: 'sq',
          segmentId: 'in',
          beziers: [
            { c1: { x: 0.2, y: 0.1 }, c2: { x: 0.4, y: 0.1 }, to: { x: 0.5, y: 0.05 } },
            { c1: { x: 0.6, y: 0 }, c2: { x: 0.8, y: 0 }, to: { x: 1, y: 0 } },
          ],
        },
        { type: 'splitPiece', pieceId: 'sq', lineId: 'in' },
      ),
    ])
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0].message).toMatch(/no llega al contorno/)
  })
})
