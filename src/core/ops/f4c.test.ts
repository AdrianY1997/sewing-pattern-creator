import { describe, expect, it } from 'vitest'
import {
  BLOCKS,
  MEN_BODICE_BLOCK,
  WOMEN_BODICE_BLOCK,
  WOMEN_SKIRT_BLOCK,
  draftBlock,
  isHalfPiece,
  type AnyBlockDef,
} from '../../blocks'
import { DraftBuilder, stripMeta } from '../draft'
import {
  flattenPath,
  isContinuous,
  polygonSignedArea,
  segEnd,
  segmentLength,
  segmentPointAtLength,
  segmentTangent,
  type Segment,
} from '../path'
import { angleBetween, distance, normalize, radToDeg, rotate, sub, vec, type Vec } from '../vec'
import { dartAngleDeg, findDart } from './darts'
import { orientedOutline } from './edit'
import { pieceLocalPath } from './pattern'
import { replay } from './replay'
import type { Operation, OperationInput, PatternPiece, ReplayOptions } from './types'
import { isOperation, operationProblem } from './validate'

let n = 0
const ops = (...list: OperationInput[]) =>
  list.map((o) => ({ ...o, id: `f4c-${++n}` }) as Operation)
const pieceOf = (pieces: readonly PatternPiece[], id: string) => {
  const p = pieces.find((q) => q.id === id)
  if (!p) throw new Error(`no piece ${id}`)
  return p
}
const optionsFor = (block: AnyBlockDef): ReplayOptions => ({
  pieceDefaults: (id) => ({ halfPiece: isHalfPiece(block, id) }),
})

const run = (block: AnyBlockDef, size: string, list: readonly Operation[], options = {}) =>
  replay(draftBlock(block, size, options), list, optionsFor(block))

const area = (p: PatternPiece) => Math.abs(polygonSignedArea(flattenPath(pieceLocalPath(p), 0.05)))

/** Largest turn (degrees) between consecutive outline segments at their joins. */
const maxTurnAt = (p: PatternPiece, at: Vec): number => {
  const nOut = p.outline.length
  let worst = 0
  for (let k = 0; k < nOut; k++) {
    const A = orientedOutline(p, (k - 1 + nOut) % nOut)
    const B = orientedOutline(p, k)
    if (distance(B.p0, at) > 0.01) continue
    worst = Math.max(
      worst,
      Math.abs(radToDeg(angleBetween(segmentTangent(A, 1), segmentTangent(B, 0)))),
    )
  }
  return worst
}

const WOMEN = WOMEN_BODICE_BLOCK
const extract = ops({ type: 'extractAll' })

describe('dart model', () => {
  it('every dart of every block names an apex point and two internal legs that meet there', () => {
    let count = 0
    for (const block of BLOCKS) {
      const variants = block.options.flatMap((o) => o.choices.map((c) => ({ [o.key]: c.value })))
      for (const options of variants.length ? variants : [{}]) {
        const draft = draftBlock(block, block.defaultSize, options)
        for (const piece of draft.pieces)
          for (const d of piece.darts) {
            count++
            const apex = draft.points[d.apex]
            expect(apex, `${block.id} ${d.id}`).toBeDefined()
            for (const leg of d.legs) {
              expect(piece.internalLines).toContain(leg)
              const s = stripMeta(draft.segments[leg])
              const touches = Math.min(distance(s.p0, apex), distance(segEnd(s), apex))
              expect(touches, `${d.id} ${leg}`).toBeLessThan(1e-6)
            }
            expect(['edge', 'internal']).toContain(d.type)
          }
      }
    }
    expect(count).toBeGreaterThan(8)
  })

  it('tags the expected darts: bodice bust (edge), hip-length waist darts (internal), skirt darts', () => {
    const hip = draftBlock(WOMEN, '10')
    const front = hip.pieces.find((p) => p.id === 'front')!
    expect(front.darts.map((d) => [d.id, d.type])).toEqual([
      ['front.bustDart', 'edge'],
      ['front.waistDart', 'internal'],
    ])
    expect(front.darts[0].apex).toBe('A34')
    const waist = draftBlock(WOMEN, '10', { length: 'waist' })
    expect(waist.pieces.find((p) => p.id === 'back')!.darts[0].type).toBe('edge')
    const skirt = draftBlock(WOMEN_SKIRT_BLOCK, '10')
    expect(skirt.pieces.map((p) => p.darts.map((d) => d.type))).toEqual([['edge'], ['edge']])
    expect(draftBlock(MEN_BODICE_BLOCK, '48').pieces.every((p) => p.darts.length === 0)).toBe(true)
  })

  it('extraction copies the darts', () => {
    const { pattern } = run(WOMEN, '10', extract)
    expect(pieceOf(pattern.pieces, 'front').darts.map((d) => d.id)).toEqual([
      'front.bustDart',
      'front.waistDart',
    ])
  })
})

