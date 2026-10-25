import { describe, expect, it } from 'vitest'
import { BLOCKS, WOMEN_SKIRT_BLOCK, WOMEN_TROUSERS_BLOCK, draftBlock } from '../../blocks'
import { nearestOnBezier } from '../bezier'
import { DraftBuilder, stripMeta } from '../draft'
import { pathSelfIntersections } from '../intersect'
import {
  isContinuous,
  segmentLength,
  segmentPoint,
  segmentPointAtLength,
  type Path,
  type Segment,
} from '../path'
import { distance, perpendicularFoot, projectParam, vec, type Vec } from '../vec'
import { edgeAllowance, notchOnCutLine, pieceCutPath } from './marks'
import { replay } from './replay'
import type { Operation, OperationInput, PatternPiece } from './types'

let n = 0
const ops = (...list: OperationInput[]) =>
  list.map((o) => ({ ...o, id: `f4b-${++n}` }) as Operation)
const piece = (pieces: readonly PatternPiece[], id: string) => {
  const p = pieces.find((q) => q.id === id)
  if (!p) throw new Error(`no piece ${id}`)
  return p
}

const distToSegment = (p: Vec, s: Segment): number => {
  if (s.kind === 'cubic') return nearestOnBezier(s, p).distance
  const u = projectParam(p, s.p0, s.p1)
  if (u <= 0) return distance(p, s.p0)
  if (u >= 1) return distance(p, s.p1)
  return distance(p, perpendicularFoot(p, s.p0, s.p1))
}
const distToPath = (p: Vec, q: Path) => Math.min(...q.segments.map((s) => distToSegment(p, s)))

/** A rectangle with a fold edge on the left and a hem at the bottom. */
const foldedPanel = () => {
  const b = new DraftBuilder()
  b.point('A', vec(0, 0))
  b.point('B', vec(100, 0))
  b.point('C', vec(120, 200))
  b.point('D', vec(0, 200))
  b.line('p.waist', 'A', 'B')
  b.line('p.side', 'B', 'C')
  b.line('p.hem', 'C', 'D')
  b.line('p.fold', 'D', 'A')
  b.line('p.cf', vec(0, 0), vec(0, 1)) // unused helper segment
  b.piece('panel', 'Panel', ['p.waist', 'p.side', 'p.hem', 'p.fold'])
  b.role('waist', 'p.waist')
  b.role('side', 'p.side')
  b.role('hem', 'p.hem')
  b.role('fold', 'p.fold')
  return b.build()
}

