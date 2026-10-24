import { describe, expect, it } from 'vitest'
import { WOMEN_BODICE_BLOCK, draftBlock } from '../../blocks'
import { DraftBuilder } from '../draft'
import { flattenPath, isContinuous, pathSignedArea, segmentLength } from '../path'
import { stripMeta } from '../draft'
import { vec } from '../vec'
import { affineDet, applyAffine } from './affine'
import {
  gradingAnchor,
  patternToWorldDraft,
  pieceWorldBBox,
  pieceWorldPath,
  splitPieceKey,
  worldSegment,
} from './pattern'
import { pieceLayoutBBox } from './marks'
import { replay } from './replay'
import type { Operation, PatternPiece } from './types'

const bodice = (size = '10') => draftBlock(WOMEN_BODICE_BLOCK, size)

/** Two overlapping rectangles (like the combined construction of a block). */
const rects = () => {
  const b = new DraftBuilder()
  b.point('A', vec(0, 0))
  b.point('B', vec(100, 0))
  b.point('C', vec(100, 200))
  b.point('D', vec(0, 200))
  b.line('l.cb', 'D', 'A')
  b.line('l.top', 'A', 'B')
  b.line('l.side', 'B', 'C')
  b.curveWithTangents('l.hem', 'C', vec(-1, 0.2), 'D', vec(-1, -0.2))
  b.line('l.grain', vec(50, 20), vec(50, 180))
  b.line('l.dart', vec(30, 200), vec(40, 120))
  b.piece('left', 'Izquierda', ['l.cb', 'l.top', 'l.side', 'l.hem'], {
    internalLines: ['l.grain', 'l.dart'],
    marks: [
      { id: 'left.grainline', kind: 'grainline', at: vec(50, 100), data: { segment: 'l.grain' } },
      { id: 'left.n1', kind: 'notch', at: vec(100, 100) },
    ],
  })
  b.point('E', vec(80, 0))
  b.point('F', vec(180, 0))
  b.point('G', vec(180, 150))
  b.point('H', vec(80, 150))
  b.line('r.top', 'E', 'F')
  b.line('r.edge', 'F', 'G')
  b.line('r.hem', 'G', 'H')
  b.line('r.side', 'H', 'E')
  b.piece('right', 'Derecha', ['r.top', 'r.edge', 'r.hem', 'r.side'])
  return b.build()
}

let n = 0
const op = <T extends Omit<Operation, 'id'>>(o: T) => ({ ...o, id: `op${++n}` }) as Operation

const area = (p: PatternPiece) => Math.abs(pathSignedArea(pieceWorldPath(p)))
const get = (pieces: readonly PatternPiece[], id: string) => {
  const p = pieces.find((q) => q.id === id)
  if (!p) throw new Error(`no piece ${id}`)
  return p
}
const worldLen = (p: PatternPiece, id: string) =>
  segmentLength(stripMeta(worldSegment(p, p.segments[id])))
const boxesApart = (a: PatternPiece, b: PatternPiece, gap: number) => {
  const p = pieceWorldBBox(a)
  const q = pieceWorldBBox(b)
  const eps = 1e-6
  return (
    p.maxX + gap <= q.minX + eps ||
    q.maxX + gap <= p.minX + eps ||
    p.maxY + gap <= q.minY + eps ||
    q.maxY + gap <= p.minY + eps
  )
}