describe('closeDart', () => {
  it('bodice bust dart: the legs coincide and the side seam is continuous and smooth', () => {
    const before = pieceOf(run(WOMEN, '10', extract).pattern.pieces, 'front')
    const { pattern, issues } = run(WOMEN, '10', [
      ...extract,
      ...ops({ type: 'closeDart', pieceId: 'front', dartId: 'front.bustDart' }),
    ])
    expect(issues).toEqual([])
    const p = pieceOf(pattern.pieces, 'front')
    // Leg ends (A36 upper, A38 lower) meet; the dart and its legs are gone.
    expect(distance(p.points.A36, p.points.A38)).toBeLessThan(1e-6)
    expect(p.darts.map((d) => d.id)).toEqual(['front.waistDart'])
    expect(p.segments['front.bustDart.upper']).toBeUndefined()
    expect(p.segments['front.dartCap.0']).toBeUndefined()
    expect(isContinuous(pieceLocalPath(p), 1e-6)).toBe(true)
    expect(maxTurnAt(p, p.points.A36)).toBeLessThan(0.5)
    // The apex (bust point) stays where it was.
    expect(distance(p.points.A34, before.points.A34)).toBeLessThan(1e-9)
  })

  it('skirt waist dart: the legs coincide, the waist is smooth and the dart opens at the hem', () => {
    const { pattern, issues } = run(WOMEN_SKIRT_BLOCK, '10', [
      ...extract,
      ...ops({ type: 'closeDart', pieceId: 'front', dartId: 'front.dart' }),
    ])
    expect(issues).toEqual([])
    const p = pieceOf(pattern.pieces, 'front')
    expect(distance(p.points.A27, p.points.A28)).toBeLessThan(1e-6)
    expect(isContinuous(pieceLocalPath(p), 1e-6)).toBe(true)
    expect(maxTurnAt(p, p.points.A27)).toBeLessThan(0.5)
    expect(p.outline.some((r) => r.segment === 'front.dart~gap')).toBe(true)
    expect(p.segments['front.dart~gap'].role).toBe('hem')
  })

  it('internal (diamond) darts cannot be closed: one issue, nothing else changes', () => {
    const { pattern, issues } = run(WOMEN, '10', [
      ...extract,
      ...ops({ type: 'closeDart', pieceId: 'back', dartId: 'back.waistDart' }),
    ])
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toMatch(/interna/)
    expect(pieceOf(pattern.pieces, 'back').darts).toHaveLength(1)
  })

  it('waist-length bodice: the waist dart opens inside the waist edge and still closes', () => {
    const { pattern, issues } = run(
      WOMEN,
      '10',
      [...extract, ...ops({ type: 'closeDart', pieceId: 'back', dartId: 'back.waistDart' })],
      { length: 'waist' },
    )
    expect(issues).toEqual([])
    const p = pieceOf(pattern.pieces, 'back')
    expect(distance(p.points.A46, p.points.A47)).toBeLessThan(1e-6)
    expect(isContinuous(pieceLocalPath(p), 1e-6)).toBe(true)
  })
})