describe('seam allowance operations', () => {
  it('extraction applies the defaults: hem edges get the hem allowance, fold edges 0', () => {
    const { pattern } = replay(foldedPanel(), ops({ type: 'extractAll' }), {
      allowance: { seamMm: 12, hemMm: 35 },
    })
    const p = piece(pattern.pieces, 'panel')
    expect(p.allowance).toEqual({ 'p.waist': 12, 'p.side': 12, 'p.hem': 35, 'p.fold': 0 })
  })

  it('fold edges get 0, even after setting every edge', () => {
    const { pattern, issues } = replay(
      foldedPanel(),
      ops(
        { type: 'extractAll' },
        { type: 'setSeamAllowance', pieceId: 'panel', segmentIds: 'all', mm: 15 },
        { type: 'setSeamAllowance', pieceId: 'panel', segmentIds: ['p.fold'], mm: 30 },
      ),
    )
    expect(issues).toEqual([])
    const p = piece(pattern.pieces, 'panel')
    expect(edgeAllowance(p, 'p.fold')).toBe(0)
    expect(edgeAllowance(p, 'p.hem')).toBe(15)
    // The cut line runs along the fold itself.
    const cut = pieceCutPath(p)!
    for (const y of [20, 100, 180]) expect(distToPath(vec(0, y), cut)).toBeLessThan(1e-6)
  })

  it('centre edges of a piece labelled "al doblez" get 0', () => {
    const { pattern } = replay(
      draftBlock(WOMEN_SKIRT_BLOCK, '10'),
      ops({ type: 'extractAll' }, { type: 'setPieceMeta', pieceId: 'front', onFold: true }),
    )
    const front = piece(pattern.pieces, 'front')
    expect(edgeAllowance(front, 'front.cf')).toBe(0)
    expect(edgeAllowance(front, 'front.hem')).toBe(20)
    expect(edgeAllowance(piece(pattern.pieces, 'back'), 'back.cb')).toBe(10)
  })

  it('rejects invalid allowances and foreign edges as issues', () => {
    const { issues } = replay(
      foldedPanel(),
      ops(
        { type: 'extractAll' },
        { type: 'setSeamAllowance', pieceId: 'panel', segmentIds: 'all', mm: -1 },
        { type: 'setSeamAllowance', pieceId: 'panel', segmentIds: ['p.cf'], mm: 10 },
      ),
    )
    expect(issues).toHaveLength(2)
  })

  it('cut on fold keeps the allowance of the mirrored half', () => {
    const { pattern, issues } = replay(
      draftBlock(WOMEN_SKIRT_BLOCK, '10'),
      ops(
        { type: 'extractAll' },
        { type: 'setSeamAllowance', pieceId: 'back', segmentIds: ['back.side'], mm: 25 },
        { type: 'cutOnFold', pieceId: 'back', foldSegmentId: 'back.cb' },
      ),
    )
    expect(issues).toEqual([])
    const back = piece(pattern.pieces, 'back')
    expect(edgeAllowance(back, 'back.side~m')).toBe(25)
    expect(edgeAllowance(back, 'back.hem~m')).toBe(20)
    expect(back.segments['back.hem~m'].role).toBe('hem')
    const cut = pieceCutPath(back)!
    expect(pathSelfIntersections(cut)).toEqual([])
  })
})

describe('allowance path geometry on every block', () => {
  const cases = BLOCKS.map((b) => [b.id, b] as const)
  it.each(cases)('%s: the cut line is at distance d (±0.1 mm) from every edge', (_, block) => {
    const { pattern } = replay(draftBlock(block, block.defaultSize), ops({ type: 'extractAll' }))
    for (const p of pattern.pieces) {
      const cut = pieceCutPath(p)!
      expect(cut.closed).toBe(true)
      expect(isContinuous(cut, 1e-3)).toBe(true)
      expect(pathSelfIntersections(cut)).toEqual([])
      for (const r of p.outline) {
        const s = stripMeta(p.segments[r.segment])
        const d = edgeAllowance(p, r.segment)
        const len = segmentLength(s)
        // Edges at least as long as their allowance: interior points see the cut line at d.
        if (len < d) continue
        for (const f of [0.25, 0.5, 0.75]) {
          const q = segmentPointAtLength(s, f * len).point
          expect(Math.abs(distToPath(q, cut) - d), `${p.id} ${r.segment} @${f}`).toBeLessThan(0.1)
        }
      }
      // Every offset piece of an edge lies at that edge's allowance.
      for (const c of cut.segments) {
        const m = /^(.*)~off(\.\d+)?$/.exec(c.id)
        if (!m) continue
        const src = stripMeta(p.segments[m[1]])
        const d = edgeAllowance(p, m[1])
        for (const t of [0.2, 0.5, 0.8])
          expect(Math.abs(distToSegment(segmentPoint(c, t), src) - d)).toBeLessThan(0.1)
      }
    }
  })
})