describe('replay', () => {
  it('with no operations gives the draft and no pieces', () => {
    const d = rects()
    const r = replay(d, [])
    expect(r.pattern.draft).toBe(d)
    expect(r.pattern.pieces).toEqual([])
    expect(r.issues).toEqual([])
  })

  it('reports a missing id as an issue and keeps going (never throws)', () => {
    const ops = [
      op({ type: 'extractPiece', pieceId: 'nope' }),
      op({ type: 'extractPiece', pieceId: 'left' }),
      op({ type: 'transformPiece', pieceId: 'ghost', rotateDeg: 90 }),
      op({ type: 'mirrorPiece', pieceId: 'left', axis: { segmentId: 'zzz' }, keepOriginal: false }),
      op({ type: 'transformPiece', pieceId: 'left', rotateDeg: 10, pivot: 'Q' }),
      op({ type: 'cutOnFold', pieceId: 'left', foldSegmentId: 'l.hem' }),
      { id: 'weird', type: 'explode' } as unknown as Operation,
      null as unknown as Operation,
    ]
    let r: ReturnType<typeof replay> | undefined
    expect(() => (r = replay(rects(), ops))).not.toThrow()
    expect(r!.pattern.pieces.map((p) => p.id)).toEqual(['left'])
    expect(r!.issues.map((i) => i.opId)).toEqual([
      ops[0].id,
      ops[2].id,
      ops[3].id,
      ops[4].id,
      ops[5].id,
      'weird',
      '#7',
    ])
    for (const i of r!.issues) expect(i.message.length).toBeGreaterThan(0)
  })

  it('gives the same piece set and segment ids for two sizes', () => {
    const ops = [
      op({ type: 'extractAll' }),
      op({ type: 'cutOnFold', pieceId: 'back', foldSegmentId: 'back.cb' }),
      op({ type: 'mirrorPiece', pieceId: 'front', axis: 'vertical', keepOriginal: true }),
      op({ type: 'transformPiece', pieceId: 'front', rotateDeg: 90 }),
      op({ type: 'duplicatePiece', pieceId: 'front', newId: 'front2' }),
      op({ type: 'autoLayout' }),
    ]
    const a = replay(bodice('8'), ops)
    const b = replay(bodice('14'), ops)
    expect(a.issues).toEqual([])
    expect(b.issues).toEqual([])
    const shape = (r: typeof a) =>
      r.pattern.pieces.map((p) => ({
        id: p.id,
        segments: Object.keys(p.segments).sort(),
        outline: p.outline,
      }))
    expect(shape(a)).toEqual(shape(b))
    expect(a.pattern.pieces.map((p) => p.id)).toEqual(['back', 'front', 'front~m', 'front2'])
  })
})

describe('extractPiece / extractAll', () => {
  it('copies the geometry and leaves the construction intact', () => {
    const d = rects()
    const before = JSON.stringify(d)
    const r = replay(d, [op({ type: 'extractPiece', pieceId: 'left' })])
    const p = r.pattern.pieces[0]
    expect(p).toMatchObject({ id: 'left', sourcePieceId: 'left', name: 'Izquierda', cutCount: 1 })
    expect(Object.keys(p.segments).sort()).toEqual(
      ['l.cb', 'l.dart', 'l.grain', 'l.hem', 'l.side', 'l.top'].sort(),
    )
    expect(p.points.A).toEqual(vec(0, 0))
    expect(p.points.E).toBeUndefined()
    expect(JSON.stringify(d)).toBe(before)
    expect(p.segments['l.top']).not.toBe(d.segments['l.top']) // own copy
  })

  it('is idempotent per piece id', () => {
    const r = replay(rects(), [
      op({ type: 'extractPiece', pieceId: 'left' }),
      op({ type: 'extractPiece', pieceId: 'left' }),
    ])
    expect(r.issues).toEqual([])
    expect(r.pattern.pieces).toHaveLength(1)
  })

  it('extractAll separates every piece without overlap and uses label defaults', () => {
    const r = replay(
      rects(),
      [op({ type: 'extractPiece', pieceId: 'left' }), op({ type: 'extractAll' })],
      {
        pieceDefaults: (id) => (id === 'right' ? { cutCount: 2, fabric: 'Forro' } : {}),
      },
    )
    const [l, rt] = r.pattern.pieces
    expect(r.pattern.pieces.map((p) => p.id)).toEqual(['left', 'right'])
    expect(rt).toMatchObject({ cutCount: 2, fabric: 'Forro' })
    expect(boxesApart(l, rt, 30)).toBe(true)
  })
})