describe('transferDart', () => {
  const toShoulder = (keepPercent?: number) =>
    ops({
      type: 'transferDart',
      pieceId: 'front',
      dartId: 'front.bustDart',
      toSegmentId: 'front.shoulder',
      atRatio: 0.5,
      ...(keepPercent !== undefined && { keepPercent }),
    })

  it('bust dart to the shoulder: same total angle, same apex, a new edge dart on the shoulder', () => {
    const base = pieceOf(run(WOMEN, '10', extract).pattern.pieces, 'front')
    const angle0 = dartAngleDeg(base, 'front.bustDart')
    const { pattern, issues } = run(WOMEN, '10', [...extract, ...toShoulder()])
    expect(issues).toEqual([])
    const p = pieceOf(pattern.pieces, 'front')
    expect(p.darts.map((d) => d.id)).toEqual(['front.bustDart~t', 'front.waistDart'])
    const d = findDart(p, 'front.bustDart~t')
    expect(d.apex).toBe('A34')
    expect(dartAngleDeg(p, d.id)).toBeCloseTo(angle0, 1)
    expect(Math.abs(dartAngleDeg(p, d.id) - angle0)).toBeLessThan(0.1)
    expect(distance(p.points.A34, base.points.A34)).toBeLessThan(1e-9)
    const bust = p.marks.find((m) => m.kind === 'bustPoint')!
    expect(distance(bust.at, base.points.A34)).toBeLessThan(1e-9)
    // The shoulder was cut at Q; the new opening is an outline edge, the old legs are gone.
    expect(p.outline.some((r) => r.segment === 'front.bustDart~t.open')).toBe(true)
    expect(p.outline.some((r) => r.segment === 'front.shoulder~1')).toBe(true)
    expect(p.segments['front.bustDart.upper']).toBeUndefined()
    expect(isContinuous(pieceLocalPath(p), 1e-6)).toBe(true)
    // The side seam closed where the dart was.
    expect(distance(p.points.A36, p.points.A38)).toBeLessThan(1e-6)
  })

  it('keepPercent splits the dart: old + new angle = the original angle (±0.1°)', () => {
    const base = pieceOf(run(WOMEN, '10', extract).pattern.pieces, 'front')
    const angle0 = dartAngleDeg(base, 'front.bustDart')
    const { pattern, issues } = run(WOMEN, '10', [...extract, ...toShoulder(40)])
    expect(issues).toEqual([])
    const p = pieceOf(pattern.pieces, 'front')
    const old = dartAngleDeg(p, 'front.bustDart')
    const moved = dartAngleDeg(p, 'front.bustDart~t')
    expect(Math.abs(old + moved - angle0)).toBeLessThan(0.1)
    expect(old).toBeCloseTo(angle0 * 0.4, 1)
    expect(isContinuous(pieceLocalPath(p), 1e-6)).toBe(true)
  })

  it('a second transfer of the new dart gets another derived id', () => {
    const { pattern, issues } = run(WOMEN, '10', [
      ...extract,
      ...toShoulder(),
      ...ops({
        type: 'transferDart',
        pieceId: 'front',
        dartId: 'front.bustDart~t',
        toSegmentId: 'front.neck',
        atRatio: 0.5,
      }),
    ])
    expect(issues).toEqual([])
    expect(pieceOf(pattern.pieces, 'front').darts.map((d) => d.id)).toContain('front.bustDart~t~t')
  })

  it('rejects a target inside the dart itself', () => {
    const { issues } = run(WOMEN, '10', [
      ...extract,
      ...ops({
        type: 'transferDart',
        pieceId: 'front',
        dartId: 'front.bustDart',
        toSegmentId: 'front.dartCap.0',
        atRatio: 0.5,
      }),
    ])
    expect(issues).toHaveLength(1)
  })
})

describe('size replay of dart operations', () => {
  it('closeDart and transferDart replay at every size without issues', () => {
    const list = [
      ...extract,
      ...ops(
        {
          type: 'transferDart',
          pieceId: 'front',
          dartId: 'front.bustDart',
          toSegmentId: 'front.shoulder',
          atRatio: 0.4,
        },
        { type: 'setDartApex', pieceId: 'front', dartId: 'front.bustDart~t', shortenMm: 25 },
      ),
    ]
    const skirt = [...extract, ...ops({ type: 'closeDart', pieceId: 'back', dartId: 'back.dart' })]
    for (const size of ['6', '10', '16']) {
      const r = run(WOMEN, size, list)
      expect(r.issues, size).toEqual([])
      expect(pieceOf(r.pattern.pieces, 'front').darts[0].id).toBe('front.bustDart~t')
      expect(run(WOMEN_SKIRT_BLOCK, size, skirt).issues, size).toEqual([])
    }
  })
})