describe('marks', () => {
  const skirt = (size: string) => draftBlock(WOMEN_SKIRT_BLOCK, size)

  it('a notch at a ratio survives replay at another size', () => {
    const log = ops(
      { type: 'extractAll' },
      { type: 'addNotch', pieceId: 'back', segmentId: 'back.hem', atRatio: 0.4 },
      { type: 'addNotch', pieceId: 'back', segmentId: 'back.side', atMm: 50, double: true },
    )
    for (const size of ['10', '14', '6']) {
      const draft = skirt(size)
      const { pattern, issues } = replay(draft, log)
      expect(issues).toEqual([])
      const back = piece(pattern.pieces, 'back')
      const hem = stripMeta(draft.segments['back.hem'])
      const n1 = back.marks.find((m) => m.id === log[1].id)!
      expect(n1.kind).toBe('notch')
      expect(
        distance(n1.at, segmentPointAtLength(hem, 0.4 * segmentLength(hem)).point),
      ).toBeLessThan(1e-9)
      const n2 = back.marks.find((m) => m.id === log[2].id)!
      expect(n2.data?.count).toBe(2)
      expect(
        distance(n2.at, segmentPointAtLength(stripMeta(draft.segments['back.side']), 50).point),
      ).toBeLessThan(1e-9)
      // The notch is repeated on the cut line, at the allowance edge.
      const onCut = notchOnCutLine(back, n1.at, 'back.hem')!
      expect(onCut.allowance).toBe(20)
      expect(distToPath(onCut.at, pieceCutPath(back)!)).toBeLessThan(0.05)
    }
  })

  it('a typed position beyond the edge is reported, and notches can be removed', () => {
    const log = ops(
      { type: 'extractAll' },
      { type: 'addNotch', pieceId: 'front', segmentId: 'front.hem', atMm: 5000 },
      { type: 'removeNotch', pieceId: 'front', markId: 'front.notch.hip' },
      { type: 'removeNotch', pieceId: 'front', markId: 'front.grainline' },
    )
    const { pattern, issues } = replay(skirt('10'), log)
    expect(issues.map((i) => i.opId)).toEqual([log[1].id, log[3].id])
    expect(piece(pattern.pieces, 'front').marks.map((m) => m.kind)).toEqual(['grainline'])
  })

  it('text and button marks sit inside the piece and can be removed', () => {
    const log = ops(
      { type: 'extractAll' },
      {
        type: 'addTextMark',
        pieceId: 'front',
        text: 'Delantero falda',
        at: { segmentId: 'front.cf', ratio: 0.5, offsetMm: 40 },
      },
      {
        type: 'addButton',
        pieceId: 'front',
        diameterMm: 12,
        at: { segmentId: 'front.cf', ratio: 0.2, offsetMm: 15 },
      },
      { type: 'addTextMark', pieceId: 'front', text: 'Cadera', at: { pointName: 'A4' } },
    )
    const draft = skirt('10')
    const { pattern, issues } = replay(draft, log)
    expect(issues).toEqual([])
    const front = piece(pattern.pieces, 'front')
    const cf = stripMeta(draft.segments['front.cf'])
    const text = front.marks.find((m) => m.id === log[1].id)!
    expect(text.data?.text).toBe('Delantero falda')
    expect(distToSegment(text.at, cf)).toBeCloseTo(40, 6)
    // Inside: the centre front is the right edge of the front skirt.
    expect(text.at.x).toBeLessThan(cf.p0.x)
    const button = front.marks.find((m) => m.id === log[2].id)!
    expect(button.data?.diameterMm).toBe(12)
    expect(front.marks.find((m) => m.id === log[3].id)!.at).toEqual(draft.points.A4)

    const removed = replay(draft, [
      ...log,
      ...ops({ type: 'removeMark', pieceId: 'front', markId: log[2].id }),
    ])
    expect(piece(removed.pattern.pieces, 'front').marks.some((m) => m.id === log[2].id)).toBe(false)
  })

  it('setGrainline rotates and moves the grainline (absolute, replayable)', () => {
    const draft = draftBlock(WOMEN_TROUSERS_BLOCK, '10')
    const base = stripMeta(draft.segments['front.grain'])
    const log = ops(
      { type: 'extractAll' },
      { type: 'setGrainline', pieceId: 'front', angleDeg: 30 },
      { type: 'setGrainline', pieceId: 'front', angleDeg: 45, offset: { x: 10, y: -5 } },
      { type: 'setGrainline', pieceId: 'front', offset: { x: 10, y: -5 } },
    )
    const { pattern, issues } = replay(draft, log)
    expect(issues).toEqual([])
    const front = piece(pattern.pieces, 'front')
    expect(front.grain).toEqual({ angleDeg: 45, offset: { x: 10, y: -5 } })
    const g = front.segments['front.grain']
    if (g.kind !== 'line' || base.kind !== 'line') throw new Error('grain is a line')
    expect(distance(g.p0, g.p1)).toBeCloseTo(distance(base.p0, base.p1), 9)
    const dir = { x: g.p1.x - g.p0.x, y: g.p1.y - g.p0.y }
    const baseDir = { x: base.p1.x - base.p0.x, y: base.p1.y - base.p0.y }
    const ang = Math.atan2(dir.y, dir.x) - Math.atan2(baseDir.y, baseDir.x)
    expect((ang * 180) / Math.PI).toBeCloseTo(45, 9)
    const mid = { x: (g.p0.x + g.p1.x) / 2, y: (g.p0.y + g.p1.y) / 2 }
    expect(mid.x).toBeCloseTo((base.p0.x + base.p1.x) / 2 + 10, 9)
    expect(front.marks.find((m) => m.kind === 'grainline')!.at).toEqual(mid)
  })
})