describe('transformPiece', () => {
  it('rotates about the centre or a named point and translates, keeping ids', () => {
    const base = [op({ type: 'extractPiece', pieceId: 'left' })]
    const r = replay(rects(), [
      ...base,
      op({ type: 'transformPiece', pieceId: 'left', rotateDeg: 90, pivot: 'A' }),
      op({ type: 'transformPiece', pieceId: 'left', translate: { x: 10, y: 5 } }),
    ])
    const p = r.pattern.pieces[0]
    expect(r.issues).toEqual([])
    // A stays at the pivot then moves by the translation; B (100, 0) turns to (0, 100).
    const A = applyAffine(p.transform, p.points.A)
    const B = applyAffine(p.transform, p.points.B)
    expect(A.x).toBeCloseTo(10)
    expect(A.y).toBeCloseTo(5)
    expect(B.x).toBeCloseTo(10)
    expect(B.y).toBeCloseTo(105)
    expect(p.outline.map((o) => o.segment)).toEqual(['l.cb', 'l.top', 'l.side', 'l.hem'])

    const c = replay(rects(), [
      ...base,
      op({ type: 'transformPiece', pieceId: 'left', rotateDeg: 180 }),
    ]).pattern.pieces[0]
    const before = replay(rects(), base).pattern.pieces[0]
    const bb0 = pieceWorldBBox(before)
    const bb1 = pieceWorldBBox(c)
    expect(bb1.minX + bb1.maxX).toBeCloseTo(bb0.minX + bb0.maxX, 6)
    expect(bb1.minY + bb1.maxY).toBeCloseTo(bb0.minY + bb0.maxY, 6)
  })
})

describe('mirrorPiece', () => {
  it('preserves segment lengths and ids, flips the orientation', () => {
    const d = bodice()
    for (const axis of ['vertical', 'horizontal', { segmentId: 'front.shoulder' }] as const) {
      const r = replay(d, [
        op({ type: 'extractAll' }),
        op({ type: 'mirrorPiece', pieceId: 'front', axis, keepOriginal: false }),
      ])
      expect(r.issues).toEqual([])
      const [orig] = replay(d, [op({ type: 'extractAll' })]).pattern.pieces.filter(
        (p) => p.id === 'front',
      )
      const m = get(r.pattern.pieces, 'front')
      expect(Object.keys(m.segments)).toEqual(Object.keys(orig.segments))
      expect(affineDet(m.transform)).toBeCloseTo(-1)
      for (const id of Object.keys(orig.segments))
        expect(worldLen(m, id)).toBeCloseTo(worldLen(orig, id), 6)
      expect(area(m)).toBeCloseTo(area(orig), 3)
    }
  })

  it('keepOriginal adds a copy with a derived id', () => {
    const r = replay(rects(), [
      op({ type: 'extractPiece', pieceId: 'left' }),
      op({
        type: 'mirrorPiece',
        pieceId: 'left',
        axis: { segmentId: 'l.side' },
        keepOriginal: true,
      }),
      op({ type: 'mirrorPiece', pieceId: 'left', axis: 'vertical', keepOriginal: true }),
    ])
    expect(r.pattern.pieces.map((p) => p.id)).toEqual(['left', 'left~m', 'left~m2'])
    const copy = get(r.pattern.pieces, 'left~m')
    // Mirrored across the side seam x = 100: A (0, 0) lands on (200, 0).
    const A = applyAffine(copy.transform, copy.points.A)
    expect(A.x).toBeCloseTo(200)
    expect(A.y).toBeCloseTo(0)
    expect(copy.name).toContain('espejo')
  })
})