describe('dartToGather and setDartApex', () => {
  it('the skirt dart becomes gathers: one smooth waist edge and a "fruncir" mark', () => {
    const base = pieceOf(run(WOMEN_SKIRT_BLOCK, '10', extract).pattern.pieces, 'back')
    const width = distance(base.points.A21, base.points.A22)
    const { pattern, issues } = run(WOMEN_SKIRT_BLOCK, '10', [
      ...extract,
      ...ops({ type: 'dartToGather', pieceId: 'back', dartId: 'back.dart' }),
    ])
    expect(issues).toEqual([])
    const p = pieceOf(pattern.pieces, 'back')
    expect(p.darts).toEqual([])
    expect(p.segments['back.dart.left']).toBeUndefined()
    const g = p.marks.find((m) => m.kind === 'gather')!
    expect(g.data?.text).toBe('fruncir')
    expect(g.data?.widthMm).toBeCloseTo(width, 6)
    const bridge = p.segments['back.waist.dart']
    expect(bridge.role).toBe('waist')
    expect(isContinuous(pieceLocalPath(p), 1e-6)).toBe(true)
    expect(maxTurnAt(p, p.points.A21)).toBeLessThan(0.5)
    expect(maxTurnAt(p, p.points.A22)).toBeLessThan(0.5)
  })

  it('setDartApex shortens the dart along its centre line', () => {
    const { pattern, issues } = run(WOMEN, '10', [
      ...extract,
      ...ops({ type: 'setDartApex', pieceId: 'front', dartId: 'front.bustDart', shortenMm: 25 }),
    ])
    expect(issues).toEqual([])
    const p = pieceOf(pattern.pieces, 'front')
    const d = findDart(p, 'front.bustDart')
    expect(d.apex).toBe('front.bustDart~apex')
    expect(distance(p.points[d.apex], p.points.A34)).toBeCloseTo(25, 6)
    // The bust point itself is untouched.
    expect(p.points.A34).toEqual(
      pieceOf(run(WOMEN, '10', extract).pattern.pieces, 'front').points.A34,
    )
    for (const leg of d.legs) {
      const s = stripMeta(p.segments[leg])
      expect(
        Math.min(distance(s.p0, p.points[d.apex]), distance(segEnd(s), p.points[d.apex])),
      ).toBeLessThan(1e-9)
    }
  })

  it('setDartApex rejects shortening past the dart length', () => {
    const { issues } = run(WOMEN, '10', [
      ...extract,
      ...ops({ type: 'setDartApex', pieceId: 'front', dartId: 'front.bustDart', shortenMm: 900 }),
    ])
    expect(issues).toHaveLength(1)
  })
})

/** A small square with one curved edge, for the point/curve operations. */
const square = () => {
  const b = new DraftBuilder()
  b.point('A', vec(0, 0))
  b.point('B', vec(100, 0))
  b.point('C', vec(100, 100))
  b.point('D', vec(0, 100))
  b.line('s.top', 'A', 'B')
  b.bezier('s.right', 'B', vec(130, 30), vec(130, 70), 'C')
  b.line('s.bottom', 'C', 'D')
  b.line('s.left', 'D', 'A')
  b.line('s.grain', vec(50, 20), vec(50, 80))
  b.piece('sq', 'Cuadrado', ['s.top', 's.right', 's.bottom', 's.left'], {
    internalLines: ['s.grain'],
    marks: [
      { id: 'sq.grainline', kind: 'grainline', at: vec(50, 50), data: { segment: 's.grain' } },
    ],
  })
  b.role('side', 's.top', 's.right', 's.bottom', 's.left')
  return b.build()
}
const sq = (list: readonly OperationInput[]) => replay(square(), [...extract, ...ops(...list)])

const samplePath = (segs: readonly Segment[], k = 40): Vec[] => {
  const total = segs.reduce((a, s) => a + segmentLength(s), 0)
  return Array.from({ length: k + 1 }, (_, i) => {
    let rest = (total * i) / k
    for (const s of segs) {
      const l = segmentLength(s)
      if (rest <= l + 1e-9) return segmentPointAtLength(s, Math.min(rest, l)).point
      rest -= l
    }
    return segEnd(segs[segs.length - 1])
  })
}