describe('cutOnFold mirrors the marks that follow geometry', () => {
  it('anchored text and gather marks stay on the mirrored side after geometry ops', () => {
    const base = ops(
      { type: 'extractAll' },
      { type: 'dartToGather', pieceId: 'back', dartId: 'back.dart' },
      {
        type: 'addTextMark',
        pieceId: 'back',
        text: 'Trasero',
        at: { segmentId: 'back.hem', ratio: 0.5, offsetMm: 40 },
      },
      { type: 'cutOnFold', pieceId: 'back', foldSegmentId: 'back.cb' },
    )
    const textId = base[2].id
    const draft = draftBlock(WOMEN_SKIRT_BLOCK, '10')
    const first = replay(draft, base)
    expect(first.issues).toEqual([])
    const b0 = piece(first.pattern.pieces, 'back')
    const t = b0.marks.find((m) => m.id === `${textId}~m`)!
    expect((t.data?.anchor as { segmentId: string }).segmentId).toBe('back.hem~m')
    const g = b0.marks.find((m) => m.kind === 'gather' && m.id.endsWith('~m'))!
    expect(g.data?.segments).toEqual(
      (
        b0.marks.find((m) => m.kind === 'gather' && !m.id.endsWith('~m'))!.data!
          .segments as string[]
      ).map((id) => `${id}~m`),
    )
    // Geometry ops after the fold re-attach the marks: the mirrored ones must not jump sides.
    const moved = replay(draft, [
      ...base,
      ...ops(
        {
          type: 'movePoint',
          pieceId: 'back',
          point: { segmentId: 'back.hem~m', end: 'start' },
          deltaMm: { x: 5, y: 5 },
        },
        {
          type: 'movePoint',
          pieceId: 'back',
          point: { segmentId: 'back.hem', end: 'end' },
          deltaMm: { x: -5, y: 5 },
        },
      ),
    ])
    const b1 = piece(moved.pattern.pieces, 'back')
    const after = b1.marks.find((m) => m.id === `${textId}~m`)!
    const orig = b1.marks.find((m) => m.id === textId)!
    const axis = stripMeta(
      piece(replay(draft, base.slice(0, 1)).pattern.pieces, 'back').segments['back.cb'],
    )
    const side = (v: Vec) =>
      Math.sign(
        (axis.p1.x - axis.p0.x) * (v.y - axis.p0.y) - (axis.p1.y - axis.p0.y) * (v.x - axis.p0.x),
      )
    expect(side(after.at)).toBe(-side(orig.at))
  })
})