describe('cutOnFold', () => {
  it('doubles the area of the bodice back and marks the fold', () => {
    const d = bodice()
    const half = get(replay(d, [op({ type: 'extractAll' })]).pattern.pieces, 'back')
    const r = replay(d, [
      op({ type: 'extractAll' }),
      op({ type: 'cutOnFold', pieceId: 'back', foldSegmentId: 'back.cb' }),
    ])
    expect(r.issues).toEqual([])
    const full = get(r.pattern.pieces, 'back')
    expect(Math.abs(area(full) / (2 * area(half)) - 1)).toBeLessThan(0.001)
    expect(isContinuous(pieceWorldPath(full), 1e-6)).toBe(true)
    // The centre back edges (cb and cbHip, collinear) became the fold line.
    expect(full.segments['back.cb']).toBeUndefined()
    expect(full.segments['back.cbHip']).toBeUndefined()
    expect(full.fold).not.toBeNull()
    expect(full.segments['back.neck~m']).toBeDefined()
    expect(full.internalLines).toContain('back.dart.left~m')
    // One grainline only.
    expect(full.marks.filter((m) => m.kind === 'grainline')).toHaveLength(1)
    // Mirrored halves have the same lengths.
    expect(worldLen(full, 'back.shoulder~m')).toBeCloseTo(worldLen(full, 'back.shoulder'), 6)
  })

  it('works on the front (centre front) and on a transformed piece', () => {
    const d = bodice()
    const ops = [
      op({ type: 'extractAll' }),
      op({ type: 'transformPiece', pieceId: 'front', rotateDeg: 33, translate: { x: 7, y: -4 } }),
    ]
    const half = get(replay(d, ops).pattern.pieces, 'front')
    const r = replay(d, [
      ...ops,
      op({ type: 'cutOnFold', pieceId: 'front', foldSegmentId: 'front.cf' }),
    ])
    expect(r.issues).toEqual([])
    const full = get(r.pattern.pieces, 'front')
    expect(Math.abs(area(full) / (2 * area(half)) - 1)).toBeLessThan(0.001)
  })

  it('refuses a curved edge or a second unfold', () => {
    const r = replay(rects(), [
      op({ type: 'extractPiece', pieceId: 'left' }),
      op({ type: 'cutOnFold', pieceId: 'left', foldSegmentId: 'l.hem' }),
      op({ type: 'cutOnFold', pieceId: 'left', foldSegmentId: 'l.cb' }),
      op({ type: 'cutOnFold', pieceId: 'left', foldSegmentId: 'l.top' }),
    ])
    expect(r.issues).toHaveLength(2)
    const p = r.pattern.pieces[0]
    expect(p.outline).toHaveLength(6) // top, side, hem + their mirrors
    // The notch on the side seam is mirrored, the grainline is not.
    expect(p.marks.map((m) => m.id).sort()).toEqual(['left.grainline', 'left.n1', 'left.n1~m'])
  })
})

describe('duplicatePiece / deletePiece / setPieceMeta', () => {
  it('duplicates with a new id beside the others, rejects clashes', () => {
    const r = replay(rects(), [
      op({ type: 'extractAll' }),
      op({ type: 'duplicatePiece', pieceId: 'left', newId: 'left2' }),
      op({ type: 'duplicatePiece', pieceId: 'left', newId: 'right' }),
      op({ type: 'duplicatePiece', pieceId: 'left', newId: 'a/b' }),
    ])
    expect(r.pattern.pieces.map((p) => p.id)).toEqual(['left', 'right', 'left2'])
    expect(r.issues).toHaveLength(2)
    const [l, rt, l2] = r.pattern.pieces
    expect(boxesApart(l2, l, 30) && boxesApart(l2, rt, 30)).toBe(true)
    expect(area(l2)).toBeCloseTo(area(l), 6)
  })

  it('deletes extracted pieces only', () => {
    const r = replay(rects(), [
      op({ type: 'extractPiece', pieceId: 'left' }),
      op({ type: 'deletePiece', pieceId: 'right' }),
      op({ type: 'deletePiece', pieceId: 'left' }),
    ])
    expect(r.pattern.pieces).toEqual([])
    expect(r.issues).toHaveLength(1)
    expect(r.pattern.draft.pieces).toHaveLength(2)
  })

  it('edits the label fields and validates them', () => {
    const r = replay(rects(), [
      op({ type: 'extractPiece', pieceId: 'left' }),
      op({
        type: 'setPieceMeta',
        pieceId: 'left',
        name: 'Espalda',
        cutCount: 2,
        fabric: 'Forro',
        onFold: true,
      }),
      op({ type: 'setPieceMeta', pieceId: 'left', cutCount: 0 }),
    ])
    expect(r.pattern.pieces[0]).toMatchObject({
      name: 'Espalda',
      cutCount: 2,
      fabric: 'Forro',
      onFold: true,
    })
    expect(r.issues).toHaveLength(1)
  })
})