describe('point and curve editing', () => {
  it('movePoint moves a vertex, the neighbours follow and the curve keeps its tangent', () => {
    const before = pieceOf(sq([]).pattern.pieces, 'sq')
    const { pattern, issues } = sq([
      { type: 'movePoint', pieceId: 'sq', point: 'B', deltaMm: { x: 10, y: -5 } },
    ])
    expect(issues).toEqual([])
    const p = pieceOf(pattern.pieces, 'sq')
    expect(p.points.B).toEqual({ x: 110, y: -5 })
    expect(segEnd(stripMeta(p.segments['s.top']))).toEqual({ x: 110, y: -5 })
    const c0 = before.segments['s.right']
    const c1 = p.segments['s.right']
    if (c0.kind !== 'cubic' || c1.kind !== 'cubic') throw new Error('not a curve')
    expect(c1.p0).toEqual({ x: 110, y: -5 })
    const t0 = normalize(sub(c0.p1, c0.p0))
    const t1 = normalize(sub(c1.p1, c1.p0))
    expect(Math.abs(angleBetween(t0, t1))).toBeLessThan(1e-9)
    expect(isContinuous(pieceLocalPath(p), 1e-9)).toBe(true)
  })

  it('movePoint by segment end equals movePoint by point name', () => {
    const byName = sq([{ type: 'movePoint', pieceId: 'sq', point: 'C', deltaMm: { x: 5, y: 5 } }])
    const byEnd = sq([
      {
        type: 'movePoint',
        pieceId: 'sq',
        point: { segmentId: 's.bottom', end: 'start' },
        deltaMm: { x: 5, y: 5 },
      },
    ])
    expect(pieceOf(byEnd.pattern.pieces, 'sq').segments).toEqual(
      pieceOf(byName.pattern.pieces, 'sq').segments,
    )
  })

  it('splitSegment then removePoint gives back the same path (≤ 0.1 mm), for curves and lines', () => {
    const before = pieceLocalPath(pieceOf(sq([]).pattern.pieces, 'sq'))
    for (const segmentId of ['s.right', 's.top']) {
      const split = sq([{ type: 'splitSegment', pieceId: 'sq', segmentId, atRatio: 0.37 }])
      expect(split.issues).toEqual([])
      const mid = pieceOf(split.pattern.pieces, 'sq')
      expect(mid.outline).toHaveLength(5)
      const { pattern, issues } = sq([
        { type: 'splitSegment', pieceId: 'sq', segmentId, atRatio: 0.37 },
        { type: 'removePoint', pieceId: 'sq', point: `${segmentId}~p` },
      ])
      expect(issues).toEqual([])
      const p = pieceOf(pattern.pieces, 'sq')
      expect(p.outline.map((r) => r.segment)).toEqual(['s.top', 's.right', 's.bottom', 's.left'])
      expect(p.points[`${segmentId}~p`]).toBeUndefined()
      const after = pieceLocalPath(p)
      const a = samplePath(before.segments)
      const b = samplePath(after.segments)
      a.forEach((q, i) => expect(distance(q, b[i])).toBeLessThan(0.1))
    }
  })

  it('removePoint merges two straight edges into one line, two others into ~join', () => {
    const { pattern, issues } = sq([{ type: 'removePoint', pieceId: 'sq', point: 'D' }])
    expect(issues).toEqual([])
    const p = pieceOf(pattern.pieces, 'sq')
    expect(p.outline.map((r) => r.segment)).toEqual(['s.top', 's.right', 's.bottom~join'])
    expect(p.segments['s.bottom~join'].kind).toBe('line')
  })

  it('allowance and notches survive splitSegment (notch ratios mapped onto the halves)', () => {
    const { pattern, issues } = sq([
      { type: 'setSeamAllowance', pieceId: 'sq', segmentIds: ['s.right'], mm: 17 },
      { type: 'addNotch', pieceId: 'sq', segmentId: 's.right', atRatio: 0.25 },
      { type: 'addNotch', pieceId: 'sq', segmentId: 's.right', atRatio: 0.8 },
      { type: 'addNotch', pieceId: 'sq', segmentId: 's.top', atMm: 30 },
    ])
    expect(issues).toEqual([])
    const p0 = pieceOf(pattern.pieces, 'sq')
    const notches0 = p0.marks.filter((m) => m.kind === 'notch')
    const after = sq([
      { type: 'setSeamAllowance', pieceId: 'sq', segmentIds: ['s.right'], mm: 17 },
      { type: 'addNotch', pieceId: 'sq', segmentId: 's.right', atRatio: 0.25 },
      { type: 'addNotch', pieceId: 'sq', segmentId: 's.right', atRatio: 0.8 },
      { type: 'addNotch', pieceId: 'sq', segmentId: 's.top', atMm: 30 },
      { type: 'splitSegment', pieceId: 'sq', segmentId: 's.right', atRatio: 0.5 },
      { type: 'splitSegment', pieceId: 'sq', segmentId: 's.top', atRatio: 0.5 },
    ])
    expect(after.issues).toEqual([])
    const p = pieceOf(after.pattern.pieces, 'sq')
    expect(p.allowance['s.right~1']).toBe(17)
    expect(p.allowance['s.right~2']).toBe(17)
    expect(p.allowance['s.right']).toBeUndefined()
    const notches = p.marks.filter((m) => m.kind === 'notch')
    expect(notches.map((m) => m.data?.segment)).toEqual(['s.right~1', 's.right~2', 's.top~1'])
    expect(notches[0].data?.atRatio).toBeCloseTo(0.5, 9)
    expect(notches[1].data?.atRatio).toBeCloseTo(0.6, 9)
    expect(notches[2].data?.atMm).toBe(30)
    notches.forEach((m, i) => expect(distance(m.at, notches0[i].at)).toBeLessThan(1e-6))
  })

  it('setCurveHandles and convertSegment', () => {
    const { pattern, issues } = sq([
      { type: 'setCurveHandles', pieceId: 'sq', segmentId: 's.top', c1: { x: 20, y: -15 } },
      { type: 'convertSegment', pieceId: 'sq', segmentId: 's.right', to: 'line' },
    ])
    expect(issues).toEqual([])
    const p = pieceOf(pattern.pieces, 'sq')
    const top = p.segments['s.top']
    expect(top.kind).toBe('cubic')
    if (top.kind === 'cubic') {
      expect(top.p1).toEqual({ x: 20, y: -15 })
      expect(top.p3).toEqual({ x: 100, y: 0 })
    }
    expect(p.segments['s.right'].kind).toBe('line')
    const back = sq([{ type: 'convertSegment', pieceId: 'sq', segmentId: 's.top', to: 'curve' }])
    expect(pieceOf(back.pattern.pieces, 'sq').segments['s.top'].kind).toBe('cubic')
  })
})