describe('autoLayout', () => {
  it('leaves no overlap and at least the gap between pieces', () => {
    const r = replay(bodice(), [
      op({ type: 'extractAll' }),
      op({ type: 'duplicatePiece', pieceId: 'front', newId: 'f2' }),
      op({ type: 'duplicatePiece', pieceId: 'back', newId: 'b2' }),
      op({ type: 'transformPiece', pieceId: 'f2', translate: { x: -900, y: 40 }, rotateDeg: 45 }),
      op({ type: 'transformPiece', pieceId: 'b2', translate: { x: -300, y: 0 } }),
      op({ type: 'autoLayout', gapMm: 30 }),
    ])
    expect(r.issues).toEqual([])
    const ps = r.pattern.pieces
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) expect(boxesApart(ps[i], ps[j], 30)).toBe(true)
  })

  it('defaults to a 30 mm gap and keeps a single row when it fits', () => {
    const r = replay(rects(), [op({ type: 'extractAll' }), op({ type: 'autoLayout' })])
    const [a, b] = r.pattern.pieces
    // The gap is measured between cut lines (the pieces carry the default allowance).
    const ba = pieceLayoutBBox(a)
    const bb = pieceLayoutBBox(b)
    expect(bb.minX - ba.maxX).toBeCloseTo(30)
    expect(bb.minY).toBeCloseTo(ba.minY)
  })
})

describe('pattern helpers', () => {
  it('world draft namespaces ids per piece', () => {
    const r = replay(rects(), [op({ type: 'extractAll' })])
    const w = patternToWorldDraft(r.pattern.pieces)
    expect(w.pieces.map((p) => p.id)).toEqual(['left', 'right'])
    expect(w.segments['left/l.top']).toBeDefined()
    expect(w.points['right/E']).toBeDefined()
    expect(splitPieceKey('left/l.top')).toEqual({ pieceId: 'left', localId: 'l.top' })
    expect(splitPieceKey('l.top')).toBeNull()
    const grain = w.pieces[0].marks.find((m) => m.kind === 'grainline')
    expect(grain?.data?.segment).toBe('left/l.grain')
    expect(flattenPath(pieceWorldPath(r.pattern.pieces[1])).length).toBeGreaterThan(3)
  })

  it('grading anchor is the start of the centre line, else the bbox top-left', () => {
    const r = replay(bodice(), [op({ type: 'extractAll' })])
    const back = get(r.pattern.pieces, 'back')
    const a = gradingAnchor(back)
    const cb = back.segments['back.cb']
    const ends = [cb.p0, cb.kind === 'line' ? cb.p1 : cb.p3].map((p) =>
      applyAffine(back.transform, p),
    )
    expect(ends.some((e) => Math.hypot(e.x - a.x, e.y - a.y) < 1e-9)).toBe(true)
    const r2 = replay(rects(), [op({ type: 'extractPiece', pieceId: 'right' })])
    const right = r2.pattern.pieces[0]
    expect(gradingAnchor(right)).toEqual({ x: 80, y: 0 })
  })
})