describe('internal lines and splitPiece', () => {
  it('addInternalLine + splitPiece: areas add up, the cut is an edge of both pieces', () => {
    const before = pieceOf(sq([]).pattern.pieces, 'sq')
    const setup: Operation[] = [
      ...extract,
      ...ops(
        { type: 'addNotch', pieceId: 'sq', segmentId: 's.top', atRatio: 0.2 },
        { type: 'addNotch', pieceId: 'sq', segmentId: 's.bottom', atRatio: 0.2 },
        {
          type: 'addTextMark',
          pieceId: 'sq',
          text: 'arriba',
          at: { segmentId: 's.top', ratio: 0.5, offsetMm: 10 },
        },
      ),
      {
        id: 'line1',
        type: 'addInternalLine',
        pieceId: 'sq',
        from: { segmentId: 's.left', atRatio: 0.6 },
        to: { segmentId: 's.right', atRatio: 0.4 },
        kind: 'line',
      },
    ]
    const lined = replay(square(), setup)
    expect(lined.issues).toEqual([])
    expect(pieceOf(lined.pattern.pieces, 'sq').segments.line1.role).toBe('seam')
    const r = replay(square(), [
      ...setup,
      ...ops({ type: 'splitPiece', pieceId: 'sq', lineId: 'line1' }),
    ])
    expect(r.issues).toEqual([])
    expect(r.pattern.pieces.map((p) => p.id)).toEqual(['sq~a', 'sq~b'])
    const [a, b] = r.pattern.pieces
    const total = area(before)
    expect(Math.abs(area(a) + area(b) - total) / total).toBeLessThan(0.001)
    for (const p of [a, b]) {
      expect(p.outline.some((x) => x.segment === 'line1')).toBe(true)
      expect(p.segments.line1.role).toBe('seam')
      expect(p.allowance.line1).toBe(10)
      expect(isContinuous(pieceLocalPath(p), 1e-6)).toBe(true)
      // Every piece has a grainline whose segment it owns.
      const g = p.marks.find((m) => m.kind === 'grainline')!
      expect(p.segments[g.data?.segment as string]).toBeDefined()
    }
    // ~a runs from the line's start forward: up the left edge, the top, down the right edge.
    const notchSeg = (p: PatternPiece) =>
      p.marks.filter((m) => m.kind === 'notch').map((m) => m.data?.segment)
    expect(notchSeg(a)).toEqual(['s.top'])
    expect(notchSeg(b)).toEqual(['s.bottom'])
    expect(a.marks.some((m) => m.kind === 'text')).toBe(true)
    expect(b.marks.some((m) => m.kind === 'text')).toBe(false)
  })

  it('men bodice: the back splits along the yoke line in every size', () => {
    for (const size of ['40', '48', '54']) {
      const base = pieceOf(run(MEN_BODICE_BLOCK, size, extract).pattern.pieces, 'back')
      const { pattern, issues } = run(MEN_BODICE_BLOCK, size, [
        ...extract,
        ...ops({ type: 'splitPiece', pieceId: 'back', lineId: 'back.yoke' }),
      ])
      expect(issues, size).toEqual([])
      const a = pieceOf(pattern.pieces, 'back~a')
      const b = pieceOf(pattern.pieces, 'back~b')
      const total = area(base)
      expect(Math.abs(area(a) + area(b) - total) / total).toBeLessThan(0.001)
      // Both halves keep the centre back on the fold.
      expect(a.onFold && b.onFold).toBe(true)
      // The armhole notch goes to the piece whose outline it lies on.
      const notchIn = [a, b].filter((p) => p.marks.some((m) => m.id === 'back.notch.armhole'))
      expect(notchIn).toHaveLength(1)
    }
  })

  it('rejects a line that does not reach the outline', () => {
    const r = replay(square(), [
      ...extract,
      {
        id: 'l1',
        type: 'addInternalLine',
        pieceId: 'sq',
        from: { piecePointMm: { x: 20, y: 20 } },
        to: { piecePointMm: { x: 80, y: 60 } },
        kind: 'curve',
      },
      ...ops({ type: 'splitPiece', pieceId: 'sq', lineId: 'l1' }),
    ])
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0].message).toMatch(/no llega al contorno/)
    expect(r.pattern.pieces.map((q) => q.id)).toEqual(['sq'])
    expect(pieceOf(r.pattern.pieces, 'sq').segments.l1.kind).toBe('cubic')
  })
})

describe('validators of the F4c operations', () => {
  const valid: Record<string, Record<string, unknown>> = {
    closeDart: { pieceId: 'front', dartId: 'd' },
    transferDart: {
      pieceId: 'front',
      dartId: 'd',
      toSegmentId: 's',
      atRatio: 0.5,
      keepPercent: 30,
    },
    dartToGather: { pieceId: 'front', dartId: 'd' },
    setDartApex: { pieceId: 'front', dartId: 'd', shortenMm: 20 },
    movePoint: { pieceId: 'p', point: { segmentId: 's', end: 'end' }, deltaMm: { x: 1, y: 2 } },
    setCurveHandles: { pieceId: 'p', segmentId: 's', c2: { x: 1, y: 2 } },
    convertSegment: { pieceId: 'p', segmentId: 's', to: 'curve' },
    splitSegment: { pieceId: 'p', segmentId: 's', atRatio: 0.5 },
    removePoint: { pieceId: 'p', point: 'A3' },
    addInternalLine: {
      pieceId: 'p',
      from: 'A2',
      to: { segmentId: 's', atRatio: 1 },
      kind: 'curve',
      handles: { c1: { x: 1, y: 0 }, c2: { x: 0, y: 1 } },
    },
    splitPiece: { pieceId: 'p', lineId: 'l' },
  }
  const invalid: Record<string, Record<string, unknown>> = {
    closeDart: { pieceId: 'front' },
    transferDart: { pieceId: 'front', dartId: 'd', toSegmentId: 's', atRatio: 1.5 },
    dartToGather: { dartId: 'd' },
    setDartApex: { pieceId: 'front', dartId: 'd', shortenMm: -3 },
    movePoint: { pieceId: 'p', point: { segmentId: 's', end: 'middle' }, deltaMm: { x: 1, y: 2 } },
    setCurveHandles: { pieceId: 'p', segmentId: 's' },
    convertSegment: { pieceId: 'p', segmentId: 's', to: 'arc' },
    splitSegment: { pieceId: 'p', segmentId: 's', atRatio: 1 },
    removePoint: { pieceId: 'p', point: 7 },
    addInternalLine: { pieceId: 'p', from: 'A2', to: { piecePointMm: { x: 'a' } }, kind: 'line' },
    splitPiece: { pieceId: 'p' },
  }
  it.each(Object.keys(valid))('%s', (type) => {
    expect(operationProblem({ id: 'x', type, ...valid[type] })).toBeNull()
    expect(isOperation({ id: 'x', type, ...invalid[type] })).toBe(false)
  })
  it('covers every new operation type', () => {
    expect(Object.keys(valid).sort()).toEqual(Object.keys(invalid).sort())
    expect(Object.keys(valid)).toHaveLength(11)
  })
})

describe('transferDart is a rigid pivot (regressions)', () => {
  const cases = [
    { target: 'front.shoulder', ratio: 0.5, options: {} },
    { target: 'front.neck', ratio: 0.5, options: {} },
    { target: 'front.waist', ratio: 0.3, options: { length: 'waist' } },
  ] as const
  const len = (p: PatternPiece, id: string) => segmentLength(stripMeta(p.segments[id]))
  const sumRole = (p: PatternPiece, role: string) =>
    p.outline
      .filter((r) => p.segments[r.segment].role === role)
      .reduce((a, r) => a + len(p, r.segment), 0)
  const ctrl = (s: Segment): Vec[] => (s.kind === 'line' ? [s.p0, s.p1] : [s.p0, s.p1, s.p2, s.p3])

  for (const size of ['6', '10', '16'])
    for (const c of cases)
      it(`size ${size}: bust dart to ${c.target}`, () => {
        const before = pieceOf(run(WOMEN, size, extract, c.options).pattern.pieces, 'front')
        const { pattern, issues } = run(
          WOMEN,
          size,
          [
            ...extract,
            ...ops({
              type: 'transferDart',
              pieceId: 'front',
              dartId: 'front.bustDart',
              toSegmentId: c.target,
              atRatio: c.ratio,
            }),
          ],
          c.options,
        )
        expect(issues).toEqual([])
        const p = pieceOf(pattern.pieces, 'front')
        // Armhole length unchanged.
        expect(Math.abs(sumRole(p, 'armhole') - sumRole(before, 'armhole'))).toBeLessThan(0.1)
        // Side seam: the old legs meet, upper + lower side unchanged, nothing in between.
        expect(distance(p.points.A36, p.points.A38)).toBeLessThan(0.01)
        const side = (q: PatternPiece) => len(q, 'front.side') + len(q, 'front.sideLower')
        expect(Math.abs(side(p) - side(before))).toBeLessThan(0.01)
        const ids = p.outline.map((r) => r.segment)
        const at = (id: string) => ids.indexOf(id)
        const next = (id: string) => ids[(at(id) + 1) % ids.length]
        expect(next('front.sideLower')).toBe('front.side')
        expect(next('front.side')).toBe('front.armhole.2')
        // No bridging edge: only the target's halves and the new dart's opening are new.
        const known = new Set([
          ...before.outline.map((r) => r.segment),
          `${c.target}~1`,
          `${c.target}~2`,
          'front.bustDart~t.open',
        ])
        expect(ids.filter((id) => !known.has(id))).toEqual([])
        expect(ids.some((id) => id.includes('~gap'))).toBe(false)
        // Every surviving segment is the original either unmoved or rotated about the apex by
        // the dart angle (a rigid motion).
        const P = before.points.A34
        const theta = angleBetween(sub(before.points.A36, P), sub(before.points.A38, P))
        let turned = 0
        for (const id of ids) {
          if (!before.segments[id]) continue
          const a = ctrl(stripMeta(before.segments[id]))
          const b = ctrl(stripMeta(p.segments[id]))
          expect(len(p, id)).toBeCloseTo(len(before, id), 6)
          const same = a.every((q, i) => distance(q, b[i]) < 1e-6)
          const rotated = [theta, -theta].some((t) =>
            a.every((q, i) => distance(rotate(q, t, P), b[i]) < 1e-6),
          )
          expect(same || rotated, id).toBe(true)
          if (rotated && !same) turned++
        }
        expect(turned).toBeGreaterThan(0)
      })
})

describe('closeDart opens its angle on a chosen edge, never on a fold', () => {
  it('without a target the bodice bust dart spreads at the hem, not on the centre front', () => {
    const { pattern, issues } = run(WOMEN, '10', [
      ...extract,
      ...ops({ type: 'closeDart', pieceId: 'front', dartId: 'front.bustDart' }),
    ])
    expect(issues).toEqual([])
    const p = pieceOf(pattern.pieces, 'front')
    expect(p.segments['front.bustDart~gap'].role).toBe('hem')
  })

  it('an explicit target is used; a fold edge is refused', () => {
    const ok = run(WOMEN, '10', [
      ...extract,
      ...ops({
        type: 'closeDart',
        pieceId: 'front',
        dartId: 'front.bustDart',
        toSegmentId: 'front.shoulder',
        atRatio: 0.5,
      }),
    ])
    expect(ok.issues).toEqual([])
    expect(pieceOf(ok.pattern.pieces, 'front').segments['front.bustDart~gap'].role).toBe('shoulder')
    const bad = run(WOMEN, '10', [
      ...extract,
      ...ops({
        type: 'closeDart',
        pieceId: 'front',
        dartId: 'front.bustDart',
        toSegmentId: 'front.cf',
        atRatio: 0.5,
      }),
    ])
    expect(bad.issues).toHaveLength(1)
  })
})
